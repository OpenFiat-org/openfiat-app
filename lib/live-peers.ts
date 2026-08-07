import { nodeRpc } from "@/lib/node-rpc";

/**
 * Who a node is actually talking to, from `getPeers`.
 *
 * # The sentence this removes
 *
 * `/network` has carried this caveat for as long as it has been real:
 * "Peer count and version are still absent because no method this app
 * calls reports them." The node has answered both the whole time.
 * `getPeers` is the method, and it reports rather more — each peer's
 * declared roles, the OFS numbers it speaks, when this node last heard
 * from it, and this node's own count of exchanges that worked and did
 * not.
 *
 * # One node's view, and never presented as the network's
 *
 * Everything here is the *answering* node's discovery cache. Two honest
 * nodes will disagree about the peer list, about latency, and about
 * `successes`/`failures` — the node's own doc comment says so in as many
 * words, and explains that it declines to fold those two counters into a
 * health score for exactly that reason. This module does not invent the
 * score either. Callers must attribute the answer to the node they asked.
 *
 * # What a peer says about itself, and what was measured
 *
 * `node_version`, `roles` and `supported_ofs` come off the peer's own
 * handshake: claims, like everything under Claims on the network table.
 * `last_seen`, `latency_ms`, `successes` and `failures` are this node's
 * observations. They are kept in separate fields here so a view cannot
 * accidentally present one as the other.
 *
 * # And the one field that is neither
 *
 * `servedContent` is a third kind. It is not a claim and not a soft
 * measurement — it is the answering node having asked this peer for a
 * content address and got back bytes that hash to that CID's own digest,
 * which is not something a peer can fabricate: producing the bytes is
 * what having the content *means*. It is the only line in this whole
 * table an adversary cannot simply assert, and it is a real component of
 * what that node is paid.
 *
 * Two things a view must not get wrong about it, both structural rather
 * than incidental:
 *
 * - **`false` is unproven, not disproven.** The node records passes and
 *   not failures, so a peer never challenged and a peer that failed a
 *   challenge are the same `false` here and cannot be separated. Render
 *   it as an absent proof, never as a bad mark.
 * - **It has one freshness bound, and it is coarse.** The flag is set
 *   once per reward epoch and cleared when the epoch rolls over — see
 *   {@link ContentProofWindow}. Inside the window it does not decay, so
 *   a peer that proved retrievability at the start of the epoch and has
 *   been dark since reads exactly like one answering now. Show the
 *   window with the flag or the flag says less than it appears to.
 */

/** A role a peer declares in its handshake. Free-form: the vocabulary grows. */
export type PeerRole = string;

/** One peer, exactly as `PeerView` in `openfiat-core`'s `rpc` crate carries it. */
export interface Peer {
  peerId: string;
  addresses: string[];
  /** The peer's own word for what it is running. */
  nodeVersion: string;
  /** OFS spec numbers the peer declares support for. */
  supportedOfs: number[];
  roles: PeerRole[];
  /** When the answering node last heard anything from it. */
  lastSeen: number;
  /**
   * Round-trip time as the answering node measured it, or `null` when it
   * has never had one to measure. Not zero — a peer never pinged and a
   * peer answering instantly are different facts.
   */
  latencyMs: number | null;
  successes: number;
  failures: number;
  /**
   * Whether the answering node has proven, inside
   * {@link PeerView.contentProofWindow}, that this peer serves content it
   * is asked for. Proven, not claimed — and `false` means unproven rather
   * than failed. See this module's doc comment.
   *
   * Optional because a node older than the field answers without it, and
   * "this node does not report content proofs" is a different state from
   * "this peer has none". A view that flattened the two would show a
   * whole peer table as unproven the moment it pointed at an older node.
   */
  servedContent?: boolean;
}

/**
 * The epoch a peer's `servedContent` is a statement about.
 *
 * The flag has no finer freshness than this: it is set once anywhere in
 * the epoch and reset when the epoch ends. Carried so a view can say how
 * stale a `true` may be instead of implying it is current.
 */
export interface ContentProofWindow {
  epoch: number;
  epochStartMillis: number;
  epochEndMillis: number;
}

export interface PeerView {
  /** The answering node's own peer id — the `/p2p/<id>` an entrypoint ends in. */
  selfPeerId: string;
  /** The addresses it asks peers to dial it at; empty when it announces none. */
  announcedAddresses: string[];
  peers: Peer[];
  /** Absent from nodes predating the content-proof field. */
  contentProofWindow?: ContentProofWindow;
}

interface RawPeer {
  peer_id: string;
  addresses: string[];
  node_version: string;
  supported_ofs: number[];
  roles: string[];
  last_seen: number;
  latency_ms: number | null;
  successes: number;
  failures: number;
  served_content?: boolean;
}

interface RawContentProofWindow {
  epoch: number;
  epoch_start_millis: number;
  epoch_end_millis: number;
}

interface RawPeerView {
  self_peer_id: string;
  announced_addresses: string[];
  peers: RawPeer[];
  content_proof_window?: RawContentProofWindow;
}

/**
 * One node's peer table.
 *
 * Throws when the node cannot be reached, deliberately: an empty peer list
 * is a real and alarming answer — a node connected to nobody — and must not
 * be produced by a failure to ask.
 *
 * Peers are ordered by peer id so two loads of the same page, and two
 * nodes' answers side by side, are comparable rather than reordering with
 * whatever the discovery cache iterated first.
 */
export async function fetchPeers(endpoint: string): Promise<PeerView> {
  const raw = await nodeRpc<RawPeerView>(endpoint, "getPeers");
  const window = raw.content_proof_window;
  return {
    selfPeerId: raw.self_peer_id,
    announcedAddresses: raw.announced_addresses ?? [],
    peers: (raw.peers ?? [])
      .map((peer) => ({
        peerId: peer.peer_id,
        addresses: peer.addresses ?? [],
        nodeVersion: peer.node_version,
        supportedOfs: peer.supported_ofs ?? [],
        roles: peer.roles ?? [],
        lastSeen: peer.last_seen,
        latencyMs: peer.latency_ms,
        successes: peer.successes,
        failures: peer.failures,
        // Left `undefined` rather than defaulted to `false`, so an older
        // node that does not report proofs at all is distinguishable from
        // one reporting that it has none.
        servedContent: peer.served_content,
      }))
      .sort((a, b) => a.peerId.localeCompare(b.peerId)),
    contentProofWindow: window && {
      epoch: window.epoch,
      epochStartMillis: window.epoch_start_millis,
      epochEndMillis: window.epoch_end_millis,
    },
  };
}

/**
 * How a peer's content proof reads, or `null` when the answering node
 * reports none at all.
 *
 * Three outcomes and not two, for the same reason the node keeps them
 * apart: `null` is "this node does not report proofs", `false` is "no
 * proof for this peer" — which is not a failed challenge — and `true` is
 * the one thing here that was actually verified.
 */
export function contentProof(peer: Peer): string | null {
  if (peer.servedContent === undefined) return null;
  return peer.servedContent ? "served content (verified)" : "no proof this epoch";
}

/**
 * How an exchange record reads, or `null` when there is nothing to read.
 *
 * Deliberately not a percentage. Zero of zero exchanges is not 0% reliable
 * and not 100% — it is a peer this node has not tried to reach yet, which
 * is the ordinary state for a peer discovered a minute ago. A ratio would
 * turn that into a verdict.
 */
export function exchangeRecord(peer: Peer): { successes: number; failures: number } | null {
  const total = peer.successes + peer.failures;
  if (total === 0) return null;
  return { successes: peer.successes, failures: peer.failures };
}
