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
  return base64Of(peerIdFromPublicKey(bs58.decode(address)));
}

/**
 * The same parameter, for a peer this app knows only by its PeerId.
 *
 * Everything the protocol replicates about a counterparty names them by
 * PeerId — an advertisement carries `merchant`, a review carries `about` —
 * and never by the base58 address a person types. {@link walletParam}
 * derives one from the other and cannot be run backwards, so a caller
 * holding a PeerId has no address to give it.
 *
 * The spelling is base58, because that is what a node sends and what
 * `lib/peer-id.ts` fixed as this app's single canonical form. It was hex
 * here for as long as the node spelled it that way, and the two silently
 * diverged: `/^[0-9a-f]+$/` rejects `12D3KooW…` outright, so the merchant
 * directory's whole trading-record panel had been reporting "your access
 * node did not answer" for every merchant on the network. Nothing caught
 * it because the failure looks exactly like an unreachable node.
 *
 * Throws on anything that is not base58 rather than sending it. The node
 * answers an unrecognised PeerId with an all-zero profile — see this
 * module's own warning — so a malformed id would read as a real wallet
 * that has never traded.
 */
export function peerIdParam(peerId: string): string {
  const trimmed = peerId.trim();
  if (trimmed.length === 0) throw new Error("Not a base58 PeerId: (empty)");
  let bytes: Uint8Array;
  try {
    bytes = bs58.decode(trimmed);
  } catch {
    throw new Error(`Not a base58 PeerId: ${peerId}`);
  }
  if (bytes.length === 0) throw new Error(`Not a base58 PeerId: ${peerId}`);
  return base64Of(bytes);
}

function base64Of(bytes: Uint8Array): string {
  // btoa over a binary string: the browser has no Buffer, and
  // `String.fromCharCode(...bytes)` is safe at PeerId length.
  return typeof Buffer !== "undefined"
    ? Buffer.from(bytes).toString("base64")
    : btoa(String.fromCharCode(...bytes));
}
