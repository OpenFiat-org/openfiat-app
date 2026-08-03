import bs58 from "bs58";

import { nodeRpc } from "@/lib/node-rpc";

/**
 * What a node observed of its peers over one reward epoch (OFS-4100 §9).
 *
 * # Why this is publishable at all
 *
 * Because §9.4 makes it the point: a schedule anyone can recompute is a
 * schedule whose author can be checked. `crates/rpc/src/methods/rewards.rs`
 * says it plainly — "Two nodes that disagree here are visible, where two
 * nodes each computing privately would not be." An operator who thinks they
 * were underpaid has somewhere to look, and can look at more than one node.
 *
 * # There is no amount here, and this app must not produce one
 *
 * The node deliberately exposes no `getRewardSchedule`. Turning observations
 * into amounts needs every candidate's on-chain stake, the dispatch is
 * synchronous, and — quoting the same file — "a method that answered anyway
 * would return an empty schedule every time while looking like a working
 * endpoint." Multiplying these basis points into a token figure in the
 * browser would be that method, reimplemented somewhere with even less
 * claim to be authoritative. So this module carries the two measurements
 * and the multiplier they imply, and stops there.
 *
 * # Availability is measured; connectivity is claimed-and-plausible
 *
 * They are not the same kind of fact and are not presented as one.
 *
 * Availability is presence-per-slice: in each slice of the epoch, was
 * anything at all heard signed by this peer? It saturates at one per slice
 * on purpose, so flooding earns nothing and losing a propagation race costs
 * nothing.
 *
 * Connectivity is whether the peer was seen originating a chain-bridge
 * announcement, which earns the higher of two multipliers. `openfiat-rewards`
 * is explicit that this is spoofable — a gossip-only node can re-announce a
 * `(blockhash, slot)` it heard from somebody else under its own signature,
 * and nothing in the envelope distinguishes that. OFS-4100 §9.2 says the
 * problem is "not solved by this specification". The floor for gossip-only
 * nodes limits what the lie is worth rather than preventing it. Anything
 * rendering this must not tick it.
 *
 * # One node's ledger, and it is nobody else's
 *
 * `LivenessLedger` is documented as "One epoch's observations, as seen by
 * this node and no other." An operator reading their own node's answer is
 * reading what *they* saw of everyone else — not what the network saw of
 * them. Finding out the latter means asking somebody else's node, which is
 * exactly why the method is public.
 */

/** What one node observed of one peer across one epoch. */
export interface ObservedPeer {
  /**
   * The peer, in this app's canonical base58 spelling.
   *
   * The node sends hex here — `rewards.rs` says so, to keep a base58
   * dependency out of that module — while every other identifier it sends
   * is base58. Converted once, here, so an operator recognises their own
   * node in this table and can match it against `/network`. Left as the
   * raw hex if it is not
   * a decodable byte string, because a mangled id is better shown as
   * received than silently re-encoded into a different peer.
   */
  peer: string;
  /** Fraction of the epoch's slices this peer was heard in, in basis points. */
  availabilityBps: number;
  /** The §9.2 multiplier this peer earned, in basis points. */
  connectivityBps: number;
  /** Whether a chain-bridge announcement was seen from it. Claimed, not proven. */
  announcedBlockhash: boolean;
}

export interface EpochObservations {
  epoch: number;
  epochStartMillis: number;
  epochEndMillis: number;
  /** Ordered by peer, as the node ordered them, so two nodes' answers line up. */
  peers: ObservedPeer[];
}

interface RawObservedPeer {
  peer: string;
  availability_bps: number;
  connectivity_bps: number;
  announced_blockhash: boolean;
}

interface RawEpochObservations {
  epoch: number;
  epoch_start_millis: number;
  epoch_end_millis: number;
  peers: RawObservedPeer[];
}

/** Hex bytes to the base58 spelling the rest of this app uses, or the input. */
export function base58Peer(hex: string): string {
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) return hex;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  try {
    return bs58.encode(bytes);
  } catch {
    return hex;
  }
}

/**
 * One epoch's observations from one node.
 *
 * `epoch` omitted asks for the most recently completed one, which is the
 * only one worth asking about — the node's own parameter documentation says
 * the in-flight epoch's answer "would change under the caller".
 *
 * Throws when the node cannot be reached. An epoch with no peers in it is a
 * real answer, and an alarming one for an operator who expected to be paid:
 * it means this node heard from nobody, or that the epoch has been pruned
 * after payment. Neither may be produced by a failed request.
 */
export async function fetchRewardObservations(
  endpoint: string,
  epoch?: number,
): Promise<EpochObservations> {
  const raw = await nodeRpc<RawEpochObservations>(
    endpoint,
    "getRewardObservations",
    epoch === undefined ? {} : { epoch },
  );
  return {
    epoch: raw.epoch,
    epochStartMillis: raw.epoch_start_millis,
    epochEndMillis: raw.epoch_end_millis,
    peers: (raw.peers ?? []).map((peer) => ({
      peer: base58Peer(peer.peer),
      availabilityBps: peer.availability_bps,
      connectivityBps: peer.connectivity_bps,
      announcedBlockhash: peer.announced_blockhash,
    })),
  };
}

/** Basis points as a percentage string. 10 000 bps is 100%. */
export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;
}
