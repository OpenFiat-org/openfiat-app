import { Client, chain } from "@openfiat/sdk";

/**
 * A row shaped for the "Latest protocol events" panel's live feed —
 * deliberately smaller than the mock `ProtocolEvent` type: a real `/ws`
 * message (`{"method": "sendX", "result": ...}`) carries no submitter
 * identity and no hand-written narrative sentence, so there's no honest
 * "actor"/"summary" to show beyond the method name and its raw result.
 */
export interface LiveEvent {
  method: string;
  resultPreview: string;
  receivedAt: string; // ISO, client receive time — not a server timestamp
}

export interface LiveNetworkStats {
  /** Real Solana slot via the chain bridge, or null if the node hasn't
   *  observed one yet (GossipOnly with no peer announcement so far). */
  blockHeight: number | null;
  mode: "RpcConnected" | "GossipOnly";
}

function toWebSocketUrl(endpoint: string): string {
  return `${endpoint.replace(/^http/, "ws").replace(/\/$/, "")}/ws`;
}

function previewResult(result: unknown): string {
  if (result === null || result === undefined) return "applied";
  if (typeof result === "string") return result;
  try {
    const json = JSON.stringify(result);
    return json.length > 60 ? `${json.slice(0, 60)}…` : json;
  } catch {
    return "(unprintable result)";
  }
}

/**
 * Opens a real WebSocket to a node's `/ws` firehose (every successful
 * `sendX` mutation, as it happens — see `openfiat-rpc`'s own doc
 * comment) and calls `onEvent` for each one. Returns an unsubscribe
 * function; call it on cleanup (e.g. a `useEffect` teardown) to close
 * the socket.
 */
export function subscribeToLiveEvents(endpoint: string, onEvent: (event: LiveEvent) => void): () => void {
  const socket = new WebSocket(toWebSocketUrl(endpoint));
  socket.onmessage = (message) => {
    try {
      const parsed = JSON.parse(message.data) as { method?: string; result?: unknown };
      if (!parsed.method) return;
      onEvent({
        method: parsed.method,
        resultPreview: previewResult(parsed.result),
        receivedAt: new Date().toISOString(),
      });
    } catch {
      // Malformed frame — ignore rather than crash the subscription.
    }
  };
  return () => socket.close();
}

export async function fetchLiveNetworkStats(endpoint: string): Promise<LiveNetworkStats> {
  const client = new Client({ endpoint, timeoutMs: 5_000 });
  const status = await chain.getChainStatus(client);
  return { blockHeight: status.slot, mode: status.mode };
}
