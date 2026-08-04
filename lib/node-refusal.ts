import { ofsErrorIdentity } from "@/lib/node-rpc";

/**
 * Turning a node's refusal into a sentence somebody can act on.
 *
 * Four screens in this app do this — trades, advertisements, governance,
 * reviews — and until now each did it by calling `String.includes` on the
 * error's message. That had the same two faults everywhere:
 *
 *  - It read the wrong thing. Every domain failure arrives as JSON-RPC
 *    `-32000` with its real identity in `error.data`; the message is only
 *    a label, and several branches matched Rust variant names that the
 *    wire never carries (`openfiat-core`'s domain errors `Display` as
 *    their OFS-8000 name, not their variant name).
 *  - It reached into text nobody promised. Proposal titles, review
 *    comments and rejection reasons are free prose a node can echo back,
 *    and a substring match cannot tell a code from a quotation.
 *
 * So the name is taken from `error.data.ofsErrorName`, and each screen
 * supplies only its own copy.
 *
 * # No local copy of the code table
 *
 * There is no enum of codes here and no local opinion on which are
 * retryable. A code this build has never seen falls through to the node's
 * own message plus the node's own `ofsRetryable` — read, never recomputed.
 * The registry lives in `openfiat-core`, it grew by three codes last night,
 * and a second copy in this app would be wrong the next time it grows.
 *
 * # Nothing here retries
 *
 * `ofsRetryable` produces a sentence. It never produces a second request.
 */

/** What a screen says about each refusal it has words for, by OFS-8000 name. */
export type RefusalCopy = Readonly<Record<string, string>>;

/**
 * The symbolic name a refusal carries, from `error.data` where the node
 * sent one.
 *
 * The fallback covers nodes older than `error.data` and is deliberately the
 * narrowest reading possible: for a `-32000` the node puts the OFS-8000
 * name and nothing else in `message`, so a lone all-caps token at the end
 * of the message is that name. It is not a substring search — a name
 * quoted inside a sentence does not match, which is the whole point.
 */
export function refusalName(error: unknown): string | undefined {
  const stated = ofsErrorIdentity(error).ofsErrorName;
  if (stated) return stated;
  const message = error instanceof Error ? error.message : String(error);
  return /(?:^|:\s)([A-Z][A-Z0-9_]{3,})$/.exec(message.trim())?.[1];
}

/**
 * What to tell someone about a refusal no screen has words for.
 *
 * The node's own message, plus its own answer to the only question the
 * reader has left. An unrecognised code is the normal case for a node newer
 * than this build, and it should still leave them knowing whether pressing
 * the button again is worth doing.
 */
export function unexplainedRefusal(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  switch (ofsErrorIdentity(error).ofsRetryable) {
    case true:
      return `${message} The node says this one can succeed if you try it again.`;
    case false:
      return `${message} The node says trying again will not change this.`;
    default:
      // The node did not say. Silence is not "no" — an older node that
      // states no retryability would otherwise have every timeout
      // reported as permanent.
      return message;
  }
}

/**
 * Explains a refusal using one screen's own copy, falling back to the
 * node's message and its retryability judgement.
 *
 * Takes the caught value rather than its message on purpose: the message is
 * the part that says the least.
 */
export function explainNodeRefusal(error: unknown, copy: RefusalCopy): string {
  const name = refusalName(error);
  return (name ? copy[name] : undefined) ?? unexplainedRefusal(error);
}
