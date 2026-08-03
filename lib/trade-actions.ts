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
 * # What is deliberately absent
 *
 * **Cancelling the reservation off-chain.** `openfiat-reservations` has a
 * `ReservationCancel` event and the registry applies it, but no node
 * exposes a `sendReservationCancel` method — the RPC surface has
 * `sendReservationRequest` and nothing else for reservations. So a taker who
 * changes their mind waits out the 30-minute validation window, and this says
 * so rather than offering a button that has nowhere to post to.
 *
 * **Rejecting a payment.** `SettlementRejected` exists in the same way and
 * has no `sendSettlementRejected` either. A merchant who did not receive the
 * money opens a dispute, which does have a method.
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
  /** Either: `sendDisputeOpen`. */
  | "dispute";

export interface TradeAction {
  kind: TradeActionKind;
  label: string;
  /** What pressing it actually does, in one sentence. */
  detail: string;
  /** Whether it moves value on chain, so the UI can mark it as such. */
  onchain: boolean;
}

export interface TradeSituation {
  /** What this wallet may do now. Empty is an ordinary answer. */
  actions: TradeAction[];
  /**
   * What the trade is waiting on when this wallet cannot move it — never a
   * generic "nothing to do", which reads as a dead end. `null` when the trade
   * has ended.
   */
  waitingOn: string | null;
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

const ACTIONS: Record<TradeActionKind, Omit<TradeAction, "kind">> = {
  initiate: {
    label: "Open the settlement",
    detail:
      "Records the buyer and the merchant against this reservation and starts the payment window. Signed by you, sent to the node — nothing moves on chain.",
    onchain: false,
  },
  "lock-escrow": {
    label: "Lock the escrow",
    detail:
      "Reserves the amount in your liquidity vault, opens the trade escrow, and moves the tokens into it. One transaction, so a reservation can never be left marked against inventory with no escrow behind it.",
    onchain: true,
  },
  "declare-paid": {
    label: "I have sent the payment",
    detail:
      "Tells the merchant the fiat is on its way. Only do this once you have actually sent it — the declaration is signed by you and permanent.",
    onchain: false,
  },
  approve: {
    label: "Confirm the payment arrived",
    detail:
      "Two signatures: the node records your approval, and the escrow program marks the trade approved so the tokens can be released.",
    onchain: true,
  },
  release: {
    label: "Release the escrow",
    detail:
      "Pays the buyer and the four fee treasuries out of the escrow. Anyone may submit it once the merchant has approved, and it goes through the node so the network records the confirmation.",
    onchain: true,
  },
  "cancel-escrow": {
    label: "Return the tokens to the vault",
    detail:
      "Cancels the on-chain escrow and puts the merchant's tokens back in their liquidity vault. Only possible before release.",
    onchain: true,
  },
  dispute: {
    label: "Open a dispute",
    detail:
      "Puts the trade in front of arbitrators. Both parties' evidence comes from the trade channel, and disclosing it to an arbitrator shares the whole conversation permanently.",
    onchain: false,
  },
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
    return {
      actions: [],
      waitingOn: "You are not a party to this trade, so there is nothing here for you to sign.",
    };
  }

  if (!settlement) {
    return side === "buyer"
      ? { actions: [action("initiate")], waitingOn: null }
      : {
          actions: [],
          waitingOn:
            "The taker has reserved against your advertisement but has not opened the settlement yet. Until they do, there is no record naming you as the seller to act on.",
        };
  }

  // The escrow is fundable exactly once: `create_trade_escrow` initializes
  // the account, so a second attempt fails on an account that already exists.
  const funded = escrow !== null && escrow !== undefined;
  const unreadable = escrow === undefined;

  switch (settlement.state) {
    case "AwaitingPayment": {
      if (side === "merchant") {
        if (!funded) {
          return unreadable
            ? {
                actions: [],
                waitingOn:
                  "The cluster could not be read, so whether this trade's escrow already exists is unknown. Locking it again would fail on an account that is already there — reload before signing anything.",
              }
            : { actions: [action("lock-escrow")], waitingOn: null };
        }
        return {
          actions: [action("cancel-escrow"), action("dispute")],
          waitingOn:
            "The escrow holds your tokens. The buyer has not declared the fiat sent yet.",
        };
      }
      if (!funded) {
        return {
          actions: [action("dispute")],
          waitingOn: unreadable
            ? "Whether the merchant has locked the tokens could not be read from the cluster. Do not send any money until it can be."
            : "The merchant has not locked the tokens in escrow yet. Do not send any money until they have — there is nothing on chain backing this trade.",
        };
      }
      return {
        actions: [action("declare-paid"), action("cancel-escrow"), action("dispute")],
        waitingOn: null,
      };
    }

    case "PaymentSubmitted":
      return side === "merchant"
        ? { actions: [action("approve"), action("dispute")], waitingOn: null }
        : {
            actions: [action("dispute")],
            waitingOn:
              "The merchant has been told the payment is sent and has not confirmed it yet.",
          };

    case "Approved":
      // Permissionless, so both sides get it — a buyer should never have to
      // wait on a merchant twice for the same trade.
      return {
        actions: [action("release")],
        waitingOn: funded
          ? null
          : "This settlement is approved but no escrow was ever funded for it, so there is nothing to release.",
      };

    case "Completed":
    case "Rejected":
    case "Cancelled":
      return { actions: [], waitingOn: null };

    case "Disputed":
      return {
        actions: [],
        waitingOn:
          "This trade is with arbitrators. The escrow moves on their decision, not on either party's signature.",
      };
  }
}
