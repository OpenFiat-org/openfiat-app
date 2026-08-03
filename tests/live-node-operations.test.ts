/**
 * The operator-facing node reads: `getPeers`, the snapshot methods, and
 * `getRewardObservations`.
 *
 * Every fixture below is shaped exactly like a live devnet node's answer,
 * checked against one before it was written down — including the two shapes
 * that are easy to get wrong from the OpenRPC document alone, which types
 * both of these results as a bare `object`: `getPeers` answers with an
 * envelope rather than an array, and `getRewardObservations` answers with an
 * epoch record rather than a list of peers.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const nodeRpc = vi.fn();

vi.mock("@/lib/node-rpc", () => ({
  nodeRpc: (...args: unknown[]) => nodeRpc(...args),
  NodeRpcError: class extends Error {},
}));

const { exchangeRecord, fetchPeers } = await import("@/lib/live-peers");
const { fetchSnapshotState, formatBytes, replayGap } = await import("@/lib/live-snapshots");
const { base58Peer, fetchRewardObservations, formatBps } = await import("@/lib/live-rewards");

beforeEach(() => {
  nodeRpc.mockReset();
});

function peer(overrides: Record<string, unknown> = {}) {
  return {
    peer_id: "12D3KooWK9hQ7TwbfvFiaAxUbRFCkdhS7iEpAJDnewNL1anyREQ1",
    addresses: ["/ip4/127.0.0.1/udp/4001/quic-v1"],
    node_version: "openfiat/0.1.0",
    supported_ofs: [1000, 1500],
    roles: ["MerchantGateway", "OracleProvider"],
    last_seen: 1_785_794_426_779,
    latency_ms: null,
    successes: 0,
    failures: 0,
    ...overrides,
  };
}

function snapshot(id: string, slot: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    slot,
    created_at: 1_785_792_550_655,
    producer: "12D3KooWMwoGvbewX7LwLV5m4kXCp9ybAFJweBhXdmo1NbNdVgRS",
    producer_public_key: "D8S7BU5ELD5SvbaLS9ms3MtkfvGJcVd3gBRyzcDjbjhW",
    size_bytes: 434_342,
    compression: "Gzip",
    locations: ["http://example.invalid:7080/snapshot/x"],
    protocol_version: 2,
    snapshot_version: 1,
    ...overrides,
  };
}

describe("getPeers", () => {
  it("reads the envelope the node actually sends, not a bare array", async () => {
    // The whole result is `{ self_peer_id, peers, announced_addresses }`.
    // A client that treated the result as the peer list would find `.length`
    // undefined and report zero peers — a plausible, wrong answer.
    nodeRpc.mockResolvedValueOnce({
      self_peer_id: "12D3KooWSelf",
      announced_addresses: ["/ip4/88.216.36.108/udp/4001/quic-v1"],
      peers: [peer()],
    });

    const view = await fetchPeers("http://node.invalid");
    expect(view.selfPeerId).toBe("12D3KooWSelf");
    expect(view.announcedAddresses).toHaveLength(1);
    expect(view.peers).toHaveLength(1);
    expect(view.peers[0]!.nodeVersion).toBe("openfiat/0.1.0");
    expect(view.peers[0]!.roles).toContain("OracleProvider");
  });

  it("keeps an unmeasured latency null rather than zero", async () => {
    // A peer this node has never timed and a peer that answers instantly are
    // different facts, and zero would say the second about the first.
    nodeRpc.mockResolvedValueOnce({
      self_peer_id: "12D3KooWSelf",
      announced_addresses: [],
      peers: [peer({ latency_ms: null }), peer({ peer_id: "12D3KooWB", latency_ms: 0 })],
    });

    const view = await fetchPeers("http://node.invalid");
    expect(view.peers.find((p) => p.peerId.endsWith("REQ1"))!.latencyMs).toBeNull();
    expect(view.peers.find((p) => p.peerId === "12D3KooWB")!.latencyMs).toBe(0);
  });

  it("orders peers so two loads and two nodes are comparable", async () => {
    nodeRpc.mockResolvedValueOnce({
      self_peer_id: "12D3KooWSelf",
      announced_addresses: [],
      peers: [peer({ peer_id: "12D3KooWC" }), peer({ peer_id: "12D3KooWA" })],
    });

    const view = await fetchPeers("http://node.invalid");
    expect(view.peers.map((p) => p.peerId)).toEqual(["12D3KooWA", "12D3KooWC"]);
  });

  it("throws rather than answering with an empty peer list", async () => {
    // A node connected to nobody is a real and serious state. It must never
    // be manufactured out of a request that failed.
    nodeRpc.mockRejectedValueOnce(new Error("connection refused"));
    await expect(fetchPeers("http://node.invalid")).rejects.toThrow();
  });

  it("reports no exchange record at all rather than a zero success rate", async () => {
    nodeRpc.mockResolvedValueOnce({
      self_peer_id: "12D3KooWSelf",
      announced_addresses: [],
      peers: [peer({ successes: 0, failures: 0 }), peer({ peer_id: "b", successes: 4, failures: 1 })],
    });

    const view = await fetchPeers("http://node.invalid");
    // Zero of zero exchanges is not 0% reliable. It is a peer nobody has
    // tried yet, and a ratio would turn that into a verdict.
    expect(exchangeRecord(view.peers.find((p) => p.peerId === "b")!)).toBe("4 ok · 1 failed");
    expect(exchangeRecord(view.peers.find((p) => p.peerId !== "b")!)).toBeNull();
  });
});

describe("snapshots", () => {
  it("takes latest from the node rather than deriving one", async () => {
    // `latest` is the node's own answer to "which would you hand a joiner".
    // If this app picked the highest slot itself it would be deciding a
    // question the node already decides, and a joiner receives the node's.
    nodeRpc.mockImplementation((_endpoint: string, method: string) => {
      if (method === "getSnapshots") return Promise.resolve([snapshot("old", 100), snapshot("new", 900)]);
      if (method === "getLatestSnapshot") return Promise.resolve(snapshot("old", 100));
      return Promise.resolve(480_303_473);
    });

    const state = await fetchSnapshotState("http://node.invalid");
    expect(state.latest!.id).toBe("old");
    expect(state.snapshots.map((s) => s.slot)).toEqual([900, 100]);
  });

  it("keeps an absent checkpoint null rather than slot zero", async () => {
    nodeRpc.mockImplementation((_endpoint: string, method: string) => {
      if (method === "getSnapshots") return Promise.resolve([]);
      return Promise.resolve(null);
    });

    const state = await fetchSnapshotState("http://node.invalid");
    // A node that has imported no snapshot has no checkpoint. Slot 0 would
    // say it is sitting at genesis, which is a different claim.
    expect(state.checkpointSlot).toBeNull();
    expect(state.latest).toBeNull();
    expect(state.snapshots).toEqual([]);
  });

  it("gives no replay gap when either slot is missing", () => {
    // Zero would read as "fully caught up", which is the opposite of "there
    // is no head slot to compare against" — the ordinary state on a
    // gossip-only access node.
    expect(replayGap(null, 900)).toBeNull();
    expect(replayGap(100, null)).toBeNull();
    expect(replayGap(900, 100)).toBe(0);
    expect(replayGap(100, 900)).toBe(800);
  });

  it("sizes a snapshot in the units one is downloaded in", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(434_342)).toBe("424.2 KiB");
    expect(formatBytes(-1)).toBe("—");
  });
});

describe("getRewardObservations", () => {
  it("reads the epoch envelope and spells peers the way the rest of this app does", async () => {
    // The node sends hex here to keep a base58 dependency out of that
    // module, and base58 everywhere else. An operator has to be able to
    // recognise their own node in this table.
    nodeRpc.mockResolvedValueOnce({
      epoch: 20_667,
      epoch_start_millis: 1_785_628_800_000,
      epoch_end_millis: 1_785_715_200_000,
      peers: [
        {
          peer: "0024080112203a2b",
          availability_bps: 10_000,
          connectivity_bps: 4_000,
          announced_blockhash: false,
        },
      ],
    });

    const observed = await fetchRewardObservations("http://node.invalid");
    expect(observed.epoch).toBe(20_667);
    expect(observed.peers[0]!.peer).toBe(base58Peer("0024080112203a2b"));
    expect(observed.peers[0]!.peer).not.toContain("0024");
    expect(observed.peers[0]!.announcedBlockhash).toBe(false);
  });

  it("omits the epoch so the node answers for the last completed one", async () => {
    nodeRpc.mockResolvedValueOnce({
      epoch: 1,
      epoch_start_millis: 0,
      epoch_end_millis: 1,
      peers: [],
    });
    await fetchRewardObservations("http://node.invalid");
    // The in-flight epoch's answer would change under the reader mid-page,
    // which is why the node's own parameter documentation says to omit it.
    expect(nodeRpc).toHaveBeenCalledWith("http://node.invalid", "getRewardObservations", {});
  });

  it("leaves a peer id it cannot decode exactly as received", () => {
    // Better shown as sent than silently re-encoded into a different peer.
    expect(base58Peer("not hex")).toBe("not hex");
    expect(base58Peer("abc")).toBe("abc");
  });

  it("renders basis points as the percentage they are", () => {
    expect(formatBps(10_000)).toBe("100%");
    expect(formatBps(4_000)).toBe("40%");
    expect(formatBps(4_050)).toBe("40.5%");
  });
});
