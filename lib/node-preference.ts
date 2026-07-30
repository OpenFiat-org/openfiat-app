import { nodeUrlFor } from "@/lib/node-scheme";
import {
  NODE_URL_STORAGE_KEY,
  knownNodes,
  type KnownNode,
} from "@/lib/node-endpoint";

/**
 * Which node this interface talks to, persisted to
 * `localStorage["openfiat:node"]` as either a `KnownNode.id` or
 * `custom:<host:port>`.
 *
 * # This used to describe a network that did not exist
 *
 * The picker was backed by `lib/data/network.ts`'s `NETWORK_NODES` — a
 * fixture listing node-ke-full-01, node-bootstrap-02, node-oracle-02 and
 * others, each with an invented region, latency and peer count. None of
 * them were real, none could be connected to, and the app shipped a node
 * chooser that could not choose a node.
 *
 * `lib/node-endpoint.ts` already knew the real cluster. Two parallel node
 * systems existed side by side, sharing this very storage key, and the
 * fabricated one was the one the footer rendered. This module is now a thin
 * layer over the real one, so there is a single source of truth for what a
 * node is.
 *
 * # Why region and peer count are gone
 *
 * They were fixture inventions. A node's region is not something this app
 * can observe, and the peer count is not on any RPC method it calls. What
 * IS knowable and does change what a node can answer is its chain mode
 * (OFS-4300): an `RpcConnected` node reads Solana directly, a `GossipOnly`
 * node learns on-chain facts second-hand and can lag. That is shown
 * instead — a real property in place of two invented ones.
 *
 * Latency is measured, not declared: `null` until a round trip has actually
 * happened. A number here always came from the wire.
 */

export const NODE_STORAGE_KEY = NODE_URL_STORAGE_KEY;
export const NODE_CHANGED_EVENT = "openfiat:node-changed";

export interface NodeSelection {
  id: string;
  /** Human label; for a custom node, the host the user typed. */
  label: string;
  /** The endpoint actually used for requests. */
  url: string;
  /**
   * `null` for a custom node — the app cannot know whether someone else's
   * node reads Solana directly, and guessing would misrepresent how current
   * its on-chain answers are.
   */
  chainMode: KnownNode["chainMode"] | null;
  /** Measured round trip in ms, or `null` if nothing has been measured. */
  latencyMs: number | null;
  custom: boolean;
}

/** Every node this interface can attach to. */
export function connectableNodes(): KnownNode[] {
  return knownNodes();
}

/**
 * The node used when nothing is stored.
 *
 * The RPC-connected node is preferred over gossip-only peers because it is
 * the one that can answer on-chain questions without lag — a better default
 * than the old "lowest declared latency", which ranked nodes by a number
 * from a fixture.
 */
export function defaultNode(): KnownNode {
  const nodes = knownNodes();
  return nodes.find((n) => n.chainMode === "RpcConnected") ?? nodes[0]!;
}

function fromKnown(node: KnownNode): NodeSelection {
  return {
    id: node.id,
    label: node.label,
    url: node.url,
    chainMode: node.chainMode,
    latencyMs: null,
    custom: false,
  };
}

export function resolveNodeSelection(raw: string | null): NodeSelection {
  if (raw) {
    if (raw.startsWith("custom:")) {
      const host = raw.slice("custom:".length);
      return {
        id: raw,
        label: host,
        url: nodeUrlFor(host),
        chainMode: null,
        latencyMs: null,
        custom: true,
      };
    }
    const node = knownNodes().find((n) => n.id === raw);
    if (node) return fromKnown(node);
    // Falls through rather than throwing: a stale id from an earlier build
    // must not leave the app unable to reach any node at all.
  }
  return fromKnown(defaultNode());
}

export function readNodeSelection(): NodeSelection {
  if (typeof window === "undefined") return resolveNodeSelection(null);
  try {
    return resolveNodeSelection(localStorage.getItem(NODE_STORAGE_KEY));
  } catch {
    return resolveNodeSelection(null);
  }
}

export function writeNodeSelection(value: string): void {
  try {
    localStorage.setItem(NODE_STORAGE_KEY, value);
    window.dispatchEvent(new CustomEvent(NODE_CHANGED_EVENT));
  } catch {
    /* localStorage unavailable */
  }
}
