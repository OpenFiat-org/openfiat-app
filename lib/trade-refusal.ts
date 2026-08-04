import { explainNodeRefusal, refusalName, type RefusalCopy } from "@/lib/node-refusal";
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
 * Copy for a refusal that means something different depending on which
 * button produced it.
 *
 * `INVALID_SETTLEMENT_STATE` is the reason this exists. It is one code for
 * "that transition is illegal from where this settlement is now", and the
 * settlement is somewhere different for each of the three exits — so "too
 * late to cancel" and "the merchant has already answered your declaration"
 * are the same code and must not be the same sentence.
 */
const BY_ATTEMPT: Partial<Record<string, Partial<Record<TradeAttempt, string>>>> = {
  INVALID_SETTLEMENT_STATE: {
    "cancel-settlement":
      "Too late to cancel — this trade is no longer awaiting payment. Reload it: if the payment has been declared, your way out is to approve it, reject it, or open a dispute.",
    "reverse-payment":
      "Too late to withdraw your declaration — the merchant has already acted on it. Reload to see whether they approved or rejected it. If they rejected it and you really did send the money, open a dispute.",
    "reject-payment":
      "There is no payment declaration outstanding to reject. Reload — either the buyer withdrew it, or this trade has already ended.",
    "declare-paid":
      "This trade is not waiting on a payment declaration. Reload — either you have declared already, or the trade has ended.",
    approve:
      "There is no payment declaration to approve. Reload — either the buyer withdrew it, or this trade has already ended.",
    dispute:
      "This trade cannot be disputed from where it is now. Reload to see its current state; a completed or cancelled trade has no dispute to open.",
  },
  SETTLEMENT_ALREADY_EXISTS: {
    initiate:
      "A settlement already exists on this node under the id this order used. That is a statement about the id and not about your trade — it has not completed. Reload the order: if its settlement is already open, carry on from there rather than opening a second one.",
  },
  INVALID_IDENTITY_CLAIM: {
    "declare-paid": "Only the buyer can declare a payment, and this wallet is not the buyer on this trade.",
    approve: "Only the merchant can approve a payment, and this wallet is not the merchant on this trade.",
    "reject-payment": "Only the merchant can reject a payment, and this wallet is not the merchant on this trade.",
    "reverse-payment":
      "Only the buyer can withdraw a payment declaration, and this wallet is not the buyer on this trade.",
    "cancel-reservation":
      "Only the wallet that placed a reservation can cancel it, and this is not that wallet.",
  },
};

/**
 * Copy for a refusal that means the same thing whichever button produced it.
 *
 * Every sentence here is meant to leave the reader with a next move.
 * "This trade no longer exists" and "too late to cancel — the payment was
 * already declared" are different situations and the app can finally tell
 * them apart, so they are written as different situations.
 */
