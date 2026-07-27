import type { NetworkNode } from "@/lib/types";
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

export function defaultNode(): NetworkNode {
  return [...NETWORK_NODES]
    .filter((n) => n.status === "Online")
    .sort((a, b) => a.latencyMs - b.latencyMs)[0];
}

export function resolveNodeSelection(raw: string | null): NodeSelection {
  if (raw) {
    if (raw.startsWith("custom:")) {
      return { id: raw.slice(7), role: "Custom Node", region: "Self-hosted", latencyMs: null, custom: true };
    }
    const node = NETWORK_NODES.find((n) => n.id === raw && n.status === "Online");
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
