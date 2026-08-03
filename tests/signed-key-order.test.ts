import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The field order of every signed payload this app sends, asserted against
 * the Rust struct it mirrors.
 *
 * # Why this is worth a test file of its own
 *
 * The node re-serialises the payload with `serde_json`, which emits fields
 * in struct declaration order, and verifies the signature over **its own**
 * rendering. `JSON.stringify` emits insertion order. So a builder that
 * assembles the same fields in a different order produces a perfectly valid
 * signature over bytes the node never hashes, and the node answers
 * `INVALID_SIGNATURE` — a code indistinguishable, on screen, from a wallet
 * fault or a wrong key.
 *
 * Confirmed against a live node while writing these: moving `author` one
 * field earlier in `ProposalCreate` is refused with exactly that code and
 * nothing else changes.
 *
 * Nothing else catches this. It type-checks, it lints, and it fails only at
 * the one moment a user has already approved a wallet prompt.
 *
 * The expected orders below are transcribed from openfiat-core and each
 * names its struct, so the two can be diffed by eye when a field is added.
 */

const signed: Array<{ method: string; envelope: Record<string, unknown> }> = [];

vi.mock("@/lib/arbitration", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/arbitration")>();
  return {
    ...actual,
    signPayload: async () => "sig",
    sendSignedEvent: async (_endpoint: string, method: string, envelope: Record<string, unknown>) => {
      signed.push({ method, envelope });
      return "ok";
    },
  };
});
vi.mock("@/lib/node-endpoint", () => ({ nodeUrl: () => "https://node.example" }));

const { cancelReservation, cancelSettlement, rejectSettlement, reversePayment, tradeIdentity } =
  await import("@/lib/trade-flow");
const { buildProposalCreate, buildVoteCast, castNodeVote, createProposal } = await import(
  "@/lib/proposal-flow"
);
const { buildReview, publishReview } = await import("@/lib/review-flow");

/** A signer that never has to do anything: `signPayload` is mocked out. */
const provider = {} as Parameters<typeof tradeIdentity>[0];
const ADDRESS = "6dVJmJPzeazcXjPCA6Twe4hHXf24pMV24yZTCVwFDcMK";
const who = () => tradeIdentity(provider, ADDRESS);

beforeEach(() => {
  signed.length = 0;
});

/** The payload of the one event sent, whatever key its envelope wraps it in. */
function sentPayload(): Record<string, unknown> {
  expect(signed).toHaveLength(1);
  const { envelope } = signed[0]!;
  const [key] = Object.keys(envelope).filter((name) => name !== "signature");
  return envelope[key!] as Record<string, unknown>;
}

describe("governance payloads", () => {
  it("builds ProposalCreate in the struct's declaration order", () => {
    // openfiat_governance::events::ProposalCreate
    expect(
      Object.keys(
        buildProposalCreate(who(), {
          id: "ofip-1",
          title: "t",
          summary: "s",
          category: "Protocol",
          onchainProposalId: null,
        }),
      ),
    ).toEqual([
      "id",
      "title",
      "summary",
      "category",
      "author",
      "author_public_key",
      "onchain_proposal_id",
      "timestamp",
    ]);
  });

  it("spells an absent on-chain claim as an explicit null, never as a missing key", () => {
    // `Option<u64>` renders as `null` under serde, and the key is inside the
    // bytes the node verifies. Omitting it changes the transcript.
    const create = buildProposalCreate(who(), {
      id: "ofip-1",
      title: "t",
      summary: "s",
      category: "Protocol",
      onchainProposalId: null,
    });
    expect("onchain_proposal_id" in create).toBe(true);
    expect(create.onchain_proposal_id).toBeNull();
    expect(JSON.stringify(create)).toContain('"onchain_proposal_id":null');
  });

  it("builds VoteCast in the struct's declaration order", () => {
    // openfiat_governance::events::VoteCast
    expect(
      Object.keys(
        buildVoteCast(who(), {
          proposalId: "ofip-1",
          choice: "Approve",
          stakeAccount: "11111111111111111111111111111111",
          claimedWeight: 1,
        }),
      ),
    ).toEqual([
      "proposal_id",
      "voter",
      "voter_public_key",
      "choice",
      "weight",
      "stake_account",
      "timestamp",
    ]);
  });

  it("sends the proposal and the vote under the envelope keys the node destructures", async () => {
    await createProposal(who(), {
      id: "ofip-1",
      title: "t",
      summary: "s",
      category: "Protocol",
      onchainProposalId: 7,
    });
    expect(signed[0]!.method).toBe("sendProposalCreate");
    expect(Object.keys(signed[0]!.envelope).sort()).toEqual(["create", "signature"]);

    signed.length = 0;
    await castNodeVote(who(), {
      proposalId: "ofip-1",
      choice: "Reject",
      stakeAccount: "11111111111111111111111111111111",
      claimedWeight: 0,
    });
    expect(signed[0]!.method).toBe("sendVoteCast");
    expect(Object.keys(signed[0]!.envelope).sort()).toEqual(["signature", "vote"]);
  });
});

