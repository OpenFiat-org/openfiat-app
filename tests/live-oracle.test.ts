import { describe, expect, it } from "vitest";

import {
  lookupRate,
  pricedPairs,
  type ExchangeRateRecord,
} from "@/lib/live-oracle";

const NOW = 1_785_450_000_000;

function record(partial: Partial<ExchangeRateRecord> = {}): ExchangeRateRecord {
  return {
    id: "devnet-usdc-kes",
    base: "USDC",
    quote: "KES",
    rate: 129.4649,
    publishedAt: NOW - 3_600_000,
    expiresAt: NOW + 3_600_000,
    ...partial,
  };
}

describe("reading a pair's rate", () => {
  it("returns the median of the unexpired records", () => {
    const rate = lookupRate(
      [
        record({ id: "a", rate: 128 }),
        record({ id: "b", rate: 130 }),
        record({ id: "c", rate: 129 }),
      ],
      "USDC",
      "KES",
      NOW,
    );
    expect(rate).toMatchObject({ kind: "current", rate: 129, contributors: 3 });
  });

  /*
   * The distinction this module exists for. `getMedianExchangeRate` returns
   * `Option<f64>`, so a lapsed feed and an unpriced corridor arrive as the
   * same `null` — and `openfiat_oracles`' own doc says collapsing them "is how
   * a caller ends up treating 'the feed died' as 'this pair isn't supported'
   * and quietly moving on". Deriving from the raw records keeps them apart.
   */
  it("tells a lapsed feed apart from a pair nobody prices", () => {
    const expired = [record({ expiresAt: NOW - 1 })];
    expect(lookupRate(expired, "USDC", "KES", NOW)).toMatchObject({ kind: "stale" });
    expect(lookupRate(expired, "USDT", "NGN", NOW)).toEqual({ kind: "no-data" });
    expect(lookupRate([], "USDC", "KES", NOW)).toEqual({ kind: "no-data" });
  });

  /*
   * OFS-7000 §12: expired data should not be treated as current. A stale
   * result must therefore carry no rate at all — a last-known figure under a
   * caption is read as the rate whatever the caption says.
   */
  it("never carries a number on a stale result", () => {
    const stale = lookupRate([record({ expiresAt: NOW - 1 })], "USDC", "KES", NOW);
    expect(stale).not.toHaveProperty("rate");
    expect(stale.kind).toBe("stale");
  });

  it("goes stale only when every contributor has lapsed", () => {
    const mixed = [record({ id: "a", expiresAt: NOW - 1 }), record({ id: "b", expiresAt: NOW + 1 })];
    expect(lookupRate(mixed, "USDC", "KES", NOW)).toMatchObject({
      kind: "current",
      contributors: 1,
    });
  });

  /*
   * The median stops being the median the moment its first contributor
   * lapses, so the answer is good until the earliest expiry — not the latest,
   * which would keep quoting a figure assembled partly from stale records.
   */
  it("is valid only until its earliest contributor expires", () => {
    const rate = lookupRate(
      [
        record({ id: "a", rate: 128, expiresAt: NOW + 1_000 }),
        record({ id: "b", rate: 130, expiresAt: NOW + 9_000_000 }),
      ],
      "USDC",
      "KES",
      NOW,
    );
    expect(rate).toMatchObject({ kind: "current", expiresAt: NOW + 1_000 });
  });

  it("matches a pair however the URL was cased", () => {
    expect(lookupRate([record()], "usdc", "kes", NOW).kind).toBe("current");
  });

  it("does not confuse a pair with its inverse", () => {
    expect(lookupRate([record()], "KES", "USDC", NOW)).toEqual({ kind: "no-data" });
  });
});

describe("which pairs are priced", () => {
  /*
   * This drives the sitemap and the sideways links between pair pages. A
   * lapsed pair keeps its own page — the page can say the feed has lapsed —
   * but listing it would advertise a market that cannot currently be quoted.
   */
  it("lists only pairs with a current median", () => {
    const pairs = pricedPairs(
      [
        record({ id: "a", base: "USDC", quote: "KES" }),
        record({ id: "b", base: "USDT", quote: "NGN" }),
        record({ id: "c", base: "USDT", quote: "EUR", expiresAt: NOW - 1 }),
      ],
      NOW,
    );
    expect(pairs.map((p) => p.slug)).toEqual(["usdc/kes", "usdt/ngn"]);
  });

  it("collapses several providers on one pair into one entry", () => {
    const pairs = pricedPairs(
      [record({ id: "a", rate: 129 }), record({ id: "b", rate: 130 })],
      NOW,
    );
    expect(pairs).toHaveLength(1);
  });
});
