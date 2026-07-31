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
  // A declared logo resolves against the selected node, so this mock has
  // to answer for it as well as for the seed list.
  nodeUrl: () => "https://openfiat.allenhark.com",
  knownNodes: () => [
    {
      id: "devnet-public",
      url: "https://openfiat.allenhark.com",
      label: "openfiat.allenhark.com",
      role: "Public API Node",
      chainMode: "RpcConnected",
      capabilities: [],
      region: null,
    },
  ],
}));

const { discoverNodes } = await import("@/lib/live-nodes");

function record(
  id: string,
  variant: string,
  endpoints: string[],
  capabilities: string[] = [],
  region: string | null = null,
  branding: unknown = null,
) {
  return {
    service_id: id,
    service_type: { Infrastructure: variant },
    endpoints,
    capabilities,
    region,
    branding,
  };
}

/** A real CIDv1 base32 sha2-256, the only shape a logo may take. */
const LOGO_CID = "bafkreibdmq27skp3wnycoyoqcei47etyaulerpsegivlkfvyhjkw7ufjva";

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

  it("labels a discovered node by host", async () => {
    getProviders.mockResolvedValue([
      record("node-x", "PublicApiNode", ["https://rpc.example.org:8443/"]),
    ]);

    const [, discovered] = await discoverNodes();
    expect(discovered.label).toBe("rpc.example.org:8443");
  });

  /*
   * This used to be hardcoded to `GossipOnly` for every discovered node,
   * with a comment that a registration says nothing about chain
   * connectivity. That was true when it was written. A node now derives
   * `chain:rpc`/`chain:gossip` from its running configuration and
   * registers it, so the assumption is gone — and with it a directory in
   * which every node a client could pick was labelled second-hand
   * regardless of what it ran.
   */
  it("takes the chain mode from the registration, which now carries one", async () => {
    getProviders.mockResolvedValue([
      record("node-rpc", "PublicApiNode", ["https://rpc.example.org"], [
        "chain:rpc",
        "content:serving",
        "retention:archival (everything)",
      ], "eu-west"),
    ]);

    const [, discovered] = await discoverNodes();
    expect(discovered.chainMode).toBe("RpcConnected");
    // Carried through unfiltered, so the view can render capabilities this
    // build has no reading for.
    expect(discovered.capabilities).toEqual([
      "chain:rpc",
      "content:serving",
      "retention:archival (everything)",
    ]);
    expect(discovered.region).toBe("eu-west");
  });

  it("leaves the chain mode null when the registration declared none", async () => {
    // "Did not say" is not "said gossip-only", and the caller probes
    // either way.
    getProviders.mockResolvedValue([
      record("node-quiet", "PublicApiNode", ["https://quiet.example.org"]),
    ]);

    const [, discovered] = await discoverNodes();
    expect(discovered.chainMode).toBeNull();
    expect(discovered.region).toBeNull();
  });

  it("carries the name and logo a node declares for itself, as a claim beside the others", async () => {
    // Before this the network view showed a URL and nothing else, so an
    // operator running three nodes could not tell which was which and a
    // visitor had no way to recognise anybody.
    getProviders.mockResolvedValue([
      record("node-eu", "PublicApiNode", ["https://eu.example.org"], [], null, {
        name: "AllenHark EU",
        description: "Public API node in Frankfurt.",
        logo: LOGO_CID,
        website: "https://openfiat.allenhark.com",
      }),
    ]);

    const [, discovered] = await discoverNodes();
    expect(discovered.branding?.name).toBe("AllenHark EU");
    expect(discovered.branding?.website).toBe("https://openfiat.allenhark.com");
    // The label stays the host. That is observable — the app just sent a
    // request there — where a name is only what the operator wrote.
    expect(discovered.label).toBe("eu.example.org");
  });

  it("refuses a logo or website that would leak the viewer, even from the seed's own registry", async () => {
    // The registry a seed reports is not trusted output: the seed may be
    // hostile, or the user may have typed it in. A hotlinked logo would
    // report every visitor of the network page to whoever hosts it.
    getProviders.mockResolvedValue([
      record("node-hostile", "PublicApiNode", ["https://hostile.example.org"], [], null, {
        name: "Legit Node",
        logo: "https://tracker.example/pixel.png",
        website: "javascript:alert(1)",
      }),
    ]);

    const [, discovered] = await discoverNodes();
    expect(discovered.branding?.logoUrl).toBeNull();
    expect(discovered.branding?.website).toBeNull();
    expect(discovered.branding?.name).toBe("Legit Node");
  });

  it("gives a seed no branding, because there is no registration behind it to quote", async () => {
    getProviders.mockRejectedValue(new Error("unreachable"));
    const [seed] = await discoverNodes();
    expect(seed.branding).toBeNull();
  });

  it("skips a registration with no endpoint rather than producing a blank entry", async () => {
    getProviders.mockResolvedValue([record("endpointless", "PublicApiNode", [])]);
    const nodes = await discoverNodes();
    expect(nodes).toHaveLength(1);
  });
});