describe("review payload", () => {
  it("builds Review in the struct's declaration order", () => {
    // openfiat_reviews::record::Review
    expect(Object.keys(buildReview(who(), "s-1", 5, "fast"))).toEqual([
      "settlement",
      "author",
      "author_public_key",
      "rating",
      "comment",
      "created_at",
    ]);
  });

  it("sends the rating as the plain integer, not the enum's variant name", async () => {
    // `Rating` carries a hand-written `serialize_u8`, so the number is what
    // the node hashes — the word would be a different transcript, and this
    // app has already shipped that mistake once in the read direction.
    await publishReview(who(), "s-1", 4, "fine");
    expect(sentPayload().rating).toBe(4);
    expect(signed[0]!.method).toBe("sendReviewPublish");
    expect(Object.keys(signed[0]!.envelope).sort()).toEqual(["review", "signature"]);
  });
});

describe("the four ways out of a trade", () => {
  it("builds ReservationCancel in the struct's declaration order", async () => {
    // openfiat_reservations::events::ReservationCancel
    await cancelReservation(who(), "42");
    expect(Object.keys(sentPayload())).toEqual(["id", "requester", "timestamp"]);
    expect(signed[0]!.method).toBe("sendReservationCancel");
    expect(Object.keys(signed[0]!.envelope).sort()).toEqual(["cancel", "signature"]);
  });

  it("builds SettlementCancelled in the struct's declaration order", async () => {
    // openfiat_settlement::events::SettlementCancelled
    await cancelSettlement(who(), "s-1");
    expect(Object.keys(sentPayload())).toEqual(["settlement_id", "canceller", "timestamp"]);
    expect(signed[0]!.method).toBe("sendSettlementCancelled");
  });

  it("builds PaymentReversed in the struct's declaration order", async () => {
    // openfiat_settlement::events::PaymentReversed
    await reversePayment(who(), "s-1");
    expect(Object.keys(sentPayload())).toEqual(["settlement_id", "buyer", "timestamp"]);
    expect(signed[0]!.method).toBe("sendPaymentReversed");
  });

  it("builds SettlementRejected in the struct's declaration order", async () => {
    // openfiat_settlement::events::SettlementRejected — `reason` before
    // `discrepancy`, which is the pair most easily written the other way
    // round because a UI collects them in the opposite order.
    await rejectSettlement(who(), "s-1", "no transfer found", "WrongReference");
    expect(Object.keys(sentPayload())).toEqual([
      "settlement_id",
      "seller",
      "reason",
      "discrepancy",
      "timestamp",
    ]);
    expect(signed[0]!.method).toBe("sendSettlementRejected");
  });

  it("wraps every settlement exit under `action`, as the macro declares", async () => {
    // Every `settlement_action!` event is `{ action, signature }`. A
    // reservation's is `{ cancel, signature }` — the two envelopes are not
    // interchangeable, and a node handed the wrong one fails to deserialize
    // rather than failing a signature check, so the two spellings are worth
    // pinning apart.
    await cancelSettlement(who(), "s-1");
    await reversePayment(who(), "s-1");
    await rejectSettlement(who(), "s-1", "why", "Other");
    expect(signed.map(({ envelope }) => Object.keys(envelope).sort())).toEqual([
      ["action", "signature"],
      ["action", "signature"],
      ["action", "signature"],
    ]);
  });
});
