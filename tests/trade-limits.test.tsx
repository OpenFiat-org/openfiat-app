import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TradeLimits } from "@/components/asset-label";
import type { LiveAd } from "@/lib/live-advertisements";

/**
 * `min_trade`, `max_trade` and `available_liquidity` are denominated in the
 * ASSET (openfiat-core's `Advertisement`, 21986fe). This app rendered them
 * both ways at once — the exchange in the fiat currency, the merchants
 * directory in the asset — so one of the two screens was showing every
 * merchant's limits off by the exchange rate.
 *
 * Nothing on screen catches that. At a KES/USDC rate near 129, a limit of
 * "50" is a plausible number in either unit; only the record's contract says
 * which one is a lie, and a reader who does not know the contract cannot
 * tell. So the denomination is pinned here rather than left to whichever
 * reading the next author arrives at.
 */
const USDC_MINT = "2bHPi5hA4zrmPAfrvLmEexg3KJjpTjNkUcxWnzUPeRRU";
const UNNAMED_MINT = "J2DNkV3tjn96SpYNnJTAzVi9JUhgLFHfYHMWSFDfkdKs";

function ad(overrides: Partial<LiveAd> = {}): LiveAd {
  return {
    id: "ad-1",
    merchantPeerId: "aa".repeat(16),
    merchantShort: "aaaaaa",
    assetMint: USDC_MINT,
    assetSymbol: "USDC",
    fiatCurrency: "KES",
    direction: "Sell",
    price: 129.5,
    pricingKind: "Fixed",
    premiumBps: null,
    minTrade: 50,
    maxTrade: 2_000,
    availableLiquidity: 4_000,
    paymentMethods: ["M-Pesa Kenya (Safaricom)"],
    status: "Active",
    createdAt: 1_000,
    updatedAt: 2_000,
    ...overrides,
  };
}

describe("TradeLimits", () => {
  it("labels the band with the asset, never with the fiat currency", () => {
    const html = renderToStaticMarkup(<TradeLimits ad={ad()} />);
    expect(html).toContain("USDC");
    // The exact failure this exists for: "50.00 – 2,000.00 KES" is what the
    // exchange used to print for this advertisement, and it is a merchant's
    // limits misstated by a factor of 129.
    expect(html).not.toContain("KES");
  });

  it("falls back to the mint, not to the fiat code, for a token the node cannot name", () => {
    const html = renderToStaticMarkup(
      <TradeLimits ad={ad({ assetMint: UNNAMED_MINT, assetSymbol: null })} />,
    );
    expect(html).toContain(UNNAMED_MINT);
    expect(html).not.toContain("KES");
  });

  /*
   * A whole-unit format is fine for a KES band and wrong for an asset one:
   * SOL trades in fractions, and 0.5 rounded to "1" is a minimum the
   * merchant never advertised.
   */
  it("keeps fractional bounds a token can actually have", () => {
    const html = renderToStaticMarkup(
      <TradeLimits ad={ad({ assetSymbol: "SOL", minTrade: 0.5, maxTrade: 12.25 })} />,
    );
    expect(html).toContain("0.50");
    expect(html).toContain("12.25");
  });
});

/*
 * The rendering above can be correct while a new screen reintroduces the
 * mistake somewhere else — which is exactly what happened: two components
 * read one record and disagreed. This catches the disagreement in the source
 * rather than waiting for someone to notice on screen.
 */
const ROOTS = ["app", "components", "lib", "scripts"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

/** `formatFiat(ad.minTrade, …)` and friends, however the ad is named. */
const FIAT_FORMATTED_LIMIT =
  /formatFiat\(\s*[A-Za-z_$][\w$]*\.(minTrade|maxTrade|availableLiquidity)\b/;

describe("advertisement trade limits", () => {
  it("are never handed to the fiat formatter", () => {
    const offenders = ROOTS.flatMap(sourceFiles).filter((path) =>
      FIAT_FORMATTED_LIMIT.test(readFileSync(path, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
