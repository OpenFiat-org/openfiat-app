// @vitest-environment node

import { beforeAll, describe, expect, it } from "vitest";
import { Keypair as SolanaKeypair } from "@solana/web3.js";
import {
  derivationMessageBytes,
  deriveEncryptionKeypair,
  keypairFromSeed,
  openWithEncryptionKey,
  sign,
  type Keypair,
} from "@openfiat/sdk";

import { counterpartyEncryptionKey, enrol, forgetChannelIdentity } from "@/lib/channel-identity";
import { fetchIdentityClaims } from "@/lib/live-identity";
import { fetchAdvertisement } from "@/lib/live-advertisements";
import { publishAdvertisement } from "@/lib/merchant-ads";
import { nodeRpc } from "@/lib/node-rpc";
import { nodeUrl } from "@/lib/node-endpoint";
import {
  encodePaymentDetails,
  decodePaymentDetails,
  fetchMyTradeChannel,
  generateChannelKey,
  grantChannelKey,
  postChannelEntry,
  readEntries,
  recoverChannelKey,
} from "@/lib/trade-channel";
import {
  initiateSettlement,
  newReservationId,
  submitReservation,
  tradeIdentity,
} from "@/lib/trade-flow";
import type { SolanaProvider } from "@/lib/wallet-connection";

/**
 * Two different wallets exchanging payment details through a sealed channel
 * on a real node.
 *
 * This is the assertion the whole encryption-key change exists to make, and
 * it is the one that could not be made before it. A `KeyGrant` used to be
 * sealed to the recipient's Ed25519 wallet key; opening one needs that key's
 * secret scalar, which a browser wallet does not expose. So a merchant could
 * seal payment details that the buyer would never be able to read, and only
 * the tab that generated the channel key could open anything at all. The
 * feature was built, wired into the UI, and unusable between two real
 * people.
 *
 * Everything below is asserted from **both sides separately**, and the
 * buyer's client is given nothing the merchant's client produced. The buyer
 * re-derives their encryption key from their own wallet and recovers the
 * channel key from the grant the node holds — which is exactly what a second
 * device, or the same browser after a refresh, has to do.
 *
 * Deliberately off-chain only. Escrow, release and the on-chain half are
 * `tests/trade-devnet.live.test.ts`'s job and need devnet SOL and a funded
 * mint; what is under test here is the cryptography and the identity claim,
 * and mixing the two would mean this could only ever run on a machine with
 * a funded wallet.
 *
 *     NEXT_PUBLIC_OPENFIAT_NODE_URL=http://127.0.0.1:7099 \
 *     OPENFIAT_LIVE_CHANNEL=1 npx vitest run tests/trade-channel.live.test.ts
 *
 * Skipped without both, because it writes real records to whatever node it
 * is pointed at.
 */

const ENABLED =
  process.env.OPENFIAT_LIVE_CHANNEL === "1" &&
  (process.env.NEXT_PUBLIC_OPENFIAT_NODE_URL ?? "") !== "";

const ACCOUNT_NUMBER = "+254700000000";
const DECIMALS = 6;
const AMOUNT = 1_000_000;
const PRICE = { base_units: 129_500_000, decimals: 6 };

/** A local keypair wearing the interface a browser wallet implements. */
function walletFor(protocolKey: Keypair, address: string): SolanaProvider {
  return {
    connect: async () => ({ publicKey: { toString: () => address } }),
    signMessage: async (message: Uint8Array) => ({
      signature: await sign(protocolKey, message),
    }),
  } as unknown as SolanaProvider;
}

interface Party {
  address: string;
  protocol: Keypair;
  wallet: SolanaProvider;
}

async function party(): Promise<Party> {
  const solana = SolanaKeypair.generate();
  const address = solana.publicKey.toBase58();
  const protocol = await keypairFromSeed(solana.secretKey.slice(0, 32));
  return { address, protocol, wallet: walletFor(protocol, address) };
}

