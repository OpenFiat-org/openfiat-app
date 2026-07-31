import { Keypair, PublicKey } from "@solana/web3.js";
import { peerIdFromPublicKey } from "@openfiat/sdk";
import bs58 from "bs58";
import { describe, expect, it } from "vitest";
import { addressForPeerId, peerIdForAddress } from "@/lib/peer-id";
import { vaultCovers } from "@/components/wallet/use-vault-backing";
import type { LiveVault } from "@/lib/live-vaults";

/**
 * The two pieces of logic the vault-backing and seller-balance gates rest
 * on. Both were previously keyed on an asset ticker, so neither could check
 * anything; what makes them checkable is that a merchant's wallet is
 * recoverable from the PeerId on the record, and that a vault's `available`
 * is compared rather than its `total`.
 *
 * Getting either wrong fails silently in the expensive direction — one
 * points the balance check at the wrong wallet, the other approves a trade
 * against money that has already left.
 */

describe("addressForPeerId", () => {
  it("recovers the wallet from a PeerId the SDK produced, for many keys", () => {
    for (let i = 0; i < 100; i++) {
      const address = Keypair.generate().publicKey.toBase58();
      expect(addressForPeerId(peerIdForAddress(address)!)).toBe(address);
    }
  });

  it("agrees with the SDK's forward direction rather than reimplementing it", () => {
    const address = Keypair.generate().publicKey.toBase58();
    const fromSdk = peerIdFromPublicKey(bs58.decode(address));

    expect(fromSdk).toHaveLength(38);
    expect(addressForPeerId(bs58.encode(fromSdk))).toBe(address);
  });

  it("tolerates surrounding whitespace but not a change of case", () => {
    const address = Keypair.generate().publicKey.toBase58();
    const peerId = peerIdForAddress(address)!;

    expect(addressForPeerId(`  ${peerId}\n`)).toBe(address);

    // Case is significant in base58 — `a` and `A` are different digits — so
    // an upper-cased peer id is a different value, not the same one written
    // differently. Accepting it would resolve to some other wallet. This
    // encoding was hex until the node moved to base58, and hex *was*
    // case-insensitive, so the old behaviour is now a bug.
    expect(addressForPeerId(peerId.toUpperCase())).not.toBe(address);
  });

  /*
   * The rejections matter more than the acceptances. Every one of these
   * would otherwise yield a syntactically valid Solana address belonging to
   * somebody else, and the balance shown against an advertisement would be
   * an unrelated wallet's.
   */
  it("rejects a PeerId whose multicodec prefix is not Ed25519", () => {
    const address = Keypair.generate().publicKey.toBase58();
    const bytes = Buffer.from(bs58.decode(peerIdForAddress(address)!));
    // 0x08 0x01 is protobuf field 1 = Ed25519. 0x02 would be Secp256k1,
    // whose key is not a Solana address at all.
    bytes[3] = 0x02;

    expect(addressForPeerId(bs58.encode(bytes))).toBeNull();
  });

  it("rejects a hashed (non-identity) multihash", () => {
    const address = Keypair.generate().publicKey.toBase58();
    const bytes = Buffer.from(bs58.decode(peerIdForAddress(address)!));
    // 0x12 = sha2-256 rather than 0x00 = identity. The 32 bytes that follow
    // are a digest, not a public key.
    bytes[0] = 0x12;

    expect(addressForPeerId(bs58.encode(bytes))).toBeNull();
  });

  it("rejects wrong lengths and non-base58 input", () => {
    const peerId = peerIdForAddress(Keypair.generate().publicKey.toBase58())!;

    expect(addressForPeerId(peerId.slice(0, -2)), "truncated").toBeNull();
    expect(addressForPeerId(`${peerId}11`), "over-long").toBeNull();
    expect(addressForPeerId(""), "empty").toBeNull();
    // 0, O, I and l are the four characters base58 omits.
    expect(addressForPeerId("0OIl".repeat(10)), "non-base58").toBeNull();
    // A bare 32-byte key with no PeerId header is not a PeerId, and must not
    // be quietly accepted as one.
    expect(
      addressForPeerId(Keypair.generate().publicKey.toBase58()),
      "unprefixed key",
    ).toBeNull();
  });
});

function vault(fields: Partial<LiveVault> & { available: bigint; decimals: number }): LiveVault {
  const key = Keypair.generate().publicKey;
  return {
    address: key,
    merchant: key,
    mint: key,
    tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
    total: 0n,
    reserved: 0n,
    settled: 0n,
    pendingSettlement: 0n,
    ...fields,
  };
}

describe("vaultCovers", () => {
  it("measures against available, not total", () => {
    /*
     * The exact shape of the one vault live on devnet: everything ever
     * deposited has been traded away, so `total` is 2,000 and `available`
     * is 0. A check reading `total` would approve a 1,000-unit trade
     * against a vault that can fund nothing — which is the oversell this
     * whole gate exists to prevent.
     */
    const v = vault({ decimals: 6, available: 0n, total: 2_000_000_000n });

    expect(vaultCovers(v, "1000")?.covered).toBe(false);
    expect(vaultCovers(v, "0")?.covered).toBe(true);
  });

  it("does not count reserved, settled or pending as spendable", () => {
    const v = vault({
      decimals: 6,
      available: 10_000_000n, // 10
      reserved: 500_000_000n,
      settled: 900_000_000n,
      pendingSettlement: 700_000_000n,
      total: 2_100_000_000n,
    });

    expect(vaultCovers(v, "10")?.covered).toBe(true);
    expect(vaultCovers(v, "10.000001")?.covered).toBe(false);
  });

  it("scales by the mint's decimals rather than assuming six", () => {
    // 1 token on a 9-decimal mint is 1e9 base units. Assuming 6 would read
    // this vault as holding a thousand times what it does.
    const nine = vault({ decimals: 9, available: 1_000_000_000n });
    expect(vaultCovers(nine, "1")?.covered).toBe(true);
    expect(vaultCovers(nine, "1.000000001")?.covered).toBe(false);

    const zero = vault({ decimals: 0, available: 5n });
    expect(vaultCovers(zero, "5")?.covered).toBe(true);
    expect(vaultCovers(zero, "6")?.covered).toBe(false);
  });

  it("returns null for an amount the mint cannot represent", () => {
    const v = vault({ decimals: 2, available: 1_000_000n });

    // More precision than the mint has. Truncating would silently check a
    // different amount than the one that was typed.
    expect(vaultCovers(v, "1.005")).toBeNull();
    expect(vaultCovers(v, "")).toBeNull();
    expect(vaultCovers(v, "abc")).toBeNull();
  });

  it("reports the figures it compared, so a caller can render them", () => {
    const v = vault({ decimals: 6, available: 250_000n });
    const result = vaultCovers(v, "1.5");

    expect(result).toEqual({ covered: false, required: 1_500_000n, available: 250_000n });
  });
});
