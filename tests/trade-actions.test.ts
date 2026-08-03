import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";

import type { Trade } from "@/lib/live-trades";
import type { Settlement, SettlementState } from "@/lib/live-settlements";
import type { DecodedTradeEscrow } from "@/lib/onchain-decode";
import { tradeSide, tradeSituation, type TradeActionKind } from "@/lib/trade-actions";

/**
 * Who may do what, in each state of the two state machines a trade runs on.
 *
 * These rules are easy to get subtly wrong in a way no screenshot catches: an
 * approve button offered to a buyer, a release offered before approval, an "I
 * paid" offered on a trade whose escrow was never funded. Each of those puts
 * up a wallet prompt the node or the program then refuses, which reads to the
 * person at the screen as the app being broken.
 *
 * The three-valued escrow is asserted throughout. `null` (no escrow exists)
 * and `undefined` (the cluster could not be read) must never produce the same
 * advice — telling a buyer nothing backs their trade because a Solana RPC
 * timed out is the one error here with a real cost.
 */

const BUYER = "12D3KooWD8fTWxDnfs52x7tMtoHtKjgSa5GYKR1T5agco1hqyq6Y";
const MERCHANT = "12D3KooWSoBhn76B5upvpXipmuV9aiRU29PcvhMHKFFa7TkXtq4v";
const STRANGER = "12D3KooWStranger00000000000000000000000000000000000000";

function settlement(state: SettlementState): Settlement {
  return {
    id: "s-1",
    reservation_id: "42",
    amount: { base_units: 1_000_000, decimals: 6 },
    state,
    escrow_release_signature: null,
    payment_submitted_at: null,
    merchant_responded_at: null,
    payment_discrepancy: null,
    created_at: 1,
    updated_at: 2,
    buyer: BUYER,
    buyer_public_key: "bb",
    seller: MERCHANT,
    seller_public_key: "ss",
    payment_reference: null,
  };
}

function trade(
  state: Trade["reservation"]["state"],
  settlementState: SettlementState | null,
): Trade {
  return {
    reservation: {
      id: "42",
      advertisement_id: "ad-1",
      requester: BUYER,
      requester_public_key: "bb",
      amount: { base_units: 1_000_000, decimals: 6 },
      agreed_price: { base_units: 129_500_000, decimals: 6 },
      agreed_mid: null,
      state,
      requested_at: 1,
      updated_at: 1,
      expires_at: 2,
    },
    settlement: settlementState === null ? null : settlement(settlementState),
  };
}

const escrow: DecodedTradeEscrow = {
  reservationId: 42n,
  buyer: PublicKey.default,
  seller: PublicKey.default,
  mint: PublicKey.default,
  amount: 1_000_000n,
  state: "AwaitingFiatSettlement",
  approved: false,
  createdAt: 0n,
  timeoutAt: 0n,
  bump: 0,
  tokenVaultBump: 0,
};

const kinds = (
  situation: { actions: { kind: TradeActionKind }[] },
): TradeActionKind[] => situation.actions.map((action) => action.kind);

describe("which side of a trade a wallet is on", () => {
  it("reads it off the settlement once one exists", () => {
    const open = trade("EscrowLocked", "AwaitingPayment");
    expect(tradeSide(open, BUYER)).toBe("buyer");
    expect(tradeSide(open, MERCHANT)).toBe("merchant");
    expect(tradeSide(open, STRANGER)).toBe("observer");
  });

  it("falls back to the requester before a settlement exists", () => {
    const reserved = trade("EscrowLocked", null);
    expect(tradeSide(reserved, BUYER)).toBe("buyer");
    // The merchant is not named on a reservation at all, so they are an
    // observer of it — which is exactly why they have nothing to sign yet.
    expect(tradeSide(reserved, MERCHANT)).toBe("observer");
  });

  it("is an observer with no wallet, never a default side", () => {
    expect(tradeSide(trade("EscrowLocked", "AwaitingPayment"), null)).toBe("observer");
  });
});

