import type { Trade } from "@/lib/live-trades";
import type { DecodedTradeEscrow } from "@/lib/onchain-decode";

/**
 * What the person looking at a trade can actually do to it, and — just as
 * important — what they are waiting on when they can do nothing.
 *
 * Split out of the trade room as a pure function because the rules are the
 * two state machines plus a question of side, and all three are easy to get
 * subtly wrong in a way no screenshot catches: an approve button offered to a
 * buyer, a release offered before approval, an "I paid" offered on a trade
 * whose escrow was never funded. Each of those produces a wallet prompt the
 * node or the program then refuses, which reads to the user as the app being
 * broken.
 *
 * # Where the rules come from
 *
 * - `ReservationState` (OFS-2200): `EscrowLocked` is the only live state;
 *   `Cancelled` and `Expired` are ends.
 * - `SettlementState` (OFS-2300): `AwaitingPayment` → `PaymentSubmitted` →
 *   `Approved` → `Completed`, plus `Rejected`, `Cancelled`, `Disputed`.
 * - The escrow program: `reserve`/`create`/`fund`/`approve` take the
 *   **merchant** as signer, `release` takes none, `cancel` takes either
 *   party.
 *
 * # The four ways out, which used to be one
 *
 * Until recently the only exit from a trade that had gone wrong was
 * `sendDisputeOpen` — arbitrators, a filing fee and a frozen escrow to
 * express something the protocol already modelled as a plain refusal — or
 * waiting out the 30-minute validation window. The node now exposes all
 * four of the cheap exits, and every one of them is offered here:
 *
 * - `sendReservationCancel` — the taker changing their mind before a
 *   settlement exists, instead of holding a merchant's inventory for half
 *   an hour. Only the requester may; the merchant's remedy stays the
 *   window lapsing, which is the trade they accepted when they published.
 * - `sendSettlementCancelled` — either party walking away, legal only from
 *   `AwaitingPayment`. That restriction is what stops it being a theft
 *   primitive.
 * - `sendPaymentReversed` — the buyer taking back a mistaken "I paid",
 *   legal only from `PaymentSubmitted`, so it can never escape a decision
 *   the merchant has already taken.
 * - `sendSettlementRejected` — the merchant refusing a payment they cannot
 *   find, without paying to open a dispute. Not a ruling: a buyer who
 *   really did pay can still dispute afterwards.
 *
 * # The one window nothing here can close
 *
 * Between a buyer's fiat leaving their bank and that buyer declaring it.
 * `AwaitingPayment` is cancellable by *either* party, so a merchant can
 * cancel out from under money that has genuinely moved. Declaring costs
 * the buyer nothing and is reversible; the window is not. Every piece of
 * copy below is written on that basis.
 */

/** Which side of this trade the connected wallet is on. */
export type TradeSide = "buyer" | "merchant" | "observer";

export function tradeSide(trade: Trade, myPeerId: string | null): TradeSide {
  if (!myPeerId) return "observer";
  const { reservation, settlement } = trade;
  if (settlement) {
    if (settlement.buyer === myPeerId) return "buyer";
    if (settlement.seller === myPeerId) return "merchant";
    return "observer";
  }
  // Before a settlement exists the requester is the trade's only named party,
  // and a reservation is always raised by the taker.
  return reservation.requester === myPeerId ? "buyer" : "observer";
}

/** Everything a trade room can offer. One name per protocol action. */
export type TradeActionKind =
  /** Buyer: `sendSettlementInitiate` — opens the settlement for a reservation. */
  | "initiate"
  /** Merchant: `reserve` + `create_trade_escrow` + `fund_trade_escrow`, on chain. */
  | "lock-escrow"
  /** Buyer: `sendPaymentSubmitted`. */
  | "declare-paid"
  /** Merchant: `sendSettlementApproved` plus the on-chain `approve_settlement`. */
  | "approve"
  /** Either: the permissionless `release_escrow`, relayed through the node. */
  | "release"
  /** Either: `cancel_reservation`, returning the tokens to the merchant's vault. */
  | "cancel-escrow"
  /** Taker: `sendReservationCancel`, before any settlement exists. */
  | "cancel-reservation"
  /** Either: `sendSettlementCancelled`, only from `AwaitingPayment`. */
  | "cancel-settlement"
  /** Buyer: `sendPaymentReversed`, only from `PaymentSubmitted`. */
  | "reverse-payment"
  /** Merchant: `sendSettlementRejected`, only from `PaymentSubmitted`. */
  | "reject-payment"
  /** Either: `sendDisputeOpen`. */
  | "dispute";

export interface TradeAction {
  kind: TradeActionKind;
  /** Whether it moves value on chain, so the UI can mark it as such. */
  onchain: boolean;
  /**
   * Whether it ends the trade or takes something back, so the UI can stop
   * it looking like the step forward it sits next to.
   *
   * Set here rather than inferred from the name at the call site: "cancel
   * the trade" and "confirm the payment arrived" are one keystroke apart in
   * a column of identical buttons, and which of them is the destructive one
   * is a property of the protocol action, not of the styling.
   *
   * The button's own words (label, one-line detail) are not here: they are
   * user-facing copy, so the trade room resolves them from its message
   * catalogue keyed by `kind`, and this stays a pure statement of the rules.
   */
  destructive?: boolean;
}

/**
 * Why a wallet cannot move a trade right now, as a stable key rather than a
 * sentence. The trade room turns each into localized prose — the rules
 * belong here, the words belong to the catalogue. Every branch below that
 * returns no action returns one of these, because "nothing to do" with no
 * reason reads as a dead end.
 */
