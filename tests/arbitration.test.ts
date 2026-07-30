import { describe, expect, it, beforeEach } from "vitest";
import {
  buildCommit,
  buildJoin,
  buildReveal,
  clearSalt,
  commitmentFor,
  hasCommitted,
  hasJoined,
  hasRevealed,
  isJoinable,
  loadSalt,
  newSalt,
  OFFCHAIN_VOTE_BYTE,
  OFFCHAIN_VOTE_NAME,
  ONCHAIN_OUTCOME_BYTE,
  saveSalt,
} from "@/lib/arbitration";
import type { Dispute, PublicDispute } from "@/lib/live-disputes";

const who = { publicKey: new Uint8Array(32).fill(7), peerId: [1, 2, 3] };

describe("outcome byte tables", () => {
  // The bug this guards against is real: committing the off-chain byte to the
  // chain produces a commitment that can never be revealed, because the
  // on-chain enum has an extra MutualSettlement variant at 2.
  it("agree on buyer/merchant but diverge on invalid", () => {
    expect(OFFCHAIN_VOTE_BYTE.buyerWins).toBe(ONCHAIN_OUTCOME_BYTE.buyerWins);
    expect(OFFCHAIN_VOTE_BYTE.merchantWins).toBe(ONCHAIN_OUTCOME_BYTE.merchantWins);
    expect(OFFCHAIN_VOTE_BYTE.invalid).toBe(2);
    expect(ONCHAIN_OUTCOME_BYTE.invalid).toBe(3);
  });

  it("never offers MutualSettlement as an arbitrator ruling", () => {
    // 2 on-chain is MutualSettlement, reached by the parties agreeing rather
    // than by an arbitrator, and it has no off-chain Vote variant.
    expect(Object.values(ONCHAIN_OUTCOME_BYTE)).not.toContain(2);
  });

  it("uses serde's unit-variant names for the off-chain vote", () => {
    expect(OFFCHAIN_VOTE_NAME).toEqual({
      buyerWins: "BuyerWins",
      merchantWins: "MerchantWins",
      invalid: "Invalid",
    });
  });
});

describe("commitment", () => {
  it("is sha256(outcome_byte || salt) and differs per side for invalid", async () => {
    const salt = new Uint8Array(32).fill(9);
    const off = await commitmentFor(OFFCHAIN_VOTE_BYTE.invalid, salt);
    const on = await commitmentFor(ONCHAIN_OUTCOME_BYTE.invalid, salt);
    expect(off).toHaveLength(32);
    expect(Array.from(off)).not.toEqual(Array.from(on));
  });

  it("is stable for the same input and changes with the salt", async () => {
    const a = await commitmentFor(0, new Uint8Array(32).fill(1));
    const b = await commitmentFor(0, new Uint8Array(32).fill(1));
    const c = await commitmentFor(0, new Uint8Array(32).fill(2));
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(a)).not.toEqual(Array.from(c));
  });
});

describe("payload key order", () => {
  // The node verifies a signature over JSON.stringify(payload), so key order
  // must match the Rust struct's field order exactly or every signature fails.
  it("matches the Rust field order for each event", () => {
    expect(Object.keys(buildJoin("d1", who))).toEqual([
      "dispute_id",
      "arbitrator",
      "arbitrator_public_key",
      "timestamp",
    ]);
    expect(Object.keys(buildCommit("d1", who, new Uint8Array(32)))).toEqual([
      "dispute_id",
      "arbitrator",
      "commitment",
      "timestamp",
    ]);
    expect(Object.keys(buildReveal("d1", who, "invalid", new Uint8Array(32)))).toEqual([
      "dispute_id",
      "arbitrator",
      "vote",
      "secret",
      "timestamp",
    ]);
  });

  it("serialises the reveal's vote as its variant name", () => {
    expect(buildReveal("d1", who, "invalid", new Uint8Array(32)).vote).toBe("Invalid");
  });
});

describe("salt persistence", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips and can be cleared", () => {
    const salt = newSalt();
    saveSalt("d1", salt, "buyerWins");
    const loaded = loadSalt("d1");
    expect(loaded?.outcome).toBe("buyerWins");
    expect(Array.from(loaded?.salt ?? [])).toEqual(Array.from(salt));
    clearSalt("d1");
    expect(loadSalt("d1")).toBeNull();
  });

  it("returns null rather than throwing on missing or corrupt entries", () => {
    expect(loadSalt("never-saved")).toBeNull();
    localStorage.setItem("openfiat-arbitration-salt:d2", "not json");
    expect(loadSalt("d2")).toBeNull();
    localStorage.setItem(
      "openfiat-arbitration-salt:d3",
      JSON.stringify({ salt: [1, 2], outcome: "buyerWins" }),
    );
    expect(loadSalt("d3")).toBeNull();
  });
});

describe("case state", () => {
  /**
   * The whole record, which only `getMyDisputes` returns. Where an
   * arbitrator sits on a case and how they voted is not in the public read
   * at all, so these three questions can only be asked of a case this
   * wallet is entitled to.
   */
  const dispute: Dispute = {
    id: "d1",
    settlement_id: "s1",
    buyer: [4, 4, 4],
    buyer_public_key: [],
    seller: [5, 5, 5],
    seller_public_key: [],
    opener: [4, 4, 4],
    reason: "no payment",
    status: "Open",
    required_arbitrators: 3,
    arbitrators: [[1, 2, 3]],
    arbitrator_keys: [],
    commitments: [{ arbitrator: [1, 2, 3], commitment: [] }],
    reveals: [],
    resolution: null,
    buyer_agreed_mutual_settlement: false,
    seller_agreed_mutual_settlement: false,
    onchain_execution_signature: null,
    opened_at: 1,
    updated_at: 2,
  };

  it("reads this arbitrator's progress by peer id", () => {
    expect(hasJoined(dispute, [1, 2, 3])).toBe(true);
    expect(hasJoined(dispute, [9, 9, 9])).toBe(false);
    expect(hasCommitted(dispute, [1, 2, 3])).toBe(true);
    expect(hasRevealed(dispute, [1, 2, 3])).toBe(false);
  });

  /**
   * Joinability is asked of the *public* docket, and has to stay that way:
   * a prospective arbitrator has to see a free seat on a case they are not
   * in yet, which is precisely why the seat count survives redaction while
   * the roster does not.
   */
  const open: PublicDispute = {
    id: "d1",
    settlement_id: "s1",
    status: "Open",
    required_arbitrators: 3,
    arbitrators_seated: 1,
    commitments: 1,
    reveals: 0,
    resolution: null,
    onchain_execution_signature: null,
    opened_at: 1,
    updated_at: 2,
  };

  it("treats a case as joinable only while open and under quota", () => {
    expect(isJoinable(open)).toBe(true);
    expect(isJoinable({ ...open, status: "CaseLocked" })).toBe(false);
    expect(isJoinable({ ...open, arbitrators_seated: 3 })).toBe(false);
  });
});