describe("what each party can do", () => {
  it("offers a taker the settlement they have not opened yet", () => {
    const situation = tradeSituation({
      trade: trade("EscrowLocked", null),
      side: "buyer",
      escrow: null,
    });
    expect(kinds(situation)).toEqual(["initiate"]);
  });

  it("tells a merchant what they are waiting on before a settlement exists", () => {
    const situation = tradeSituation({
      trade: trade("EscrowLocked", null),
      side: "merchant",
      escrow: null,
    });
    expect(situation.actions).toEqual([]);
    expect(situation.waitingOn).toMatch(/has not opened the settlement/);
  });

  it("offers a merchant the escrow while none exists", () => {
    const situation = tradeSituation({
      trade: trade("EscrowLocked", "AwaitingPayment"),
      side: "merchant",
      escrow: null,
    });
    expect(kinds(situation)).toEqual(["lock-escrow"]);
  });

  it("does not offer a merchant a second escrow for the same reservation", () => {
    // `create_trade_escrow` initializes the account, so a second attempt
    // fails on an account that already exists.
    const situation = tradeSituation({
      trade: trade("EscrowLocked", "AwaitingPayment"),
      side: "merchant",
      escrow,
    });
    expect(kinds(situation)).not.toContain("lock-escrow");
  });

  it("refuses to advise a merchant at all when the cluster could not be read", () => {
    const situation = tradeSituation({
      trade: trade("EscrowLocked", "AwaitingPayment"),
      side: "merchant",
      escrow: undefined,
    });
    expect(situation.actions).toEqual([]);
    expect(situation.waitingOn).toMatch(/could not be read/);
  });

  it("does not let a buyer declare payment before the tokens are locked", () => {
    const situation = tradeSituation({
      trade: trade("EscrowLocked", "AwaitingPayment"),
      side: "buyer",
      escrow: null,
    });
    expect(kinds(situation)).not.toContain("declare-paid");
    expect(situation.waitingOn).toMatch(/Do not send any money/);
  });

  it("says something different when the escrow could not be read", () => {
    const unread = tradeSituation({
      trade: trade("EscrowLocked", "AwaitingPayment"),
      side: "buyer",
      escrow: undefined,
    }).waitingOn;
    const absent = tradeSituation({
      trade: trade("EscrowLocked", "AwaitingPayment"),
      side: "buyer",
      escrow: null,
    }).waitingOn;
    expect(unread).not.toBe(absent);
    expect(unread).toMatch(/could not be read/);
  });

  it("lets a buyer declare payment once the escrow holds the tokens", () => {
    const situation = tradeSituation({
      trade: trade("EscrowLocked", "AwaitingPayment"),
      side: "buyer",
      escrow,
    });
    expect(kinds(situation)).toContain("declare-paid");
  });

  it("offers approval only to the merchant, and only after payment is declared", () => {
    const merchant = tradeSituation({
      trade: trade("EscrowLocked", "PaymentSubmitted"),
      side: "merchant",
      escrow,
    });
    expect(kinds(merchant)).toContain("approve");

    const buyer = tradeSituation({
      trade: trade("EscrowLocked", "PaymentSubmitted"),
      side: "buyer",
      escrow,
    });
    expect(kinds(buyer)).not.toContain("approve");

    const early = tradeSituation({
      trade: trade("EscrowLocked", "AwaitingPayment"),
      side: "merchant",
      escrow,
    });
    expect(kinds(early)).not.toContain("approve");
  });

  it("offers the release to both parties, because it takes no signer", () => {
    for (const side of ["buyer", "merchant"] as const) {
      const situation = tradeSituation({
        trade: trade("EscrowLocked", "Approved"),
        side,
        escrow,
      });
      expect(kinds(situation)).toEqual(["release"]);
    }
  });

  it("does not offer a release before approval", () => {
    for (const state of ["AwaitingPayment", "PaymentSubmitted"] as const) {
      const situation = tradeSituation({
        trade: trade("EscrowLocked", state),
        side: "buyer",
        escrow,
      });
      expect(kinds(situation)).not.toContain("release");
    }
  });

  it("says so when an approved settlement has no escrow behind it", () => {
    const situation = tradeSituation({
      trade: trade("EscrowLocked", "Approved"),
      side: "buyer",
      escrow: null,
    });
    expect(situation.waitingOn).toMatch(/nothing to release/);
  });

  it("offers nothing on a trade that has ended", () => {
    for (const state of ["Completed", "Rejected", "Cancelled"] as const) {
      const situation = tradeSituation({
        trade: trade("EscrowLocked", state),
        side: "buyer",
        escrow,
      });
      expect(situation.actions).toEqual([]);
      expect(situation.waitingOn).toBeNull();
    }
  });

  it("offers nothing once a reservation has lapsed or been cancelled", () => {
    for (const state of ["Expired", "Cancelled"] as const) {
      const situation = tradeSituation({
        trade: trade(state, "AwaitingPayment"),
        side: "merchant",
        escrow,
      });
      expect(situation.actions).toEqual([]);
    }
  });

  it("hands a disputed trade to the arbitrators rather than to either party", () => {
    const situation = tradeSituation({
      trade: trade("EscrowLocked", "Disputed"),
      side: "merchant",
      escrow,
    });
    expect(situation.actions).toEqual([]);
    expect(situation.waitingOn).toMatch(/arbitrators/);
  });

  it("offers a stranger nothing at all, and says why", () => {
    const situation = tradeSituation({
      trade: trade("EscrowLocked", "PaymentSubmitted"),
      side: "observer",
      escrow,
    });
    expect(situation.actions).toEqual([]);
    expect(situation.waitingOn).toMatch(/not a party/);
  });

  it("lets either party dispute a live trade", () => {
    for (const state of ["AwaitingPayment", "PaymentSubmitted"] as const) {
      for (const side of ["buyer", "merchant"] as const) {
        expect(
          kinds(tradeSituation({ trade: trade("EscrowLocked", state), side, escrow })),
        ).toContain("dispute");
      }
    }
  });

  it("marks exactly the actions that move value on chain", () => {
    const onchain = new Set<TradeActionKind>();
    const offchain = new Set<TradeActionKind>();
    for (const state of ["AwaitingPayment", "PaymentSubmitted", "Approved"] as const) {
      for (const side of ["buyer", "merchant"] as const) {
        for (const escrowState of [null, escrow]) {
          for (const action of tradeSituation({
            trade: trade("EscrowLocked", state),
            side,
            escrow: escrowState,
          }).actions) {
            (action.onchain ? onchain : offchain).add(action.kind);
          }
        }
      }
    }
    expect([...onchain].sort()).toEqual(["approve", "cancel-escrow", "lock-escrow", "release"]);
    expect([...offchain].sort()).toEqual(["declare-paid", "dispute"]);
  });
});
