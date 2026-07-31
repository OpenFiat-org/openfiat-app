import bs58 from "bs58";
import { peerIdFromPublicKey } from "@openfiat/sdk";

/**
 * A PeerId is a base58 string here, because that is what a node sends.
 *
 * It used to be `number[]`, mirroring the arrays the RPC layer produced,
 * with hex as the spelling used for display and comparison. The node now
 * renders every identifier as base58 — the `12D3Koo…` form that goes in an
 * `--entrypoint` and appears in its own startup log — so that is the one
 * canonical spelling, and the hex detour is gone.
 *
 * One spelling matters more than it looks: the placeholder avatar is seeded
 * from this string, so two components formatting the same peer differently
 * would draw a different robot for the same counterparty. Avatars therefore
 * changed once when the spelling did.
 */

/**
 * A connected wallet's protocol identity, derived exactly as
 * `components/ads/merchant-console.tsx` first established: the wallet's
 * Ed25519 public key (a Solana address, base58-decoded) is the same key the
 * protocol's PeerId is a pure function of, so a connected wallet needs no
 * separate registration step to act as a merchant, requester, or disputant.
 */
export function peerIdForAddress(address: string): string | null {
  // Null rather than throwing, deliberately: this is called to label a row
  // or seed a badge, and anything that is not a real 32-byte key should
  // render nothing rather than break the page around it.
  try {
    const decoded = bs58.decode(address);
    if (decoded.length !== 32) return null;
    return bs58.encode(peerIdFromPublicKey(decoded));
  } catch {
    return null;
  }
}

/** The tail of a peer id — what a person actually recognises in a list. */
export function shortPeerId(peerId: string): string {
  return `…${peerId.slice(-6)}`;
}

/**
 * The multicodec header an Ed25519 PeerId carries before the key itself:
 * `0x00` identity multihash, length 36, then the protobuf `PublicKey`
 * message — field 1 (`Type`) = 1 (`Ed25519`), field 2 (`Data`) = 32 bytes.
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
 * Ed25519 public key — it hashes nothing. A Solana address *is* that same
 * public key. So the merchant's wallet is not something this app looks up,
 * guesses, or resolves through a registry: it is already present in the
 * advertisement's `merchant` field, and this function reads it out.
 *
 * That distinction matters for what depends on it. A vault is keyed by
 * (merchant wallet, mint), and both halves now come straight off the
 * advertisement record — the merchant from here, the mint from `asset_mint`.
 * Nothing maps a *name* to either one. A symbol-to-mint table deciding which
 * tokens move is precisely the spoofing the mint-on-record change removed,
 * and none is introduced by this.
 *
 * Returns `null` for a PeerId that is not an Ed25519 identity key — an RSA
 * or secp256k1 peer, or a hashed (non-identity) multihash. Those have no
 * Solana address to extract, and inventing one would point a balance check
 * at an unrelated wallet. Also `null` for anything that is not base58 at
 * all, since `bs58.decode` throws on the characters the alphabet omits.
 */
export function addressForPeerId(peerId: string): string | null {
  let bytes: Uint8Array;
  try {
    bytes = bs58.decode(peerId.trim());
  } catch {
    return null;
  }

  if (bytes.length !== ED25519_PEER_ID_LEN) return null;
  if (ED25519_PEER_ID_PREFIX.some((b, i) => bytes[i] !== b)) return null;

  return bs58.encode(bytes.subarray(ED25519_PEER_ID_PREFIX.length));
}
