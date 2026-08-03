import { Client, type Amount, type Reservation, type ReservationState } from "@openfiat/sdk";
import { nodeUrl } from "@/lib/node-endpoint";
import type { PublicSettlement, Settlement } from "@/lib/live-settlements";
import type { SolanaProvider } from "@/lib/wallet-connection";
import { cachedRead, signedRead, type GatedSurface } from "@/lib/wallet-proof";

/**
 * Trades (OFS-2000 §9), in the two shapes a node will hand them out in.
 *
 * `openfiat-core`'s own `trade` crate documents why a trade has no state
 * machine or signed events of its own: "a `Trade` is purely a read-time join
 * of a `Reservation`... and its `Settlement`, if one has started... This
 * specification does not redefine either state machine." The wire shape is
 * exactly that join — see `crates/trade/src/view.rs`.
 *
 * `deriveStatus` below is a client-side port of that same crate's
 * `Trade::status()`, kept here rather than re-derived ad hoc at each call
 * site so every screen collapses the two state machines into one displayed
 * status the same way the node's own domain model does.
 *
 * # Why there are two types, and what the one type used to cost
 *
 * `getTrade`/`getTrades` were once unredacted, and this module typed their
 * answer as the whole `Reservation` and the whole `Settlement`. Both are now
 * redacted: a trade embeds the two records it joins, so leaving this read
 * open while `getReservation` and `getSettlement` were closed left the same
 * trade graph one method along, and openfiat-core closed it.
 *
 * The type did not follow, and the failure was silent in exactly the way a
 * wrong type is. `trade.reservation.requester` compiled, and was `undefined`
 * at runtime for every caller — so `/orders` filtered every trade out and
 * told each wallet it was party to none, and the trade room decided which
 * side of a trade you were on by comparing your peer id against `undefined`.
 * Nothing threw. `PublicTrade` exists so those fields cannot be reached at
 * all, and a party reads their own trades through {@link fetchMyTrades},
 * which is gated and does carry them.
 */

function client(): Client {
  return new Client({ endpoint: nodeUrl(), timeoutMs: 15_000 });
}

/**
 * A reservation as a stranger reads it: what was traded, at what price, in
 * what state, and when. Not who.
 *
 * `advertisement_id` survives deliberately — an advertisement is a public
 * offer that already carries its merchant's peer id on every order-book row,
 * so it discloses one end of an edge that was never private. What it does not
 * disclose is the other end, which is what would make it an edge.
 */
export interface PublicReservation {
  id: string;
  advertisement_id: string;
  amount: Amount;
  agreed_price: Amount;
  agreed_mid: number | null;
  state: ReservationState;
  requested_at: number;
  updated_at: number;
  expires_at: number;
}

/**
 * A trade as a stranger reads it, carrying the node's own derived `status`.
 *
 * The status travels here and not on {@link Trade} because the node derives
 * it for the public view rather than storing it on the join — which is why a
 * party, who reads the fuller record, is the one caller that has to compute
 * it. That is what `deriveStatus` is for.
 */
export interface PublicTrade {
  reservation: PublicReservation;
  settlement: PublicSettlement | null;
  status: TradeStatus;
}

/** A trade a party reads in full, through {@link fetchMyTrades}. */
export interface Trade {
  reservation: Reservation;
  settlement: Settlement | null;
}

/**
 * The aggregate status a screen actually wants — one value instead of "check
 * the reservation state, then check whether a settlement exists, then check
 * its state." A direct port of `openfiat_trade::TradeView::status()`.
 *
 * `Approved` and `Completed` both collapse to `"Completed"` here, matching
 * that Rust method exactly: the distinction between "merchant approved" and
 * "on-chain release independently observed" still lives in
 * `settlement.escrow_release_signature`, which a caller that cares can read
 * directly rather than needing a finer-grained aggregate status.
 */
export type TradeStatus =
  | "EscrowLocked"
  | "AwaitingPayment"
  | "PaymentSubmitted"
  | "Completed"
  | "Rejected"
  | "Cancelled"
  | "Disputed";

/**
 * Display label for each `TradeStatus`, shared so every screen spells it the
 * same way. `as const` so each value is its own literal type — the labels
 * happen to be exactly `lib/types.ts`'s `SettlementStatus` members, and a
 * caller feeding one into `SettlementSteps` needs that literal type, not a
 * widened `string`.
 */
export const TRADE_STATUS_LABEL = {
  EscrowLocked: "Escrow Locked",
  AwaitingPayment: "Awaiting Payment",
  PaymentSubmitted: "Payment Submitted",
  Completed: "Completed",
  Rejected: "Rejected",
  Cancelled: "Cancelled",
  Disputed: "Disputed",
} as const satisfies Record<TradeStatus, string>;

/**
 * Structurally typed over both trade shapes: the derivation reads only the
 * two states, which is all that either view is guaranteed to carry.
 */
export function deriveStatus(trade: {
  reservation: { state: ReservationState };
  settlement: { state: PublicSettlement["state"] } | null;
}): TradeStatus {
  const { reservation, settlement } = trade;
  if (reservation.state === "Cancelled" || reservation.state === "Expired") {
    return "Cancelled";
  }
  if (!settlement) return "EscrowLocked";
  switch (settlement.state) {
    case "AwaitingPayment":
      return "AwaitingPayment";
    case "PaymentSubmitted":
      return "PaymentSubmitted";
    case "Approved":
    case "Completed":
      return "Completed";
    case "Rejected":
      return "Rejected";
    case "Cancelled":
      return "Cancelled";
    case "Disputed":
      return "Disputed";
  }
}

interface IdParams {
  id: string;
}

/** `null` if this node has never seen a reservation with that id. Redacted —
 *  see {@link PublicTrade}. */
export async function fetchTrade(id: string): Promise<PublicTrade | null> {
  return client().call<IdParams, PublicTrade | null>("getTrade", { id });
}

/** Every trade this node currently knows about, redacted. */
export async function fetchTrades(): Promise<PublicTrade[]> {
  return client().call<Record<string, never>, PublicTrade[]>("getTrades", {});
}

/** The copy for the gated read of a wallet's own trades. */
export const MY_TRADES: GatedSurface = {
  challenge: "getWalletChallenge",
  domain: "openfiat-my-trades",
  messages: {
    "not-your-wallet":
      "The node refused: the connected wallet is not a party to these trades. A trade is readable in full only by its requester and, once a settlement exists, its buyer and seller.",
    "challenge-expired":
      "The challenge expired before it was signed — it is only valid for five minutes. Try again and approve the wallet prompt promptly.",
    "challenge-spent": "That challenge was already used. Each one is single-use; try again.",
    "wrong-key": "The signature did not verify against the connected wallet's key.",
    "wallet-cannot-sign":
      "This wallet does not support message signing, which is how you prove these trades are yours.",
    unreachable: "Could not reach the selected node.",
  },
};

/**
 * Every trade the connected wallet is a party to, whole.
 *
 * The node does the filtering, and it is the only thing that can: party means
 * the reservation's requester or either side of the settlement, and none of
 * those three fields survives into the public view. This replaces a
 * client-side filter over `getTrades` that had quietly stopped matching
 * anything at all once that read was redacted.
 */
export async function fetchMyTrades(
  endpoint: string,
  address: string,
  signer: SolanaProvider,
): Promise<Trade[]> {
  return signedRead<Trade[]>(endpoint, "getMyTrades", address, signer, MY_TRADES);
}

/** Memoized per wallet and node, because each read costs a wallet prompt. */
export const myTrades = cachedRead(fetchMyTrades);