export type WaitingReason =
  | "observer"
  | "merchantNoSettlement"
  | "merchantEscrowUnknown"
  | "merchantEscrowHeld"
  | "buyerEscrowUnreadable"
  | "buyerNotLocked"
  | "buyerAwaitingConfirm"
  | "approvedNoEscrow"
  | "disputed";

export interface TradeSituation {
  /** What this wallet may do now. Empty is an ordinary answer. */
  actions: TradeAction[];
  /**
   * What the trade is waiting on when this wallet cannot move it — never a
   * generic "nothing to do", which reads as a dead end. `null` when the trade
   * has ended.
   */
  waitingOn: WaitingReason | null;
}

export interface TradeContext {
  trade: Trade;
  side: TradeSide;
  /**
   * The on-chain escrow, `null` when none exists, `undefined` when the
   * cluster has not been read yet or could not be reached.
   *
   * The three are different answers and the distinction survives into the
   * UI: "the merchant has not funded this" and "we could not ask" must never
   * be shown with the same words.
   */
  escrow: DecodedTradeEscrow | null | undefined;
}

/** The rules for each action — its on-chain and destructive flags. The
 *  label and one-line detail are user copy, resolved by the trade room from
 *  its message catalogue keyed by the action kind. */
const ACTIONS: Record<TradeActionKind, Omit<TradeAction, "kind">> = {
  initiate: { onchain: false },
  "lock-escrow": { onchain: true },
  "declare-paid": { onchain: false },
  approve: { onchain: true },
  release: { onchain: true },
  "cancel-escrow": { onchain: true, destructive: true },
  "cancel-reservation": { onchain: false, destructive: true },
  "cancel-settlement": { onchain: false, destructive: true },
  "reverse-payment": { onchain: false, destructive: true },
  "reject-payment": { onchain: false, destructive: true },
  dispute: { onchain: false },
};

function action(kind: TradeActionKind): TradeAction {
  return { kind, ...ACTIONS[kind] };
}

/**
 * The actions and the waiting message for one trade, one side, one moment.
 *
 * Deliberately total: every combination returns something, and "observer"
 * returns no actions at all rather than the buyer's by default. A screen
 * that guessed a side would offer a stranger a button that spends nobody's
 * money and fails, which is worse than showing them nothing.
 */
export function tradeSituation(context: TradeContext): TradeSituation {
  const { trade, side, escrow } = context;
  const { reservation, settlement } = trade;

  if (reservation.state !== "EscrowLocked") {
    return { actions: [], waitingOn: null };
  }

  if (side === "observer") {
    return { actions: [], waitingOn: "observer" };
  }

  if (!settlement) {
    // `apply_cancel` requires the reservation to still be `EscrowLocked`,
    // which the guard above has already established, and refuses anyone but
    // the requester — who is the only party a reservation names, and so the
    // only side this branch can be reached from as anything but an observer.
    return side === "buyer"
      ? { actions: [action("initiate"), action("cancel-reservation")], waitingOn: null }
      : { actions: [], waitingOn: "merchantNoSettlement" };
  }

  // The escrow is fundable exactly once: `create_trade_escrow` initializes
  // the account, so a second attempt fails on an account that already exists.
  const funded = escrow !== null && escrow !== undefined;
  const unreadable = escrow === undefined;

  switch (settlement.state) {
    case "AwaitingPayment": {
      if (side === "merchant") {
        if (!funded) {
          // Cancelling is offered even when the escrow could not be read,
          // because it touches nothing on chain: a merchant who has decided
          // against the trade should not have to wait for a cluster to answer
          // before they can say so.
          return unreadable
            ? {
                actions: [action("cancel-settlement")],
                waitingOn: "merchantEscrowUnknown",
              }
            : {
                actions: [action("lock-escrow"), action("cancel-settlement")],
                waitingOn: null,
              };
        }
        return {
          actions: [action("cancel-settlement"), action("cancel-escrow"), action("dispute")],
          waitingOn: "merchantEscrowHeld",
        };
      }
      if (!funded) {
        return {
          actions: [action("cancel-settlement"), action("dispute")],
          waitingOn: unreadable ? "buyerEscrowUnreadable" : "buyerNotLocked",
        };
      }
      return {
        actions: [
          action("declare-paid"),
          action("cancel-settlement"),
          action("cancel-escrow"),
          action("dispute"),
        ],
        waitingOn: null,
      };
    }

    case "PaymentSubmitted":
      return side === "merchant"
        ? {
            actions: [action("approve"), action("reject-payment"), action("dispute")],
            waitingOn: null,
          }
        : {
            // The buyer keeps a way back out of a declaration made in error,
            // and it is deliberately not a cancel: reversal returns the trade
            // to `AwaitingPayment`, which re-arms the merchant's cancel.
            actions: [action("reverse-payment"), action("dispute")],
            waitingOn: "buyerAwaitingConfirm",
          };

    case "Approved":
      // Permissionless, so both sides get it — a buyer should never have to
      // wait on a merchant twice for the same trade.
      return {
        actions: [action("release")],
        waitingOn: funded ? null : "approvedNoEscrow",
      };

    case "Completed":
    case "Rejected":
    case "Cancelled":
      return { actions: [], waitingOn: null };

    case "Disputed":
      return { actions: [], waitingOn: "disputed" };
  }
}
