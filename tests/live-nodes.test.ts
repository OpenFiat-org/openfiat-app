import { beforeEach, describe, expect, it, vi } from "vitest";

const getProviders = vi.fn();

vi.mock("@openfiat/sdk", () => ({
  Client: class {
    constructor(public options: unknown) {}
  },
  providers: {
    getProviders: (...args: unknown[]) => getProviders(...args),
  },
}));

vi.mock("@/lib/node-endpoint", () => ({
  knownNodes: () => [
    {
      id: "devnet-public",
      url: "https://openfiat.allenhark.com",
      label: "openfiat.allenhark.com",
      role: "Public API Node",
      chainMode: "RpcConnected",
    },
  ],
}));

const { discoverNodes } = await import("@/lib/live-nodes");

function record(id: string, variant: string, endpoints: string[]) {
  return {
    service_id: id,
    service_type: { Infrastructure: variant },
    endpoints,
  };
}

beforeEach(() => {
  getProviders.mockReset();
});

describe("discoverNodes", () => {
  it("adds nodes the registry advertises to the compiled-in seed", async () => {
    // The bug this fixes: the list was the seed and only the seed, so the
    // network view showed one node however many had joined.
    getProviders.mockResolvedValue([
      record("devnet-public-api-us", "PublicApiNode", ["https://rpc.us.example"]),
    ]);

    const nodes = await discoverNodes();
    expect(nodes.map((n) => n.url)).toEqual([
      "https://openfiat.allenhark.com",
      "https://rpc.us.example",
    ]);
  });

  it("does not list a node twice when it advertises the seed's own URL", async () => {
    // Exactly what happens in practice: the seed node registers itself, so
    // without canonicalisation the one node appears as two.
    getProviders.mockResolvedValue([
      record("node-abc", "PublicApiNode", ["https://openfiat.allenhark.com/"]),
    ]);

    const nodes = await discoverNodes();
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe("devnet-public");
  });

  it("ignores services that are not nodes a client can talk to", async () => {
    getProviders.mockResolvedValue([
      record("snapshots", "SnapshotProvider", ["https://snap.example"]),
      { service_id: "oracle", service_type: { MarketData: "FxOracle" }, endpoints: ["https://fx.example"] },
      { service_id: "notify", service_type: { Notifications: "Telegram" }, endpoints: ["https://n.example"] },
      record("bootstrap", "BootstrapNode", ["https://boot.example"]),
    ]);

    const nodes = await discoverNodes();
    // The bootstrap node is one you can talk to; a snapshot provider,
    // oracle and notification gateway are not access nodes.
    expect(nodes.map((n) => n.id)).toEqual(["devnet-public", "bootstrap"]);
  });

  it("falls back to the seed when the registry cannot be read", async () => {
    // An unreachable seed means no registry, which is still the truth
    // about what this build knows — not an error to surface as an empty
    // network.
    getProviders.mockRejectedValue(new Error("unreachable"));

    const nodes = await discoverNodes();
    expect(nodes.map((n) => n.id)).toEqual(["devnet-public"]);
  });

  it("orders discovered nodes stably so the list does not reshuffle", async () => {
    getProviders.mockResolvedValue([
      record("zeta", "PublicApiNode", ["https://z.example"]),
      record("alpha", "PublicApiNode", ["https://a.example"]),
    ]);

    const nodes = await discoverNodes();
    expect(nodes.map((n) => n.id)).toEqual(["devnet-public", "alpha", "zeta"]);
  });

  it("labels a discovered node by host, and never claims it reads Solana", async () => {
    // A registration says "this URL reaches me". It says nothing about
    // chain connectivity, so assuming RpcConnected would be inventing.
    getProviders.mockResolvedValue([
      record("node-x", "PublicApiNode", ["https://rpc.example.org:8443/"]),
    ]);

    const [, discovered] = await discoverNodes();
    expect(discovered.label).toBe("rpc.example.org:8443");
    expect(discovered.chainMode).toBe("GossipOnly");
  });

  it("skips a registration with no endpoint rather than producing a blank entry", async () => {
    getProviders.mockResolvedValue([record("endpointless", "PublicApiNode", [])]);
    const nodes = await discoverNodes();
    expect(nodes).toHaveLength(1);
  });
});
