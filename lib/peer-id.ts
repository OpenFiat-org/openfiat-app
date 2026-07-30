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