describe.skipIf(!ENABLED)("two wallets and a sealed channel, on a real node", () => {
  let merchant: Party;
  let buyer: Party;
  let outsider: Party;

  beforeAll(async () => {
    merchant = await party();
    buyer = await party();
    outsider = await party();
    forgetChannelIdentity();
  }, 60_000);

  it(
    "each opens what the other sealed, and a third party opens nothing",
    async () => {
      const seller = tradeIdentity(merchant.wallet, merchant.address);
      const taker = tradeIdentity(buyer.wallet, buyer.address);

      // --- both publish an encryption key --------------------------------
      const merchantEnc = await enrol(merchant.wallet, merchant.address);
      const buyerEnc = await enrol(buyer.wallet, buyer.address);

      // The claim really is on the node, is of the right type, and carries
      // what was derived. Read back rather than assumed: a claim the node
      // silently refused would leave every later step failing for a reason
      // that looks like a cryptographic one.
      const published = await fetchIdentityClaims(buyer.address);
      const keyClaims = published.filter((claim) => claim.type === "EncryptionKey");
      expect(keyClaims, "the node did not store the buyer's encryption key claim").toHaveLength(1);
      expect(keyClaims[0]!.revoked).toBe(false);

      // Each side finds the other by wallet alone, which is all a
      // counterparty has. Looked up, never passed across.
      const buyerPublished = await counterpartyEncryptionKey(buyer.address);
      const merchantPublished = await counterpartyEncryptionKey(merchant.address);
      expect(buyerPublished).not.toBeNull();
      expect(merchantPublished).not.toBeNull();
      expect(Array.from(buyerPublished!)).toEqual(Array.from(buyerEnc.publicKey));
      expect(Array.from(merchantPublished!)).toEqual(Array.from(merchantEnc.publicKey));
      // And a wallet that has not enrolled reads as exactly that, rather
      // than as some other key a caller might seal to by mistake.
      expect(await counterpartyEncryptionKey(outsider.address)).toBeNull();

      // --- a settlement for the channel to hang off ----------------------
      const catalogue = await nodeRpc<{ suggested: { id: string }[] }>(
        nodeUrl(),
        "getPaymentMethods",
        { country: "KE" },
      );
      const rail = catalogue.suggested[0]!.id;

      const adId = await publishAdvertisement(
        { provider: merchant.wallet, publicKey: seller.publicKey },
        {
          assetMint: "So11111111111111111111111111111111111111112",
          direction: "Sell",
          fiatCurrency: "KES",
          minTrade: 0.5,
          maxTrade: 5,
          initialLiquidity: 5,
          decimals: DECIMALS,
          pricing: { Fixed: { price: PRICE } },
          paymentMethods: [rail],
        },
      );
      const ad = await fetchAdvertisement(adId);
      expect(ad, "the node did not return the advertisement it just accepted").not.toBeNull();

      const reservationId = newReservationId();
      await submitReservation(taker, {
        reservationId,
        advertisementId: adId,
        amount: { base_units: AMOUNT, decimals: DECIMALS },
        agreedPrice: ad!.priceAmount!,
        agreedMid: ad!.midRate,
      });
      const settlementId = crypto.randomUUID();
      await initiateSettlement(taker, {
        settlementId,
        reservationId,
        seller: ad!.merchantPeerId,
        sellerPublicKey: ad!.merchantPublicKey,
        amount: { base_units: AMOUNT, decimals: DECIMALS },
      });

      // --- the merchant opens the channel and sends payment details ------
      const channelKey = generateChannelKey();
      await grantChannelKey(
        seller,
        settlementId,
        { peerId: taker.peerId, encryptionKey: buyerPublished! },
        channelKey,
      );
      await grantChannelKey(
        seller,
        settlementId,
        { peerId: seller.peerId, encryptionKey: merchantPublished! },
        channelKey,
      );
      await postChannelEntry(
        seller,
        settlementId,
        channelKey,
        "PaymentDetails",
        0,
        encodePaymentDetails({
          method: rail,
          fields: [{ label: "Phone number", value: ACCOUNT_NUMBER }],
          reference: reservationId,
        }),
      );

      // --- the buyer, holding nothing the merchant's client produced -----
      const buyersView = await fetchMyTradeChannel(
        nodeUrl(),
        settlementId,
        buyer.address,
        buyer.wallet,
      );
      expect(buyersView.grants).toHaveLength(2);
      // The node replicated the ciphertext and nothing else.
      expect(
        Buffer.from(buyersView.entries[0]!.payload.ciphertext).includes(ACCOUNT_NUMBER.slice(1)),
      ).toBe(false);

      const buyersKey = recoverChannelKey(buyersView, taker.peerId, buyerEnc);
      expect(buyersKey, "the buyer cannot open the grant the merchant sealed to them").not.toBeNull();
      expect(Array.from(buyersKey!)).toEqual(Array.from(channelKey));

      const asBuyer = readEntries(buyersView, [buyersKey!]);
      expect(asBuyer[0]!.sealed).toBe(false);
      expect(decodePaymentDetails(asBuyer[0]!.text!)!.fields[0]!.value).toBe(ACCOUNT_NUMBER);

      // --- the buyer answers, and the merchant reads it ------------------
      await postChannelEntry(taker, settlementId, buyersKey!, "Message", 0, "Sent, ref above.");

      const merchantsView = await fetchMyTradeChannel(
        nodeUrl(),
        settlementId,
        merchant.address,
        merchant.wallet,
      );
      // The merchant recovers from the grant too, rather than reusing the
      // key still in scope here — which is what makes the channel survive a
      // closed tab or a move to another device.
      const merchantsKey = recoverChannelKey(merchantsView, seller.peerId, merchantEnc);
      expect(Array.from(merchantsKey!)).toEqual(Array.from(channelKey));
      const reply = readEntries(merchantsView, [merchantsKey!]).find(
        (entry) => entry.author === taker.peerId,
      );
      expect(reply!.sealed).toBe(false);
      expect(reply!.text).toBe("Sent, ref above.");

      // --- and a third party, on the same replica, opens nothing ---------
      const outsiderEnc = deriveEncryptionKeypair(
        await sign(outsider.protocol, derivationMessageBytes()),
      );
      for (const grant of buyersView.grants) {
        expect(
          () => openWithEncryptionKey(outsiderEnc, grant.sealed_key),
          "a third party opened a grant addressed to a party",
        ).toThrow();
      }
      expect(recoverChannelKey(buyersView, taker.peerId, outsiderEnc)).toBeNull();
      expect(readEntries(buyersView, [])[0]!.sealed).toBe(true);

      // The node refuses to answer them at all, which is the other half:
      // the metadata is gated even though the content is encrypted.
      await expect(
        fetchMyTradeChannel(nodeUrl(), settlementId, outsider.address, outsider.wallet),
      ).rejects.toThrow();
    },
    180_000,
  );
});
