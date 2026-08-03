import { describe, expect, it, vi } from "vitest";

import {
  fetchNodeRate,
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

/**
 * `fetchNodeRate` asks `getExchangeRate`, which is the node making the same
 * three-way distinction this module used to re-derive from every record it
 * holds. The point of the test is that the distinction survives the trip:
 * `getMedianExchangeRate` flattens "the feed died" and "nobody prices this"
 * into one `null`, and a client that read that would treat a temporary
 * outage as an unsupported corridor and move on.
 */
describe("asking the node for one pair's rate", () => {
  function answering(result: unknown) {
    return vi.fn(async () =>
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
        headers: { "content-type": "application/json" },
      }),
    );
  }

  it("carries a current median with the expiry it is good until", async () => {
    vi.stubGlobal("fetch", answering({ status: "current", rate: 129.46, expiresAt: NOW + 1000 }));
    const rate = await fetchNodeRate("USDC", "KES", "http://node.invalid");
    expect(rate).toEqual({
      kind: "current",
      rate: 129.46,
      expiresAt: NOW + 1000,
      // Not sent by this method, so not guessed. A `1` here would make a
      // one-provider feed and a ten-provider one look identical, in the
      // direction that flatters a thin one.
      contributors: null,
    });
    vi.unstubAllGlobals();
  });

  it("keeps a lapsed feed distinct from an unpriced pair", async () => {
    vi.stubGlobal("fetch", answering({ status: "stale" }));
    expect(await fetchNodeRate("AED", "USDC", "http://node.invalid")).toEqual({
      kind: "stale",
      // No lapse instant on the wire, and this app does not invent one:
      // dating somebody else's feed from our own clock is a fabrication.
      lapsedAt: null,
    });

    vi.stubGlobal("fetch", answering({ status: "noData" }));
    expect(await fetchNodeRate("USD", "KES", "http://node.invalid")).toEqual({ kind: "no-data" });
    vi.unstubAllGlobals();
  });

  it("never produces a number on either failing branch", async () => {
    for (const status of ["stale", "noData"]) {
      vi.stubGlobal("fetch", answering({ status }));
      const rate = await fetchNodeRate("AED", "USDC", "http://node.invalid");
      // OFS-7000 §12: expired data is not current data, however recently it
      // lapsed. Neither branch may carry a figure a caller could render.
      expect(rate).not.toHaveProperty("rate");
    }
    vi.unstubAllGlobals();
  });
});
