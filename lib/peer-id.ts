import bs58 from "bs58";
import { peerIdFromPublicKey } from "@openfiat/sdk";

/**
 * A connected wallet's protocol identity, derived exactly as
 * `components/ads/merchant-console.tsx` first established: the wallet's
 * Ed25519 public key (a Solana address, base58-decoded) is the same key the
 * protocol's PeerId is a pure function of, so a connected wallet needs no
 * separate registration step to act as a merchant, requester, or disputant.
 *
 * Shared here rather than re-derived per component, now that `/orders` and
 * `/disputes` both need it alongside the merchant console.
 */
export function peerIdBytesForAddress(address: string): number[] {
  return Array.from(peerIdFromPublicKey(bs58.decode(address)));
}

export function peerIdHexForAddress(address: string): string {
  return peerIdBytesForAddress(address)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * A `PeerId`'s bytes as lowercase hex.
 *
 * One canonical spelling matters more than it looks: the placeholder avatar
 * is seeded from this string, so a component that formatted the same peer
 * differently would draw a different robot for the same counterparty.
 */
export function hexForPeerId(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The tail of a peer id — what a person actually recognises in a list. */
export function shortPeerHex(bytes: number[]): string {
  return `\u2026${hexForPeerId(bytes).slice(-6)}`;
}

/**
 * The multicodec header an Ed25519 PeerId carries before the key itself:
 * `0x00` identity multihash, length 36, then the protobuf `PublicKey`
 * message \u2014 field 1 (`Type`) = 1 (`Ed25519`), field 2 (`Data`) = 32 bytes.
 *
 * Spelled out rather than imported because the SDK only exports the forward
 * direction (`peerIdFromPublicKey`), and a wrong constant here would produce
 * a *valid-looking* Solana address belonging to nobody.
 */
const ED25519_PEER_ID_PREFIX = [0x00, 0x24, 0x08, 0x01, 0x12, 0x20];
const ED25519_PEER_ID_LEN = ED25519_PEER_ID_PREFIX.length + 32;

/**
 * The Solana address inside a PeerId, or `null` if there is not one.
 *
 * # Why this is sound, and why it is not a lookup table
 *
 * `peerIdFromPublicKey` is a prefix concatenated with the raw 32-byte
 * Ed25519 public key \u2014 it hashes nothing. A Solana address *is* that same
 * public key. So the merchant's wallet is not something this app looks up,
 * guesses, or resolves through a registry: it is already present in the
 * advertisement's `merchant` field, and this function reads it out.
 *
 * That distinction matters for what depends on it. A vault is keyed by
 * (merchant wallet, mint), and both halves now come straight off the
 * advertisement record \u2014 the merchant from here, the mint from `asset_mint`.
 * Nothing maps a *name* to either one. A symbol-to-mint table deciding which
 * tokens move is precisely the spoofing the mint-on-record change removed,
 * and none is introduced by this.
 *
 * Returns `null` for a PeerId that is not an Ed25519 identity key \u2014 an RSA
 * or secp256k1 peer, or a hashed (non-identity) multihash. Those have no
 * Solana address to extract, and inventing one would point a balance check
 * at an unrelated wallet.
 */
export function addressForPeerIdHex(hex: string): string | null {
  const clean = hex.trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(clean) || clean.length !== ED25519_PEER_ID_LEN * 2) return null;

  const bytes = new Uint8Array(ED25519_PEER_ID_LEN);
  for (let i = 0; i < ED25519_PEER_ID_LEN; i++) {
    bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  if (ED25519_PEER_ID_PREFIX.some((b, i) => bytes[i] !== b)) return null;

  return bs58.encode(bytes.subarray(ED25519_PEER_ID_PREFIX.length));
}
