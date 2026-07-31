import { describe, expect, it } from "vitest";

import { toLiveAd } from "@/lib/live-advertisements";
import type { AdvertisementView, PriceQuote } from "@openfiat/sdk";

/**
 * The price a row shows comes from the node's `quote`, not from the
 * merchant's `pricing`.
 *
 * The two are easy to conflate and the consequence is not symmetric.
 * `pricing` is the merchant's standing instruction ("oracle mid plus 150
 * bps"); `quote` is what that instruction produced against the oracle
 * reading the node held when it answered. Deriving the price from `pricing`
 * alone means a floating advertisement can only ever be reported as
 * unpriced — which is what this app did until the SDK typed `quote`, so
 * every floating ad on the busiest screen said "no oracle price" while the
 * node had resolved one.
 *
 * A fixed advertisement is the case that hides this: it reads correctly
 * under both the right and the wrong implementation, because for a fixed ad
 * `pricing.Fixed.price` and `quote.price` are the same number. So the
 * floating case is the one that has to be asserted, and asserting only the
 * fixed one would have passed throughout the bug.
 */

function ad(
  quote: PriceQuote,
  pricing: AdvertisementView["pricing"],
): AdvertisementView {
  return {
    id: "ad-1",
    merchant: [1, 2, 3],
    merchant_public_key: [4, 5, 6],
    asset_mint: "2bHPi5hA4zrmPAfrvLmEexg3KJjpTjNkUcxWnzUPeRRU",
    asset_symbol: "USDC",
    fiat_currency: "KES",
    direction: "Sell",
    min_trade: { base_units: 1_000, decimals: 2 },
    max_trade: { base_units: 50_000, decimals: 2 },
    available_liquidity: { base_units: 200_000, decimals: 2 },
    pricing,
    payment_methods: ["M-Pesa"],
    status: "Active",
    created_at: 1,
    updated_at: 1,
    quote,
  };
}

const FLOATING_TERMS = {
  Floating: { oracle_provider: "any", premium_bps: 150, price_decimals: 2 },
} as const;
const FIXED_TERMS = {
  Fixed: { price: { base_units: 12_950, decimals: 2 } },
} as const;

describe("an advertisement's price comes from the node's quote", () => {
  it("shows a floating advertisement's resolved price rather than reporting it unpriced", () => {
    const row = toLiveAd(
      ad(
        {
          kind: "Floating",
          price: { base_units: 13_100, decimals: 2 },
          mid_rate: 129.5,
          premium_bps: 150,
          mid_expires_at: 1_785_326_099_513,
        },
        FLOATING_TERMS,
      ),
    );

    expect(row.price).toBe(131);
    expect(row.pricingKind).toBe("Floating");
    expect(row.premiumBps).toBe(150);
    expect(row.unpriceableReason).toBeNull();
    // What makes a floating price safe to display and unsafe to hold.
    expect(row.quoteExpiresAt).toBe(1_785_326_099_513);
  });

  it("keeps the three unpriceable reasons apart instead of collapsing them", () => {
    // Each says something different about whether waiting helps: nobody
    // prices this pair, the feed lapsed, or the merchant's own premium puts
    // the result out of range. One message for all three tells two thirds
    // of readers the wrong thing.
    for (const reason of [
      "NoOracleData",
      "StaleOracleData",
      "PriceOutOfRange",
    ] as const) {
      const row = toLiveAd(
        ad({ kind: "Unpriceable", reason, premium_bps: 150 }, FLOATING_TERMS),
      );
      expect(row.price).toBeNull();
      expect(row.unpriceableReason).toBe(reason);
      // The terms survive even with no number, so the ad stays displayable.
      expect(row.premiumBps).toBe(150);
      expect(row.quoteExpiresAt).toBeNull();
    }
  });

  it("gives a fixed advertisement no expiry, because it does not expire", () => {
    const row = toLiveAd(
      ad(
        { kind: "Fixed", price: { base_units: 12_950, decimals: 2 } },
        FIXED_TERMS,
      ),
    );
    expect(row.price).toBe(129.5);
    expect(row.pricingKind).toBe("Fixed");
    expect(row.premiumBps).toBeNull();
    // An expiry here would invite a caller to re-read something that cannot
    // have changed: a fixed price moves when the merchant signs a new one.
    expect(row.quoteExpiresAt).toBeNull();
  });
});
