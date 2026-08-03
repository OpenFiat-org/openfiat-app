/**
 * One JSON-RPC POST to an OpenFiat node.
 *
 * # Why this exists rather than `@openfiat/sdk`'s `Client`
 *
 * For the methods the SDK has no binding for. `getPaymentMethods` is one:
 * the node answers it, the SDK's `reference` namespace does not wrap it,
 * and restating the call at each call site is how three copies of the same
 * envelope-parsing bug end up in three modules. `lib/pairs.ts` and
 * `lib/live-vaults.ts` each grew their own; this is the one they should
 * collapse onto as they are touched.
 *
 * Where the SDK *does* have a binding, use it — it carries the argument and
 * result types, and this deliberately does not try to.
 *
 * # `no-store`, stated rather than inherited
 *
 * The whole point of asking a node is that the node is the authority. A
 * cached answer is this app quietly becoming the authority again for as
 * long as the entry lives, and Next.js's default for `fetch` in a server
 * component is not obvious enough to leave implicit.
 */

/** A JSON-RPC error the node returned, as opposed to a transport failure. */
export class NodeRpcError extends Error {
  constructor(
    readonly method: string,
    message: string,
    readonly code?: number,
  ) {
    super(`${method}: ${message}`);
    this.name = "NodeRpcError";
  }
}

/**
 * Calls `method` on `endpoint` and returns its `result`.
 *
 * Throws on both a transport failure and a JSON-RPC `error` member, because
 * they mean the same thing to a caller: no answer. What a caller must not do
 * is turn either into an empty answer — see `lib/reference.ts` on why "could
 * not ask" has to stay distinguishable from "asked, and the list was empty".
 */
export async function nodeRpc<T>(
  endpoint: string,
  method: string,
  params: unknown = {},
  timeoutMs = 8_000,
): Promise<T> {
  const res = await fetch(`${endpoint.replace(/\/+$/, "")}/rpc`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new NodeRpcError(method, `node answered HTTP ${res.status}`);
  const body = (await res.json()) as {
    result?: T;
    error?: { message: string; code?: number };
  };
  if (body.error) throw new NodeRpcError(method, body.error.message, body.error.code);
  if (body.result === undefined) throw new NodeRpcError(method, "no result in the answer");
  return body.result;
}
