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
}

export interface PeerView {
  /** The answering node's own peer id — the `/p2p/<id>` an entrypoint ends in. */
  selfPeerId: string;
  /** The addresses it asks peers to dial it at; empty when it announces none. */
  announcedAddresses: string[];
  peers: Peer[];
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
}

interface RawPeerView {
  self_peer_id: string;
  announced_addresses: string[];
  peers: RawPeer[];
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
      }))
      .sort((a, b) => a.peerId.localeCompare(b.peerId)),
  };
}

/**
 * How an exchange record reads, or `null` when there is nothing to read.
 *
 * Deliberately not a percentage. Zero of zero exchanges is not 0% reliable
 * and not 100% — it is a peer this node has not tried to reach yet, which
 * is the ordinary state for a peer discovered a minute ago. A ratio would
 * turn that into a verdict.
 */
export function exchangeRecord(peer: Peer): string | null {
  const total = peer.successes + peer.failures;
  if (total === 0) return null;
  return `${peer.successes} ok · ${peer.failures} failed`;
}
