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
 * without a code change, and defaults to the local devnet cluster because
 * that is what a contributor running `pnpm dev` has in front of them.
 *
 * The trailing `/rpc` is deliberately NOT included: `@openfiat/sdk`'s
 * `Client` appends it. Including it here would produce `/rpc/rpc`, which
 * 404s — and a bare host also 404s, so this is worth being explicit about.
 */
export const DEFAULT_NODE_URL =
  process.env.NEXT_PUBLIC_OPENFIAT_NODE_URL ?? "http://127.0.0.1:7080";

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
 * Three nodes, one RPC-connected and two gossip-only, which is the mix the
 * docker-compose devnet actually runs — chosen so a reader can see the
 * difference between the two modes rather than having it hidden behind a
 * uniform list. These replace the fixture's fictional inventory.
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
    return /^https?:\/\//.test(rest) ? rest : `http://${rest}`;
  }
  return knownNodes().find((node) => node.id === raw)?.url ?? DEFAULT_NODE_URL;
}
