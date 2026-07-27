import type { NetworkNode, NodeRole } from "@/lib/types";
import { NETWORK_NODES } from "@/lib/data/network";

/**
 * Access-node preference, persisted to localStorage["openfiat:node"].
 * Values are either a known node id or `custom:<host:port>`. Default (nothing
 * saved) is the Online node with the lowest latency — the "closest" node.
 * Client-side only; all connection behavior is simulated.
 */

export const NODE_STORAGE_KEY = "openfiat:node";
export const NODE_CHANGED_EVENT = "openfiat:node-changed";

export interface NodeSelection {
  id: string;
  role: string;
  region: string;
  latencyMs: number | null;
  custom: boolean;
}

/**
 * Node roles a user interface can actually attach to.
 *
 * The picker previously offered any Online node, which let you select a
 * notification gateway, an oracle, a snapshot host or a risk-intelligence
 * provider as your access node. None of those serve a client: they are services
 * that *nodes* consume, published in the service registry for discovery, and an
 * interface pointed at one has nothing to talk to.
 *
 * Bootstrap nodes are excluded for a different reason — their job is to hand
 * out peers so a joining node can find the network, not to answer marketplace
 * queries.
 */
export const CONNECTABLE_ROLES: NodeRole[] = ["Full Node", "Public API Node"];

export function connectableNodes(): NetworkNode[] {
  return NETWORK_NODES.filter(
    (n) => CONNECTABLE_ROLES.includes(n.role) && n.status === "Online",
  );
}

export function defaultNode(): NetworkNode {
  return [...connectableNodes()].sort((a, b) => a.latencyMs - b.latencyMs)[0];
}

export function resolveNodeSelection(raw: string | null): NodeSelection {
  if (raw) {
    if (raw.startsWith("custom:")) {
      return { id: raw.slice(7), role: "Custom Node", region: "Self-hosted", latencyMs: null, custom: true };
    }
    // Also guards against a stale localStorage value naming a node that is no
    // longer connectable — the role check has to happen on read, not only in
    // the picker.
    const node = connectableNodes().find((n) => n.id === raw);
    if (node) {
      return { id: node.id, role: node.role, region: node.region, latencyMs: node.latencyMs, custom: false };
    }
  }
  const node = defaultNode();
  return { id: node.id, role: node.role, region: node.region, latencyMs: node.latencyMs, custom: false };
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
