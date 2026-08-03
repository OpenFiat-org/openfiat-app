// @vitest-environment node

import fs from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import {
  Keypair as SolanaKeypair,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { keypairFromSeed, sign, type Keypair } from "@openfiat/sdk";

import { escrow, getConnection } from "@/lib/onchain-config";
import { fetchAdvertisement } from "@/lib/live-advertisements";
import { fetchMyTrades, fetchTrade, type Trade } from "@/lib/live-trades";
import { publishAdvertisement } from "@/lib/merchant-ads";
import { nodeRpc } from "@/lib/node-rpc";
import { nodeUrl } from "@/lib/node-endpoint";
import {
  buildTransaction,
  fetchFeeConfig,
  fetchTradeEscrow,
  lockEscrowInstructions,
  relayRelease,
  releaseInstructions,
  tokenProgramForMint,
  type EscrowParties,
} from "@/lib/trade-escrow";
import {
  approveSettlement,
  initiateSettlement,
  newReservationId,
  submitPayment,
  submitReservation,
  tradeIdentity,
} from "@/lib/trade-flow";
import {
  encodePaymentDetails,
  fetchMyTradeChannel,
  generateChannelKey,
  grantChannelKey,
  postChannelEntry,
  readEntries,
} from "@/lib/trade-channel";
import { createVaultIx, depositIx } from "@/lib/vault-instructions";
import type { SolanaProvider } from "@/lib/wallet-connection";

/**
 * One whole trade, against a real node and real devnet, driven through this
 * app's own modules.
 *
 * Every other test here proves a shape. This proves the thing the shapes are
 * for: a taker reserves against a published advertisement, the merchant locks
 * tokens in an on-chain escrow, the taker declares payment, the merchant
 * approves on both sides, and the release is relayed through the node —
 * which then, on its own observation of the confirmation, moves the
 * settlement to `Completed` and records the signature. Nothing below asserts
 * a state this app put there; each check re-reads the node or the cluster.
 *
 * # Why it publishes its own advertisement instead of using a live one
 *
 * Because of the release, and this is worth stating rather than burying.
 * `release_escrow` pays the settlement fee into the four treasuries
 * `FeeConfig` names, and those are token accounts for **one** mint. Every
 * advertisement currently on the devnet node settles in a different one, so a
 * trade against any of them reaches `Approved` and then cannot be released —
 * the runtime rejects the transfer on a mint mismatch. `releasableMint` in
 * `lib/trade-escrow.ts` is what warns a taker about that before they order;
 * this test sidesteps it by trading in the mint the treasuries actually hold.
 *
 * # What plays the wallet
 *
 * A local keypair behind the same `SolanaProvider` interface a browser
 * extension implements, so the modules under test are the ones the app runs —
 * not a second implementation written to agree with them. The buyer holds no
 * SOL at all and never needs any: every on-chain step in a trade is the
 * merchant's, including the permissionless release, which the merchant pays
 * for here.
 *
 *     NEXT_PUBLIC_OPENFIAT_NODE_URL=http://127.0.0.1:7080 \
 *     OPENFIAT_DEVNET_TRADE_KEYPAIR=~/.config/solana/id.json \
 *     npx vitest run tests/trade-devnet.live.test.ts
 *
 * Skipped without both. It publishes an advertisement and moves real devnet
 * tokens, so it must never run by accident.
 */

const KEYPAIR_PATH = process.env.OPENFIAT_DEVNET_TRADE_KEYPAIR ?? "";
const NODE = process.env.NEXT_PUBLIC_OPENFIAT_NODE_URL ?? "";
const ENABLED = KEYPAIR_PATH !== "" && NODE !== "";

/** The settlement mint the fee treasuries hold — the only one releasable. */
const SETTLEMENT_MINT = new PublicKey("SK1JEbfsjjTG2WELNirmM7iJVcdnwerqfF32kCnoWsM");
const DECIMALS = 6;
/** One whole token. Large enough that an 85 bps fee splits four ways without
 *  any share truncating to zero. */
const AMOUNT = 1_000_000n;
const FIAT = "KES";
const PRICE = { base_units: 129_500_000, decimals: 6 };

/** A local keypair wearing the interface a browser wallet implements. */
function walletFor(keypair: SolanaKeypair, protocolKey: Keypair): SolanaProvider {
  const connection = getConnection();
  return {
    connect: async () => ({ publicKey: { toString: () => keypair.publicKey.toBase58() } }),
    signMessage: async (message: Uint8Array) => ({
      signature: await sign(protocolKey, message),
    }),
    signTransaction: async (transaction: Transaction) => {
      transaction.sign(keypair);
      return transaction;
    },
    signAndSendTransaction: async (transaction: Transaction) => {
      transaction.sign(keypair);
      const signature = await connection.sendRawTransaction(transaction.serialize());
      return { signature };
    },
  };
}

async function confirm(signature: string): Promise<void> {
  const connection = getConnection();
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed",
  );
}

