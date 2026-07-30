import { describe, expect, it } from "vitest";

import type { LiveAd } from "@/lib/live-advertisements";
import { countsAsMerchantAd, merchantsFrom } from "@/lib/live-merchants";

/**
 * The definition of "merchant" is the load-bearing decision behind
 * `/merchants`, and it is the kind of thing a later refactor can change by
 * accident — a filter moved into the fetch, a status added to the enum — and
 * silently start describing a different set of people. These pin it.
 */

let nextId = 0;

function ad(overrides: Partial<LiveAd> = {}): LiveAd {
  nextId += 1;
  return {
    id: `ad-${nextId}`,
    merchantPeerId: "aa".repeat(16),
    merchantShort: "aaaaaa",
    asset: "USDT",
    fiatCurrency: "KES",
    direction: "Sell",
    price: 129.5,
    pricingKind: "Fixed",
    premiumBps: null,
    minTrade: 10,
    maxTrade: 1000,
    availableLiquidity: 5000,
    paymentMethods: ["M-Pesa"],
    status: "Active",
    createdAt: 1_000,
    updatedAt: 2_000,
    ...overrides,
  };
}

describe("countsAsMerchantAd", () => {
  it("counts an active advertisement", () => {
    expect(countsAsMerchantAd(ad({ status: "Active" }))).toBe(true);
  });

  it("counts a paused merchant — vacation is a merchant on holiday, not a former merchant", () => {
    expect(countsAsMerchantAd(ad({ status: "Vacation" }))).toBe(true);
  });

  it("counts a disabled advertisement — liquidity at zero is not withdrawal", () => {
    expect(countsAsMerchantAd(ad({ status: "Disabled" }))).toBe(true);
  });

  it("does not count a deleted advertisement", () => {
    // OFS-2100 §21's permanent removal is the one status that means the
    // merchant took themselves off the network. `getAdvertisements` still
    // returns the record, so nothing but this predicate excludes it.
    expect(countsAsMerchantAd(ad({ status: "Deleted" }))).toBe(false);
  });
});

describe("merchantsFrom", () => {
  it("makes one row per wallet, not per advertisement", () => {
    const rows = merchantsFrom([
      ad({ merchantPeerId: "aa", fiatCurrency: "KES" }),
      ad({ merchantPeerId: "aa", fiatCurrency: "NGN" }),
      ad({ merchantPeerId: "bb" }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.peerId === "aa")?.ads).toHaveLength(2);
  });

  it("drops a wallet whose only advertisement was deleted", () => {
    const rows = merchantsFrom([
      ad({ merchantPeerId: "aa", status: "Deleted" }),
      ad({ merchantPeerId: "bb", status: "Active" }),
    ]);
    expect(rows.map((row) => row.peerId)).toEqual(["bb"]);
  });

  it("keeps a wallet with one live advertisement and one deleted, counting only the live one", () => {
    const [row] = merchantsFrom([
      ad({ merchantPeerId: "aa", status: "Deleted" }),
      ad({ merchantPeerId: "aa", status: "Active" }),
    ]);
    expect(row.ads).toHaveLength(1);
    expect(row.offering).toBe("Advertising");
  });

  it("reports Advertising when any advertisement is active", () => {
    const [row] = merchantsFrom([ad({ status: "Vacation" }), ad({ status: "Active" })]);
    expect(row.offering).toBe("Advertising");
    expect(row.activeAds).toBe(1);
    expect(row.vacationAds).toBe(1);
  });

  it("prefers a deliberate pause over a fault when nothing is active", () => {
    const [row] = merchantsFrom([ad({ status: "Disabled" }), ad({ status: "Vacation" })]);
    expect(row.offering).toBe("On vacation");
  });

  it("reports Disabled only when every advertisement is disabled", () => {
    const [row] = merchantsFrom([ad({ status: "Disabled" }), ad({ status: "Disabled" })]);
    expect(row.offering).toBe("Disabled");
    expect(row.disabledAds).toBe(2);
  });

  it("collects pairs and payment methods across advertisements without duplicates", () => {
    const [row] = merchantsFrom([
      ad({ fiatCurrency: "KES", paymentMethods: ["M-Pesa", "Bank transfer"] }),
      ad({ fiatCurrency: "KES", paymentMethods: ["M-Pesa"] }),
      ad({ asset: "USDC", fiatCurrency: "NGN", paymentMethods: ["Bank transfer"] }),
    ]);
    expect(row.pairs).toEqual(["USDC/NGN", "USDT/KES"]);
    expect(row.paymentMethods).toEqual(["Bank transfer", "M-Pesa"]);
  });

  it("spans the wallet's whole advertising history, earliest created to latest changed", () => {
    const [row] = merchantsFrom([
      ad({ createdAt: 500, updatedAt: 900 }),
      ad({ createdAt: 3_000, updatedAt: 7_000 }),
    ]);
    expect(row.firstAdvertisedAt).toBe(500);
    expect(row.lastUpdatedAt).toBe(7_000);
  });

  it("orders live merchants first, then most recently changed", () => {
    const rows = merchantsFrom([
      ad({ merchantPeerId: "paused", status: "Vacation", updatedAt: 9_000 }),
      ad({ merchantPeerId: "stale", status: "Active", updatedAt: 1_000 }),
      ad({ merchantPeerId: "fresh", status: "Active", updatedAt: 5_000 }),
    ]);
    expect(rows.map((row) => row.peerId)).toEqual(["fresh", "stale", "paused"]);
  });

  it("breaks ties by peer id so the order does not wobble between renders", () => {
    const rows = merchantsFrom([
      ad({ merchantPeerId: "bb", updatedAt: 4_000 }),
      ad({ merchantPeerId: "aa", updatedAt: 4_000 }),
    ]);
    expect(rows.map((row) => row.peerId)).toEqual(["aa", "bb"]);
  });

  it("returns nothing for an empty book rather than inventing a merchant", () => {
    expect(merchantsFrom([])).toEqual([]);
  });
});
