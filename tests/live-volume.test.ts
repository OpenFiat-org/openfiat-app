import { describe, expect, it } from "vitest";

import {
  countedSettlements,
  formatAssetVolume,
  type AssetVolume,
  type SettledVolume,
} from "@/lib/live-volume";

/**
 * `getSettledVolume` is the first figure on this app that reads as money
 * moved, and every one of its failure modes is silent: a wrong decimal
 * placement produces a plausible number, a summed total produces a
 * plausible number, and settlements the node could not attribute produce
 * no number at all. None of them look wrong on screen.
 *
 * A devnet with no confirmed settlements cannot exercise any of that, so
 * the arithmetic is pinned here rather than left to a cluster that happens
 * to be quiet.
 */
function asset(overrides: Partial<AssetVolume> = {}): AssetVolume {
  return {
    assetMint: "2bHPi5hA4zrmPAfrvLmEexg3KJjpTjNkUcxWnzUPeRRU",
    assetSymbol: "USDC",
    decimals: 6,
    baseUnits: 12_500_000,
    settlements: 3,
    ...overrides,
  };
}

describe("formatAssetVolume", () => {
  it("places the point using the decimals the node reported", () => {
    const figure = formatAssetVolume(asset());
    expect(figure.value).toBe("12.50");
    expect(figure.unit).toBe("USDC");
    expect(figure.rawBaseUnits).toBe(false);
  });

  /*
   * The exact error the node's own doc calls out: USDC and USDT are 6 and
   * wSOL is 9, so a hardcoded 6 reports SOL volume a thousand times too
   * large. Nine decimals must be read as nine.
   */
  it("reads nine decimals as nine, not as six", () => {
    const figure = formatAssetVolume(
      asset({ assetSymbol: "wSOL", decimals: 9, baseUnits: 2_500_000_000 }),
    );
    expect(figure.value).toBe("2.50");
  });

  /*
   * A mint this build of the node cannot name comes back with a null
   * symbol AND null decimals. The node can total base units without
   * knowing the mint; it cannot say where the point goes, and neither may
   * this app. So: the count of base units, labelled as base units, and the
   * address as its name.
   */
  it("never guesses a decimal placement for a mint the node cannot name", () => {
    const mint = "J2DNkV3tjn96SpYNnJTAzVi9JUhgLFHfYHMWSFDfkdKs";
    const figure = formatAssetVolume(
      asset({ assetMint: mint, assetSymbol: null, decimals: null, baseUnits: 12_500_000 }),
    );
    expect(figure.rawBaseUnits).toBe(true);
    expect(figure.value).toBe("12,500,000");
    // Labelled as what it is. The mint is the row's name, in the column
    // beside it; the figure's unit is the indivisible unit it counts.
    expect(figure.unit).toBe("base units");
    // Every placement a guess could have produced.
    for (const guessed of ["12.50", "12.5", "0.0125", "12,500.00"]) {
      expect(figure.value).not.toBe(guessed);
    }
  });

  /*
   * The node totals in `u128`. JSON has one number type and stops being
   * exact above 2^53, so by the time a value that large reaches this app
   * the precision is already gone — the only honest move left is to say
   * the digits are approximate rather than print them as if they were not.
   */
  it("flags a total too large for a JSON number to hold exactly", () => {
    expect(formatAssetVolume(asset({ baseUnits: 2 ** 53 + 2 })).approximate).toBe(true);
    expect(formatAssetVolume(asset({ baseUnits: 12_500_000 })).approximate).toBe(false);
  });
});

describe("countedSettlements", () => {
  const volume: SettledVolume = {
    assets: [
      asset({ assetSymbol: "USDC", settlements: 3 }),
      asset({ assetMint: "So11111111111111111111111111111111111111112", assetSymbol: "wSOL", decimals: 9, baseUnits: 4_000_000_000, settlements: 2 }),
    ],
    unattributedSettlements: 1,
    settlementsKnown: 9,
    scope: "settlements this node has replicated and independently observed confirmed on chain",
  };

  /*
   * A count of trades, not a sum of money. Adding SOL to USDC is the one
   * thing this response is shaped to prevent, and this helper exists so
   * nobody reaches for `.reduce` over `baseUnits` to get "total volume".
   */
  it("adds settlement counts, which is a count of trades", () => {
    expect(countedSettlements(volume)).toBe(5);
  });

  it("leaves the gap to `settlementsKnown` visible rather than closing it", () => {
    // 5 counted, 1 unattributed, 9 known: three are in flight. The panel
    // shows counted-of-known so that gap reads as trades in progress, and
    // shows the unattributed count separately so it is not mistaken for
    // part of it.
    expect(volume.settlementsKnown - countedSettlements(volume)).toBe(4);
    expect(volume.unattributedSettlements).toBe(1);
  });
});
