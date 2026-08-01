import { beforeEach, describe, expect, it, vi } from "vitest";

const call = vi.fn();

vi.mock("@openfiat/sdk", () => ({
  Client: class {
    constructor(public options: unknown) {}
    call(...args: unknown[]) {
      return call(...args);
    }
  },
  peerIdFromPublicKey: (bytes: Uint8Array) => bytes,
}));

vi.mock("@/lib/node-endpoint", () => ({ nodeUrl: () => "https://node.example" }));

const { fetchReputationForPeerId, toLiveReputation } = await import("@/lib/live-reputation");

const EMPTY = {
  trades_started: 0,
  trades_completed: 0,
  trades_cancelled: 0,
  disputes_involved: 0,
  disputes_lost: 0,
  payments_submitted: 0,
  payment_discrepancies: 0,
  payment_responses_due: 0,
  payment_responses_made: 0,
  reservations_missed: 0,
  completed_duration_sum_ms: 0,
  response_latency_sum_ms: 0,
  first_active_at: null,
};

beforeEach(() => {
  call.mockReset();
  call.mockResolvedValue(EMPTY);
});

/** A real PeerId off the live book, and its base64 encoding. */
const PEER_ID = "12D3KooWHSjonqZMAHmZKzSYgTsPdJ1UrxCYcKTBy4BfbUhU3Qmj";
const PEER_ID_BASE64 = "ACQIARIgcVMvQm++vzAWtHfpDtHOwDOrLa2mQh/Z/fzcPpzcsh4=";

describe("fetchReputationForPeerId", () => {
  /*
   * The node decodes `wallet` as base64 into `PeerId::from_bytes` and answers
   * an unrecognised id with an all-zero profile rather than an error — see
   * `lib/wallet-param.ts`. A wrong encoding here would therefore look exactly
   * like a merchant who has never traded, on every row of the directory, and
   * nobody would notice. So the encoding is pinned rather than trusted.
   *
   * This pinned the *hex* spelling until now, and that is exactly how the
   * defect it was written to prevent got in anyway. The node moved to base58
   * — `12D3Koo…`, the spelling on every row of the order book and the one
   * `lib/peer-id.ts` fixed as canonical — and this function's
   * `/^[0-9a-f]+$/` rejected it outright. Every merchant's trading record in
   * the directory reported "your access node did not answer", which is
   * indistinguishable from an unreachable node, so nothing surfaced it. The
   * test kept passing because it fed the function the encoding the function
   * still wanted.
   */
  it("sends base64 of the PeerId bytes, not the base58 string", async () => {
    await fetchReputationForPeerId(PEER_ID);
    expect(call).toHaveBeenCalledWith("getReputation", { wallet: PEER_ID_BASE64 });
  });

  it("accepts the spelling the order book displays", async () => {
    // The directory passes `LiveAd.merchantPeerId` straight through, so what
    // the book renders and what this sends must be the same string.
    await fetchReputationForPeerId(` ${PEER_ID} `);
    expect(call).toHaveBeenCalledWith("getReputation", { wallet: PEER_ID_BASE64 });
  });

  it("refuses a malformed id instead of asking about somebody else", async () => {
    // Base58 omits 0, O, I and l precisely so these cannot be confused, and
    // an id that is not base58 must not become a PeerId belonging to nobody.
    await expect(fetchReputationForPeerId("0OIl")).rejects.toThrow(/base58 PeerId/);
    await expect(fetchReputationForPeerId("")).rejects.toThrow(/base58 PeerId/);
    await expect(fetchReputationForPeerId("   ")).rejects.toThrow(/base58 PeerId/);
    expect(call).not.toHaveBeenCalled();
  });

  it("reports a wallet with no history as empty rather than as all zeroes", async () => {
    const reputation = await fetchReputationForPeerId(PEER_ID);
    expect(reputation.empty).toBe(true);
    expect(reputation.completionRate).toBeNull();
    expect(reputation.meanResponseMs).toBeNull();
  });
});

describe("toLiveReputation", () => {
  it("averages response latency over responses made, not over responses due", () => {
    // An unanswered declaration has no latency to average and is already
    // counted against the response rate; dividing by `due` would quietly
    // reward a merchant for ignoring buyers.
    const reputation = toLiveReputation({
      ...EMPTY,
      payment_responses_due: 4,
      payment_responses_made: 2,
      response_latency_sum_ms: 60_000,
    });
    expect(reputation.meanResponseMs).toBe(30_000);
    expect(reputation.responseRate).toBe(0.5);
  });
});
