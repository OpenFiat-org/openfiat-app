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

/**
 * What OFS-8200 §10 puts in a JSON-RPC error's `data` member.
 *
 * Every field is optional because every field is the node's to send. A
 * node older than any one of them omits it, and an omission has to stay
 * distinguishable from a value — see `ofsRetryable`.
 */
export interface NodeErrorData {
  /** OFS-8000's own numeric code, e.g. `5008`. The authoritative identity. */
  ofsErrorCode?: number;
  /** The stable symbolic name for that code, e.g. `SETTLEMENT_NOT_FOUND`. */
  ofsErrorName?: string;
  /** OFS-8000 §16: whether the identical request can reach a different outcome. */
  ofsRetryable?: boolean;
}

/**
 * A JSON-RPC error the node returned, as opposed to a transport failure.
 *
 * # Why the JSON-RPC `code` alone is not enough
 *
 * Every domain failure in the protocol is JSON-RPC `-32000`. Advertisement
 * gone, price moved, too late to cancel, id already taken — one number for
 * all of them. What tells them apart is `error.data`, which is where the
 * node puts OFS-8000's own code, its symbolic name, and its judgement on
 * whether asking again could help.
 *
 * This class used to keep `code` and drop `data`, which meant the app held
 * only the number that is the same for everything. The three fields below
 * are read off the node's answer and never re-derived here: the registry
 * lives in `openfiat-core`, three codes were added to it last night, and a
 * second copy in this app would be wrong the next time that happens.
 *
 * `ofsRetryable` is surfaced, not acted on. Nothing in this app retries a
 * call because the node said it could — a client that starts looping on a
 * flag is a client hammering a node nobody asked it to hammer. It exists so
 * a message can tell someone whether pressing the button again is worth
 * their time.
 */
export class NodeRpcError extends Error {
  /** OFS-8000's numeric code, when the node sent one. */
  readonly ofsErrorCode?: number;
  /** OFS-8000's symbolic name, when the node sent one. */
  readonly ofsErrorName?: string;
  /**
   * The node's own answer to "can this succeed if I send it again?".
   *
   * `undefined` means the node did not say — an older build, or a
   * transport failure that never reached one. That is not `false`:
   * treating silence as "never retry" turns every timeout against an
   * older node into a permanent refusal.
   */
  readonly ofsRetryable?: boolean;

  constructor(
    readonly method: string,
    message: string,
    readonly code?: number,
    data?: NodeErrorData,
  ) {
    super(`${method}: ${message}`);
    this.name = "NodeRpcError";
    this.ofsErrorCode = data?.ofsErrorCode;
    this.ofsErrorName = data?.ofsErrorName;
    this.ofsRetryable = data?.ofsRetryable;
  }
}

/**
 * What OFS-8000 identity a caught value carries, if any.
 *
 * `instanceof` is deliberately not the test. Errors cross module and
 * bundle boundaries here — a `NodeRpcError` thrown in a server component
 * and re-read in a client one is not the same class object — and a check
 * that silently answers "no identity" for a real node error would put the
 * app straight back to guessing. Shape is the thing that actually travels.
 */
export function ofsErrorIdentity(error: unknown): NodeErrorData {
  if (typeof error !== "object" || error === null) return {};
  const candidate = error as NodeErrorData;
  return {
    ofsErrorCode:
      typeof candidate.ofsErrorCode === "number" ? candidate.ofsErrorCode : undefined,
    ofsErrorName:
      typeof candidate.ofsErrorName === "string" ? candidate.ofsErrorName : undefined,
    ofsRetryable:
      typeof candidate.ofsRetryable === "boolean" ? candidate.ofsRetryable : undefined,
  };
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
    error?: { message: string; code?: number; data?: NodeErrorData };
  };
  if (body.error) {
    throw new NodeRpcError(method, body.error.message, body.error.code, body.error.data);
  }
  if (body.result === undefined) throw new NodeRpcError(method, "no result in the answer");
  return body.result;
}
