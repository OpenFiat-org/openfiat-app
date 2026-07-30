import { nodeUrlFor } from "@/lib/node-scheme";
/**
 * Where this interface actually talks to the protocol.
 *
 * # The gap this closes
 *
 * `lib/node-preference.ts` described itself accurately: "Client-side only;
 * all connection behavior is simulated." Its node inventory came from
 * `lib/data/network.ts` — a fixture — and it picked a default by sorting
 * *invented* latency numbers. The only way to reach a real node was to type
 * a `custom:host:port` into the picker, and `lib/live-providers.ts`'s own
 * doc records the consequence: "every other access-node selection keeps
 * using the static mock dataset."
 *
 * So the app was not one cutover away from live data. Its default path was
 * a fictional node serving fictional data, and the live path was opt-in and
 * mostly unused. Every route could look healthy while the protocol was
 * down, which is the opposite of what a testable interface should do.
 *
 * This module makes a real endpoint the default and the only thing any data
 * module reads.
 */

/**
 * The node this app talks to unless the user picks another.
 *
 * Configured at build time so a deployment points at its own cluster
 * without a code change.
 *
 * The default is the public devnet node, not `127.0.0.1`. A deployed app
 * has no node on its visitor's machine, so a loopback default meant every
 * visitor of a real deployment saw an app that could reach nothing — the
 * one audience the default should serve is the one it failed. A
 * contributor with a node of their own sets
 * `NEXT_PUBLIC_OPENFIAT_NODE_URL=http://127.0.0.1:7080`, which also
 * restores the local three-node list below.
 *
 * HTTPS, and not incidentally: a page served over HTTPS cannot open a
 * plain-HTTP connection, so a public node without TLS is unreachable from
 * this app no matter how healthy it is. See `lib/node-scheme.ts`.
 *
 * The trailing `/rpc` is deliberately NOT included: `@openfiat/sdk`'s
 * `Client` appends it. Including it here would produce `/rpc/rpc`, which
 * 404s — and a bare host also 404s, so this is worth being explicit about.
 */
export const PUBLIC_DEVNET_NODE = "https://openfiat.allenhark.com";

export const DEFAULT_NODE_URL =
  process.env.NEXT_PUBLIC_OPENFIAT_NODE_URL ?? PUBLIC_DEVNET_NODE;

/** Whether this build points at a node on the developer's own machine. */
export function isLocalDefault(): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|$)/i.test(DEFAULT_NODE_URL);
}

/**
 * Which network this build talks to, shown persistently in the interface.
 *
 * Everything here is devnet: the OpenFiat node cluster this app queries, and
 * the Solana cluster those nodes and `lib/onchain-config.ts` read
 * (`api.devnet.solana.com`). The escrow, staking, governance and presale
 * programs are deployed to devnet only — OFS-4200's own status banner keeps
 * mainnet out of scope, and there has been no external audit.
 *
 * Stated rather than implied because the interface is indistinguishable from
 * a production one at a glance, and someone who mistakes a devnet balance for
 * a real one draws exactly the wrong conclusion about what they are holding.
 * Devnet OPEN has no value and cannot be bridged to any that does.
 */
export const NETWORK_LABEL = "Devnet";

/** The Solana cluster behind the on-chain reads (`lib/onchain-config.ts`). */
export const SOLANA_CLUSTER = "solana devnet";

/** A node a user interface can actually attach to and query. */
export interface KnownNode {
  id: string;
  url: string;
  label: string;
  role: "Full Node" | "Public API Node";
  /**
   * Chain-bridge mode (OFS-4300). An `RpcConnected` node reads Solana
   * directly; a `GossipOnly` node learns on-chain facts second-hand over
   * gossip, so it can lag. Surfaced because it changes what the node can
   * answer, not as decoration.
   */
  chainMode: "RpcConnected" | "GossipOnly";
}

/**
 * The real devnet cluster.
 *
 * Against the public node this is one entry, because there is one public
 * node. Pointed at a local default it expands to the three the
 * docker-compose devnet actually runs — one RPC-connected and two
 * gossip-only, so a reader can see the difference between the modes.
 *
 * Listing the local trio unconditionally, as an earlier version did, put
 * two nodes in every deployed user's picker that resolve to ports on
 * their own machine and can never answer.
 *
 * Overridable as a whole by `NEXT_PUBLIC_OPENFIAT_NODES`, a comma-separated
 * list of `id|url|role|chainMode` entries, so a deployment against a
 * different cluster does not need a rebuild of this list by hand.
 */
export function knownNodes(): KnownNode[] {
  const configured = process.env.NEXT_PUBLIC_OPENFIAT_NODES;
  if (configured) {
    return configured
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [id, url, role, chainMode] = entry.split("|");
        if (!id || !url) {
          throw new Error(
            `NEXT_PUBLIC_OPENFIAT_NODES entry "${entry}" must be id|url|role|chainMode`,
          );
        }
        return {
          id,
          url,
          label: id,
          role: (role as KnownNode["role"]) ?? "Full Node",
          chainMode: (chainMode as KnownNode["chainMode"]) ?? "GossipOnly",
        };
      });
  }
  if (!isLocalDefault()) {
    return [
      {
        id: "devnet-public",
        url: DEFAULT_NODE_URL,
        label: "openfiat.allenhark.com",
        role: "Public API Node",
        chainMode: "RpcConnected",
      },
    ];
  }

  return [
    {
      id: "devnet-node0",
      url: DEFAULT_NODE_URL,
      label: "devnet node0",
      role: "Full Node",
      chainMode: "RpcConnected",
    },
    {
      id: "devnet-node1",
      url: DEFAULT_NODE_URL.replace(/:7080$/, ":7081"),
      label: "devnet node1",
      role: "Full Node",
      chainMode: "GossipOnly",
    },
    {
      id: "devnet-node2",
      url: DEFAULT_NODE_URL.replace(/:7080$/, ":7082"),
      label: "devnet node2",
      role: "Full Node",
      chainMode: "GossipOnly",
    },
  ];
}

/** localStorage key holding either a `KnownNode.id` or `custom:<url>`. */
export const NODE_URL_STORAGE_KEY = "openfiat:node";

/**
 * The endpoint for the user's current selection, or the default.
 *
 * Falls back rather than throwing on an unrecognised stored value: a stale
 * id left by an earlier build must not leave the app unable to reach any
 * node at all.
 */
export function nodeUrl(): string {
  if (typeof window === "undefined") return DEFAULT_NODE_URL;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(NODE_URL_STORAGE_KEY);
  } catch {
    return DEFAULT_NODE_URL;
  }
  if (!raw) return DEFAULT_NODE_URL;
  if (raw.startsWith("custom:")) {
    const rest = raw.slice("custom:".length);
    // Accept a bare host:port as well as a full URL, since the picker has
    // always accepted the former.
    return nodeUrlFor(rest);
  }
  return knownNodes().find((node) => node.id === raw)?.url ?? DEFAULT_NODE_URL;
}
