import { Client, type Reservation } from "@openfiat/sdk";
import { nodeUrl } from "@/lib/node-endpoint";
import type { Settlement } from "@/lib/live-settlements";

/**
 * Trades (OFS-2000 §9), read from a node's `getTrade`/`getTrades`.
 *
 * `openfiat-core`'s own `trade` crate documents why a trade has no state
 * machine or signed events of its own: "a `Trade` is purely a read-time join
 * of a `Reservation`... and its `Settlement`, if one has started... This
 * specification does not redefine either state machine." The wire shape is
 * exactly that join — see `crates/trade/src/view.rs` — so this module's
 * `Trade` type is nothing more than `{ reservation, settlement }`.
 *
 * `deriveStatus` below is a client-side port of that same crate's
 * `Trade::status()`, kept here rather than re-derived ad hoc at each call
 * site so every screen collapses the two state machines into one displayed
 * status the same way the node's own domain model does.
 */

function client(): Client {
  return new Client({ endpoint: nodeUrl(), timeoutMs: 15_000 });
}

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

export function deriveStatus(trade: Trade): TradeStatus {
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

/** `null` if this node has never seen a reservation with that id. */
export async function fetchTrade(id: string): Promise<Trade | null> {
  return client().call<IdParams, Trade | null>("getTrade", { id });
}

/** Every trade this node currently knows about. */
export async function fetchTrades(): Promise<Trade[]> {
  return client().call<Record<string, never>, Trade[]>("getTrades", {});
}

const sameBytes = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Trades where the given PeerId is a party — the requester on the
 * reservation, or the buyer/seller once a settlement exists. There is no
 * per-wallet RPC filter (`getTrades` returns everything this node knows
 * about), so the scoping happens here, the same way `live-advertisements.ts`
 * scopes the merchant console's ad list client-side.
 */
export function tradesForPeer(trades: Trade[], peerId: number[]): Trade[] {
  return trades.filter((t) => {
    if (sameBytes(t.reservation.requester, peerId)) return true;
    const s = t.settlement;
    return s ? sameBytes(s.buyer, peerId) || sameBytes(s.seller, peerId) : false;
  });
}
