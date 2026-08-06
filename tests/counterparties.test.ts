import { describe, expect, it } from "vitest";
import {
  classifyFailure,
  formatPeerId,
  peerIdForAddress,
  suggested,
  summaryFor,
  tradedCount,
  type CounterpartySummary,
} from "@/lib/counterparties";

function summary(partial: Partial<CounterpartySummary> = {}): CounterpartySummary {
  return {
    counterparty: "12D3KooWK9hQ7TwbfvFiaAxUbRFCkdhS7iEpAJDnewNL1anyREQ1",
    trades: 0,
    in_progress: 0,
    abandoned: 0,
    disputed: 0,
    last_traded_at: null,
    ...partial,
  };
}

describe("the badge count", () => {
  it("returns the completed-trade count for the component to phrase", () => {
    expect(tradedCount(summary({ trades: 6 }))).toBe(6);
    expect(tradedCount(summary({ trades: 1 }))).toBe(1);
  });

  /**
   * A rendered "0 trades" reads as a warning about the counterparty when it
   * only means the two have never met — and on a node that joined recently it
   * may not even be true. Null (nothing shown) is the honest output.
   */
  it("says nothing rather than zero", () => {
    expect(tradedCount(summary({ trades: 0, abandoned: 4 }))).toBeNull();
    expect(tradedCount(null)).toBeNull();
  });
});

describe("suggestions", () => {
  it("only suggests wallets an actual trade completed with", () => {
    const traded = summary({ counterparty: "peer-1", trades: 3 });
    const onlyCancelled = summary({ counterparty: "peer-2", abandoned: 9 });
    const onlyPending = summary({ counterparty: "peer-3", in_progress: 2 });

    expect(suggested([traded, onlyCancelled, onlyPending])).toEqual([traded]);
  });

  it("keeps the order the node ranked them in", () => {
    const first = summary({ counterparty: "peer-1", trades: 9 });
    const second = summary({ counterparty: "peer-2", trades: 2 });
    expect(suggested([first, second]).map((s) => s.trades)).toEqual([9, 2]);
  });
});

describe("finding one pair in the list", () => {
  it("matches on the full peer id, not a prefix", () => {
    // One peer id is a strict prefix of the other, so a match that compared
    // less than the whole string would return the wrong counterparty's history.
    const a = summary({ counterparty: "12D3KooWabc", trades: 4 });
    const b = summary({ counterparty: "12D3KooWabcd", trades: 7 });
    expect(summaryFor([a, b], "12D3KooWabcd")?.trades).toBe(7);
    expect(summaryFor([a, b], "12D3KooWab")).toBeNull();
  });

  it("reports no history as null rather than a fabricated zero row", () => {
    expect(summaryFor([summary({ counterparty: "peer-1" })], "peer-9")).toBeNull();
  });
});

describe("addresses that are not protocol identities", () => {
  /**
   * The simulated merchant dataset carries deterministic pseudo-addresses.
   * A badge that threw on one would break the page around it, so anything
   * that is not a real 32-byte key resolves to null and renders nothing.
   */
  it("returns null instead of throwing", () => {
    expect(peerIdForAddress("not-base58-!!!")).toBeNull();
    expect(peerIdForAddress("")).toBeNull();
    expect(peerIdForAddress("abc")).toBeNull();
  });

  it("derives a peer id from a real 32-byte key", () => {
    // 32 bytes of 0x01, base58-encoded — a well-formed Ed25519 public key
    // as far as the derivation is concerned.
    const address = formatFullBase58(new Uint8Array(32).fill(1));
    const peerId = peerIdForAddress(address);
    expect(peerId).not.toBeNull();
    expect(peerId!.length).toBeGreaterThan(32);
  });
});

describe("failure classification", () => {
  /**
   * The load-bearing one. A refusal to answer for someone else's wallet and
   * an empty history are opposite answers, and collapsing the first into the
   * second would quietly present "you may not ask" as "you have no trades".
   */
  it("keeps a refusal distinct from every other failure", () => {
    expect(classifyFailure("APPLICATION_ERROR: INVALID_IDENTITY_CLAIM")).toBe("not-your-wallet");
    expect(classifyFailure("INVALID_SIGNATURE")).toBe("wrong-key");
    expect(classifyFailure("INVALID_REQUEST")).toBe("challenge-expired");
    expect(classifyFailure("RESOURCE_NOT_FOUND")).toBe("challenge-spent");
    expect(classifyFailure("socket hang up")).toBe("unreachable");
  });
});

describe("peer id display", () => {
  it("abbreviates the middle and keeps both recognisable ends", () => {
    const shown = formatPeerId("12D3KooWK9hQ7TwbfvFiaAxUbRFCkdhS7iEpAJDnewNL1anyREQ1");
    expect(shown).toContain("…");
    expect(shown.length).toBeLessThan(20);
  });
});

/** Local base58 encode so the test does not depend on the module under test. */
function formatFullBase58(bytes: Uint8Array): string {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let value = 0n;
  for (const byte of bytes) value = value * 256n + BigInt(byte);
  let out = "";
  while (value > 0n) {
    out = ALPHABET[Number(value % 58n)] + out;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    out = "1" + out;
  }
  return out;
}
