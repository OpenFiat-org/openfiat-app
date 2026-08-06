import { explainNodeRefusal, refusalName, type RefusalTranslator } from "@/lib/node-refusal";
import type { TradeActionKind } from "@/lib/trade-actions";

/**
 * What the node's refusals mean, in the words of the person who pressed the
 * button.
 *
 * Reading the refusal is `lib/node-refusal.ts`; what is here is the copy,
 * plus the one thing trades need that the other screens do not — a refusal
 * whose meaning depends on which button produced it.
 *
 * # What this used to get wrong
 *
 * It was handed a string and matched substrings of it, and four of its
 * twelve branches could never fire. They matched Rust *variant* names —
 * `UNAUTHORIZED`, `INVALID_AMOUNT`, `TIMESTAMP_TOO_FAR_AHEAD`,
 * `DUPLICATE_RESERVATION_ID`/`DUPLICATE_SETTLEMENT_ID` — and none of those
 * strings ever reaches the wire: `ReservationError`'s and
 * `SettlementError`'s `Display` impls are literally
 * `write!(f, "{}", self.code().name())`, so what arrives is the OFS-8000
 * name the variant maps to (`INVALID_IDENTITY_CLAIM`, `INVALID_REQUEST`,
 * `INVALID_PARAMETER`, `RESERVATION_ALREADY_EXISTS`,
 * `SETTLEMENT_ALREADY_EXISTS`). Three further branches carried a dead
 * alternative alongside a live one.
 *
 * The visible consequence: a wallet refused for acting out of turn was
 * shown the message about a bad signature. `UNAUTHORIZED` never arrived,
 * and `INVALID_IDENTITY_CLAIM` — the name it actually maps to — was
 * sitting in the signature branch.
 */

/** What the person was trying to do, when that changes what the refusal means. */
export type TradeAttempt = TradeActionKind | "reserve";



/**
 * Explains a refusal, given the caught value and — where it changes the
 * meaning — what the person was trying to do.
 *
 * Takes the error rather than its message on purpose: the message is the
 * part that says the least, and everything specific is on the object.
 */
export function explainTradeRefusal(
  t: RefusalTranslator,
  error: unknown,
  attempt?: TradeAttempt,
): string {
  if (attempt) {
    const name = refusalName(error);
    const key = name ? `tradeByAttempt.${name}.${attempt}` : undefined;
    if (key && t.has(key)) return t(key);
  }
  return explainNodeRefusal(t, error, "trade");
}
