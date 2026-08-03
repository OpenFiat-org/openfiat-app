import { nodeRpc } from "@/lib/node-rpc";

/**
 * What a node holds that another node could sync from (OFS-8100 §9/§18).
 *
 * # Why this is in a wallet app at all
 *
 * Because choosing an access node and running one are the same decision
 * seen from two sides, and both turn on this. An operator bringing a node
 * up needs to know a snapshot exists, who produced it, and how far behind
 * it is — the alternative is replaying the whole of history. Somebody
 * picking a node to trust wants the same figures for the opposite reason:
 * a node whose newest snapshot is a week old is a node that has been
 * offline for a week, and no health field says so.
 *
 * # The state root is not shown, and that is deliberate
 *
 * A snapshot carries a 32-byte `state_root`, and rendering it would look
 * like verification. It is not: nothing a browser can do establishes what
 * the correct state root at a slot *is*. `openfiat-snapshot`'s own import
 * path says as much — every signature and registration check "establish
 * that the bytes are what the announcer said, not that the announcer is
 * telling the truth", which is why a node's first snapshot must come from
 * a pinned anchor. So this module carries the producer, who is checkable
 * against the service registry, and leaves the digest to the node that
 * actually hashes the bytes.
 */

export interface Snapshot {
  id: string;
  /** The Solana slot the state was captured at. */
  slot: number;
  createdAt: number;
  /** The producing node's PeerId — look it up in the service registry. */
  producer: string;
  producerPublicKey: string;
  sizeBytes: number;
  compression: string;
  /** URLs the snapshot can be downloaded from. Empty is possible and real. */
  locations: string[];
  protocolVersion: number;
  snapshotVersion: number;
}

interface RawSnapshot {
  id: string;
  slot: number;
  created_at: number;
  producer: string;
  producer_public_key: string;
  size_bytes: number;
  compression: string;
  locations: string[];
  protocol_version: number;
  snapshot_version: number;
}

function toSnapshot(raw: RawSnapshot): Snapshot {
  return {
    id: raw.id,
    slot: raw.slot,
    createdAt: raw.created_at,
    producer: raw.producer,
    producerPublicKey: raw.producer_public_key,
    sizeBytes: raw.size_bytes,
    compression: raw.compression,
    locations: raw.locations ?? [],
    protocolVersion: raw.protocol_version,
    snapshotVersion: raw.snapshot_version,
  };
}

export interface SnapshotState {
  /** Newest first — which is the order somebody choosing one reads in. */
  snapshots: Snapshot[];
  /**
   * The node's own pick of which snapshot to hand a joiner.
   *
   * Asked for rather than derived from `snapshots`. Taking the highest
   * slot here would be this app deciding a question the node already
   * decides, and it is the node whose answer a joining operator will
   * actually receive.
   *
   * `null` when the node has announced none — an ordinary state for a
   * node that does not produce snapshots.
   */
  latest: Snapshot | null;
  /**
   * The slot of the most recent snapshot this node has *imported*, which
   * is where its own catch-up replay resumes from.
   *
   * A different question from `latest.slot`: that is the newest snapshot
   * the node knows about, this is the newest it has taken into its own
   * state. `null` for a node that has never imported one — including
   * every node that has been up since genesis and needed no snapshot,
   * so it is not a fault.
   */
  checkpointSlot: number | null;
}

/**
 * Everything one node can say about snapshots, in one round trip's worth
 * of parallel calls.
 *
 * Throws if any of the three fails. Partial answers are not offered on
 * purpose: a snapshot list with no checkpoint beside it invites the reader
 * to assume the node has imported nothing, which is a claim this would be
 * making out of a timeout.
 */
export async function fetchSnapshotState(endpoint: string): Promise<SnapshotState> {
  const [snapshots, latest, checkpointSlot] = await Promise.all([
    nodeRpc<RawSnapshot[]>(endpoint, "getSnapshots"),
    nodeRpc<RawSnapshot | null>(endpoint, "getLatestSnapshot"),
    nodeRpc<number | null>(endpoint, "getCheckpointSlot"),
  ]);
  return {
    snapshots: (snapshots ?? []).map(toSnapshot).sort((a, b) => b.slot - a.slot),
    latest: latest ? toSnapshot(latest) : null,
    checkpointSlot: checkpointSlot ?? null,
  };
}

/**
 * A byte count at the scale a snapshot actually comes in.
 *
 * Binary units, because that is what a download of one is measured in and
 * what an operator sizing a disk is thinking in.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/**
 * How many slots of history a joiner would replay after importing
 * `snapshot`, given the chain is at `headSlot`.
 *
 * `null` when either number is missing, rather than zero: "no gap" and "no
 * head slot to compare against" are opposite readings, and a gossip-only
 * access node routinely has the second.
 */
export function replayGap(snapshotSlot: number | null, headSlot: number | null): number | null {
  if (snapshotSlot === null || headSlot === null) return null;
  return Math.max(0, headSlot - snapshotSlot);
}
