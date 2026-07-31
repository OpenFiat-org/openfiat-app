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
 * The Solana endpoint every on-chain read goes to.
 *
 * It lives here, beside the OpenFiat node URL, rather than in
 * `lib/onchain-config.ts` where it used to, because the two together are
 * what "which network am I on" means and they must be configured in one
 * place. `lib/onchain-config.ts` imports it back; nothing else in the app
 * hardcodes a cluster URL.
 */
export const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

/**
 * Which Solana cluster `SOLANA_RPC_URL` actually points at.
 *
 * Derived, never declared. The label was previously the constant string
 * `"Devnet"`, which is a promise this module had no way to keep: point the
 * build at another cluster and the badge kept saying Devnet, in the one
 * direction that costs a reader money — a mainnet balance read as play money
 * is the mistake that ends with somebody moving real value on a screen that
 * told them it was a test.
 *
 * A URL that matches no known cluster returns null rather than a guess. An
 * unrecognised host genuinely might be a mainnet proxy, and "probably devnet"
 * is exactly the assumption that must not be made here.
 */
export function solanaClusterOf(rpcUrl: string): "Devnet" | "Testnet" | "Mainnet" | null {
  let host: string;
  try {
    host = new URL(rpcUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (/(^|\.)devnet\./.test(host) || host === "localhost" || host === "127.0.0.1") {
    // A local validator is `solana-test-validator`, which is not any public
    // cluster — but it is unambiguously not mainnet, which is the fact the
    // badge exists to convey.
    return "Devnet";
  }
  if (/(^|\.)testnet\./.test(host)) return "Testnet";
  if (/(^|\.)mainnet(-beta)?\./.test(host)) return "Mainnet";
  return null;
}

/**
 * Which network this build talks to, shown persistently in the interface.
 *
 * Stated rather than implied because the interface is indistinguishable from
 * a production one at a glance, and someone who mistakes a devnet balance for
 * a real one draws exactly the wrong conclusion about what they are holding.
 * Devnet OPEN has no value and cannot be bridged to any that does.
 *
 * "Unknown network" is a legitimate answer and is deliberately the loudest
 * one: a build whose cluster cannot be identified is the case where a reader
 * most needs to go and check, not the case for a reassuring default.
 */
export const NETWORK_LABEL: string = solanaClusterOf(SOLANA_RPC_URL) ?? "Unknown network";

/** The Solana cluster behind the on-chain reads, for prose. */
export const SOLANA_CLUSTER = `solana ${NETWORK_LABEL.toLowerCase()}`;

/**
 * Whether this build is on a cluster where tokens are worth nothing.
 *
 * Every "test tokens only; they have no value" line in the interface is
 * gated on this. Left unqualified it would be a false reassurance on a
 * mainnet build, and false reassurance about whether money is real is the
 * worst sentence this app could print.
 */
export const TOKENS_ARE_WORTHLESS = NETWORK_LABEL === "Devnet" || NETWORK_LABEL === "Testnet";

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
   *
   * A CLAIM, whatever its source. For a seed it is a line in this build's
   * configuration; for a discovered node it is `chain:rpc`/`chain:gossip`
   * from a registration the node signed for itself. Neither is evidence,
   * and `null` — nothing was declared — is an answer this type has to be
   * able to give rather than round down to gossip-only. See
   * `lib/node-capabilities.ts`.
   */
  chainMode: "RpcConnected" | "GossipOnly" | null;
  /**
   * The capability strings from the node's own registration, verbatim.
   *
   * Empty for a seed compiled into this build: there is no registration
   * behind it to quote. Never filtered down to the ones this app happens
   * to understand — see `readCapabilities`.
   */
  capabilities: string[];
  /**
   * A region the operator declared, or `null`. Self-declared and
   * unverified; nothing proves where a node is.
   */
  region: string | null;
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
          chainMode: (chainMode as KnownNode["chainMode"]) ?? null,
          // A configured seed carries no registration to quote.
          capabilities: [],
          region: null,
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
        capabilities: [],
        region: null,
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
      capabilities: [],
      region: null,
    },
    {
      id: "devnet-node1",
      url: DEFAULT_NODE_URL.replace(/:7080$/, ":7081"),
      label: "devnet node1",
      role: "Full Node",
      chainMode: "GossipOnly",
      capabilities: [],
      region: null,
    },
    {
      id: "devnet-node2",
      url: DEFAULT_NODE_URL.replace(/:7080$/, ":7082"),
      label: "devnet node2",
      role: "Full Node",
      chainMode: "GossipOnly",
      capabilities: [],
      region: null,
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
