import bs58 from "bs58";
import { peerIdFromPublicKey } from "@openfiat/sdk";

/**
 * Encodes a wallet for the node's `wallet` RPC parameter.
 *
 * # The trap this exists to close
 *
 * Every OFS-8200 method taking a `wallet` runs it through `decode_peer_id`,
 * which is `base64 -> PeerId::from_bytes`. It wants **base64 of the PeerId
 * bytes**, not the base58 address a user sees and copies.
 *
 * Passing the base58 address does not fail. Base58's alphabet is a subset of
 * base64's, so the string decodes to some other byte sequence, becomes a
 * PeerId belonging to nobody, and the node truthfully reports that it knows
 * nothing about that identity. `getIdentityClaimsByWallet` returns `[]` and
 * `getReputation` returns an all-zero record — both indistinguishable from a
 * real wallet that has simply never done anything.
 *
 * That is the whole problem: the wrong encoding produces a plausible empty
 * answer rather than an error, so a caller sees "no history" and believes it.
 * It was caught by publishing a claim, reading it back, and getting zero
 * results for a claim that had definitely just been stored.
 *
 * Use this for every `wallet` parameter rather than passing an address
 * through by hand.
 */
export function walletParam(address: string): string {
  const peerId = peerIdFromPublicKey(bs58.decode(address));
  // btoa over a binary string: the browser has no Buffer, and
  // `String.fromCharCode(...bytes)` is safe at PeerId length.
  return typeof Buffer !== "undefined"
    ? Buffer.from(peerId).toString("base64")
    : btoa(String.fromCharCode(...peerId));
}