async function balanceOf(account: PublicKey, program: PublicKey): Promise<bigint> {
  try {
    return (await getAccount(getConnection(), account, "confirmed", program)).amount;
  } catch {
    return 0n;
  }
}

describe.skipIf(!ENABLED)("a whole trade, against a real node and devnet", () => {
  let merchantWallet: SolanaProvider;
  let merchantKey: SolanaKeypair;
  let merchantProtocol: Keypair;
  let buyerWallet: SolanaProvider;
  let buyerKey: SolanaKeypair;
  let buyerProtocol: Keypair;
  let tokenProgram: PublicKey;

  beforeAll(async () => {
    merchantKey = SolanaKeypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR_PATH.replace(/^~/, process.env.HOME ?? "~"), "utf8")) as number[]),
    );
    merchantProtocol = await keypairFromSeed(merchantKey.secretKey.slice(0, 32));
    merchantWallet = walletFor(merchantKey, merchantProtocol);

    // The buyer is a fresh identity with no lamports. That is the point: a
    // taker's only on-chain involvement in a trade is receiving.
    buyerKey = SolanaKeypair.generate();
    buyerProtocol = await keypairFromSeed(buyerKey.secretKey.slice(0, 32));
    buyerWallet = walletFor(buyerKey, buyerProtocol);

    tokenProgram = await tokenProgramForMint(SETTLEMENT_MINT);
  }, 60_000);

  it(
    "reserves, funds escrow, declares payment, approves and releases",
    async () => {
      const merchant = tradeIdentity(merchantWallet, merchantKey.publicKey.toBase58());
      const buyer = tradeIdentity(buyerWallet, buyerKey.publicKey.toBase58());

      // --- the merchant's inventory, on chain and on the node ------------
      const merchantAta = getAssociatedTokenAddressSync(
        SETTLEMENT_MINT,
        merchantKey.publicKey,
        true,
        tokenProgram,
      );
      expect(
        await balanceOf(merchantAta, tokenProgram),
        "the merchant wallet holds none of the settlement mint",
      ).toBeGreaterThanOrEqual(AMOUNT);

      const [vaultAddress] = escrow.liquidityVaultPda(merchantKey.publicKey, SETTLEMENT_MINT);
      const vaultExists = (await getConnection().getAccountInfo(vaultAddress)) !== null;
      const stock = await buildTransaction(merchantKey.publicKey, [
        ...(vaultExists
          ? []
          : [createVaultIx(merchantKey.publicKey, SETTLEMENT_MINT, tokenProgram)]),
        depositIx(merchantKey.publicKey, SETTLEMENT_MINT, merchantAta, AMOUNT, tokenProgram),
      ]);
      await confirm((await merchantWallet.signAndSendTransaction(stock.transaction)).signature);

      // A rail the node genuinely lists for this corridor, asked for rather
      // than written down — and an id, never a display name.
      const catalogue = await nodeRpc<{ suggested: { id: string }[] }>(
        nodeUrl(),
        "getPaymentMethods",
        { country: "KE" },
      );
      const rail = catalogue.suggested[0]!.id;

      const adId = await publishAdvertisement(
        { provider: merchantWallet, publicKey: merchant.publicKey },
        {
          assetMint: SETTLEMENT_MINT.toBase58(),
          direction: "Sell",
          fiatCurrency: FIAT,
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
      expect(ad!.priceAmount).toEqual(PRICE);

      // --- the taker reserves -------------------------------------------
      const reservationId = newReservationId();
      await submitReservation(buyer, {
        reservationId,
        advertisementId: adId,
        amount: { base_units: Number(AMOUNT), decimals: DECIMALS },
        // Verbatim from the node's own quote: `PricingModel::agrees_with`
        // compares base unit for base unit and does not consult any oracle.
        agreedPrice: ad!.priceAmount!,
        agreedMid: ad!.midRate,
      });

      // The public read is redacted, so it proves the state and not the
      // parties; the gated read proves the parties. Both are asserted,
      // because a client that could only see one of them could not tell a
      // reservation it made from anybody else's.
      const reservedPublicly = await fetchTrade(reservationId);
      expect(reservedPublicly!.reservation.state).toBe("EscrowLocked");
      expect(reservedPublicly!.reservation).not.toHaveProperty("requester");

      const reserved = await mineOf(buyer.peerId, reservationId, buyerKey, buyerWallet);
      expect(reserved.reservation.requester).toBe(buyer.peerId);
      expect(reserved.settlement).toBeNull();

      const settlementId = crypto.randomUUID();
      await initiateSettlement(buyer, {
        settlementId,
        reservationId,
        seller: ad!.merchantPeerId,
        sellerPublicKey: ad!.merchantPublicKey,
        amount: { base_units: Number(AMOUNT), decimals: DECIMALS },
      });

      const opened = await mineOf(buyer.peerId, reservationId, buyerKey, buyerWallet);
      expect(opened.settlement!.state).toBe("AwaitingPayment");
      expect(opened.settlement!.buyer).toBe(buyer.peerId);
      expect(opened.settlement!.seller).toBe(merchant.peerId);

      // --- the merchant locks the tokens --------------------------------
      const parties: EscrowParties = {
        reservationId: BigInt(reservationId),
        mint: SETTLEMENT_MINT,
        tokenProgram,
        merchant: merchantKey.publicKey,
        buyer: buyerKey.publicKey,
        amount: AMOUNT,
      };
      const fees = await fetchFeeConfig();
      const lock = await buildTransaction(
        merchantKey.publicKey,
        lockEscrowInstructions(parties, fees.timeoutSecs),
      );
      await confirm((await merchantWallet.signAndSendTransaction(lock.transaction)).signature);

      const funded = await fetchTradeEscrow(parties.reservationId);
      expect(funded, "no trade escrow exists after funding it").not.toBeNull();
      expect(funded!.state).toBe("AwaitingFiatSettlement");
      expect(funded!.amount).toBe(AMOUNT);
      expect(funded!.buyer.toBase58()).toBe(buyerKey.publicKey.toBase58());
      expect(funded!.approved).toBe(false);
      // Read separately from the program's own counters, so the two agreeing
      // is evidence rather than a tautology.
      const [escrowTokens] = escrow.tradeEscrowTokensPda(parties.reservationId);
      expect(await balanceOf(escrowTokens, tokenProgram)).toBe(AMOUNT);

      // --- the trade channel --------------------------------------------
      const channelKey = generateChannelKey();
      await grantChannelKey(
        merchant,
        settlementId,
        { peerId: buyer.peerId, publicKey: buyer.publicKey },
        channelKey,
      );
      await grantChannelKey(
        merchant,
        settlementId,
        { peerId: merchant.peerId, publicKey: merchant.publicKey },
        channelKey,
      );
      await postChannelEntry(
        merchant,
        settlementId,
        channelKey,
        "PaymentDetails",
        0,
        encodePaymentDetails({
          method: rail,
          fields: [{ label: "Phone number", value: "+254700000000" }],
          reference: reservationId,
        }),
      );

      const channel = await fetchMyTradeChannel(
        nodeUrl(),
        settlementId,
        merchantKey.publicKey.toBase58(),
        merchantWallet,
      );
      expect(channel.grants.map((g) => g.role)).toEqual(["Party", "Party"]);
      expect(channel.entries).toHaveLength(1);
      // The node stores the ciphertext and nothing else: the account number
      // must not be recoverable from the bytes it replicates.
      expect(
        Buffer.from(channel.entries[0]!.payload.ciphertext).includes("254700000000"),
      ).toBe(false);
      const opened_entries = readEntries(channel, [channelKey]);
      expect(opened_entries[0]!.sealed).toBe(false);
      expect(opened_entries[0]!.text).toContain("+254700000000");
      // And the same channel read with no key opens nothing, rather than
      // reporting an empty conversation.
      expect(readEntries(channel, [])[0]!.sealed).toBe(true);

      // --- the taker pays, the merchant approves -------------------------
      await submitPayment(buyer, settlementId, `ref-${reservationId}`);
      expect((await fetchTrade(reservationId))!.settlement!.state).toBe("PaymentSubmitted");

      await approveSettlement(merchant, settlementId);
      const approvedOffchain = await fetchTrade(reservationId);
      expect(approvedOffchain!.settlement!.state).toBe("Approved");
      // Approved is not completed, and the node says so: no signature yet.
      expect(approvedOffchain!.settlement!.escrow_release_signature).toBeNull();

      const approve = await buildTransaction(merchantKey.publicKey, [
        escrow.approveSettlementIx(merchantKey.publicKey, parties.reservationId),
      ]);
      await confirm((await merchantWallet.signAndSendTransaction(approve.transaction)).signature);
      expect((await fetchTradeEscrow(parties.reservationId))!.approved).toBe(true);

      // --- the release, through the node --------------------------------
      const before = {
        buyer: 0n,
        dev: await balanceOf(fees.devTreasury, tokenProgram),
        ecosystem: await balanceOf(fees.ecosystemTreasury, tokenProgram),
        infra: await balanceOf(fees.infraTreasury, tokenProgram),
        emergency: await balanceOf(fees.emergencyReserve, tokenProgram),
      };

      const plan = releaseInstructions(parties, fees, merchantKey.publicKey);
      const release = await buildTransaction(merchantKey.publicKey, plan.instructions);
      const signed = await merchantWallet.signTransaction!(release.transaction);
      await relayRelease(signed, settlementId);

      // The node marks a settlement `Completed` only once it has observed the
      // confirmation itself. Polling its answer is the whole assertion: this
      // test never tells it anything landed.
      const completed = await waitFor(
        async () => {
          const trade = await fetchTrade(reservationId);
          return trade?.settlement?.escrow_release_signature ? trade : null;
        },
        180_000,
      );
      expect(completed.settlement!.state).toBe("Completed");
      const signature = completed.settlement!.escrow_release_signature!;

      // The node's signature names a transaction anybody can read, so read it.
      const status = await getConnection().getSignatureStatus(signature, {
        searchTransactionHistory: true,
      });
      expect(status.value?.err, `the release the node recorded failed on chain`).toBeNull();

      const buyerAta = getAssociatedTokenAddressSync(
        SETTLEMENT_MINT,
        buyerKey.publicKey,
        true,
        tokenProgram,
      );
      const fee = (AMOUNT * BigInt(fees.settlementFeeBps)) / 10_000n;
      expect(await balanceOf(buyerAta, tokenProgram)).toBe(AMOUNT - fee);
      // Recomputed from the config's own basis points rather than copied out
      // of the program's output, with the truncation remainder swept to the
      // ecosystem treasury exactly as `compute_fee_split` does.
      const share = (bps: number) => (fee * BigInt(bps)) / 10_000n;
      const shares = {
        dev: share(fees.devTreasuryBps),
        ecosystem: share(fees.ecosystemTreasuryBps),
        infra: share(fees.infraTreasuryBps),
        emergency: share(fees.emergencyReserveBps),
      };
      shares.ecosystem +=
        fee - (shares.dev + shares.ecosystem + shares.infra + shares.emergency);
      expect(
        (await balanceOf(fees.devTreasury, tokenProgram)) - before.dev,
      ).toBe(shares.dev);
      expect(
        (await balanceOf(fees.ecosystemTreasury, tokenProgram)) - before.ecosystem,
      ).toBe(shares.ecosystem);
      expect(
        (await balanceOf(fees.infraTreasury, tokenProgram)) - before.infra,
      ).toBe(shares.infra);
      expect(
        (await balanceOf(fees.emergencyReserve, tokenProgram)) - before.emergency,
      ).toBe(shares.emergency);
      expect(before.buyer).toBe(0n);

      expect((await fetchTradeEscrow(parties.reservationId))!.state).toBe("Released");
    },
    600_000,
  );
});

/** One wallet's own copy of one trade, through the gated read. */
async function mineOf(
  _peerId: string,
  reservationId: string,
  key: SolanaKeypair,
  provider: SolanaProvider,
): Promise<Trade> {
  const mine = await fetchMyTrades(nodeUrl(), key.publicKey.toBase58(), provider);
  const trade = mine.find((t) => t.reservation.id === reservationId);
  if (!trade) throw new Error(`getMyTrades did not return ${reservationId}`);
  return trade;
}

/** Polls `read` until it answers with something, or gives up loudly. */
async function waitFor<T>(read: () => Promise<T | null>, timeoutMs: number): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (value !== null) return value;
    if (Date.now() > deadline) {
      throw new Error(`nothing after ${timeoutMs}ms — the node never recorded the release`);
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
}