const BY_NAME: RefusalCopy = {
  // 5008 and 5009, the split that made this whole exercise possible. Both
  // used to arrive as retryable `SETTLEMENT_FAILED`, so both were shown as
  // "try again in a moment" — advice that was wrong for one of them and
  // useless for the other.
  SETTLEMENT_NOT_FOUND:
    "This node holds no settlement with that id, and it reports that as final rather than as something still on its way. The usual cause is being connected to a different node than the one this trade was opened on — check the node in Settings, then reload.",
  INVALID_SETTLEMENT_STATE:
    "The trade has moved on from the state that action needs. Reload to see where it actually is — a cancellation is only possible before a payment is declared, and a reversal or a rejection only while one is outstanding.",
  // 5010. A taken id, which says nothing about whose trade holds it.
  SETTLEMENT_ALREADY_EXISTS:
    "A settlement already exists on this node under that id. That does not mean this trade completed — the settlement holding the id may still be waiting for a payment, or may belong to two other people. Reload before opening another.",
  SETTLEMENT_ALREADY_COMPLETED:
    "This trade has already completed. Nothing further can be done to it — reload to see the final record.",
  SETTLEMENT_ALREADY_CANCELLED:
    "This trade was already cancelled. Reload to see it; placing a new order is the only way forward.",

  RESERVATION_NOT_FOUND:
    "This node holds no reservation with that id, and it reports that as final rather than as something still on its way. The usual cause is being connected to a different node than the one the order was placed on — check the node in Settings, then reload.",
  RESERVATION_ALREADY_EXISTS:
    "The node already holds a reservation with that id — this order has already been submitted. Reload your orders rather than placing it again.",
  RESERVATION_EXPIRED:
    "This reservation's 30-minute window has lapsed and the merchant's liquidity is free again. Place a new order to trade with them.",
  RESERVATION_CANCELLED:
    "This reservation was already cancelled, so there is nothing left to act on. Place a new order to trade with this merchant.",
  INVALID_RESERVATION_STATE:
    "This reservation is no longer live, so there is nothing left to cancel — it was cancelled already, its 30-minute window lapsed, or a settlement has already started against it. Reload to see which.",
  INSUFFICIENT_AVAILABLE_LIQUIDITY:
    "This advertisement no longer has enough liquidity for that amount — somebody else reserved against it first. Liquidity comes back when their reservation ends, so the same order may go through later, or you can trade a smaller amount now.",
  MERCHANT_OFFLINE:
    "The merchant's node is not reachable right now, so this order cannot be placed. Merchants come back; try again shortly, or pick another advertisement.",
  PRICE_DISAGREEMENT:
    "The node did not accept this price for that advertisement. It re-derives the price from the ad's own terms, so a quote that has moved since you read it has to be re-read before ordering. Reload the advertisement and place the order again.",

  ADVERTISEMENT_NOT_FOUND:
    "This advertisement is no longer on the node, so nothing can be reserved against it. Go back to the book and pick another.",
  ADVERTISEMENT_DISABLED:
    "The merchant has taken this advertisement down, so nothing can be reserved against it. Go back to the book and pick another.",
  ADVERTISEMENT_EXPIRED:
    "This advertisement has expired, so nothing can be reserved against it. Go back to the book and pick another.",

  DISPUTE_ALREADY_OPEN:
    "A dispute is already open on this trade. Follow it from the disputes page rather than opening a second one.",
  DISPUTE_CLOSED:
    "This dispute has been decided and takes no further evidence or votes. Reload to see the ruling.",

  // 2001, which is what `Unauthorized` actually arrives as. It is an
  // authorization refusal and not a cryptographic one — separated from
  // `INVALID_SIGNATURE` below, which the app used to answer for both.
  INVALID_IDENTITY_CLAIM:
    "The node refused this wallet for that action. Only a party to the trade can act on it, and only in their own role — the buyer declares the payment, the merchant approves or rejects it.",
  INVALID_SIGNATURE:
    "The node did not accept this wallet's signature over that request. The signature verified against a different key than the one this trade names, so check that the connected wallet is the one that is party to it.",

  // What `InvalidAmount` and `TimestampTooFarAhead` really map to. Both
  // are general-purpose codes, so both sentences name the cause that is
  // overwhelmingly likely on a trade screen without claiming it is the
  // only one.
  INVALID_REQUEST:
    "The node refused this request. On an order the usual cause is an amount outside the advertisement's own minimum and maximum — check both against what you typed.",
  INVALID_PARAMETER:
    "The node refused one of this request's values. On an order the usual cause is this device's clock running more than five minutes ahead of the node's, so check the clock and try again.",

  NODE_NOT_SYNCHRONIZED:
    "This node is still catching up with the network and will not accept that yet. Give it a moment and try again, or switch to another node in Settings.",
};

/**
 * Explains a refusal, given the caught value and — where it changes the
 * meaning — what the person was trying to do.
 *
 * Takes the error rather than its message on purpose: the message is the
 * part that says the least, and everything specific is on the object.
 */
export function explainTradeRefusal(error: unknown, attempt?: TradeAttempt): string {
  if (attempt) {
    const name = refusalName(error);
    const specific = name ? BY_ATTEMPT[name]?.[attempt] : undefined;
    if (specific) return specific;
  }
  return explainNodeRefusal(error, BY_NAME);
}
