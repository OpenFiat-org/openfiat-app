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

describe("fetchReputationForPeerId", () => {
  /*
   * The node decodes `wallet` as base64 into `PeerId::from_bytes` and answers
   * an unrecognised id with an all-zero profile rather than an error — see
   * `lib/wallet-param.ts`. A wrong encoding here would therefore look exactly
   * like a merchant who has never traded, on every row of the directory, and
   * nobody would notice. So the encoding is pinned rather than trusted.
   */
  it("sends base64 of the PeerId bytes, not the hex string", async () => {
    await fetchReputationForPeerId("0102ff");
    expect(call).toHaveBeenCalledWith("getReputation", { wallet: "AQL/" });
  });

  it("accepts uppercase hex", async () => {
    await fetchReputationForPeerId("0102FF");
    expect(call).toHaveBeenCalledWith("getReputation", { wallet: "AQL/" });
  });

  it("refuses a malformed id instead of asking about somebody else", async () => {
    await expect(fetchReputationForPeerId("abc")).rejects.toThrow(/hex-encoded PeerId/);
    await expect(fetchReputationForPeerId("zz")).rejects.toThrow(/hex-encoded PeerId/);
    await expect(fetchReputationForPeerId("")).rejects.toThrow(/hex-encoded PeerId/);
    expect(call).not.toHaveBeenCalled();
  });

  it("reports a wallet with no history as empty rather than as all zeroes", async () => {
    const reputation = await fetchReputationForPeerId("aabb");
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
