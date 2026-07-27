/**
 * OPEN token sale. OPEN P2P trading and swapping unlock at mainnet — until
 * then OPEN is only available through the official sale.
 *
 * Figures come from OFS-4100 (OpenFiat Tokenomics Specification) §2–3, not
 * from this file's own invention. Two of them are settled and must not be
 * edited here:
 *
 *   - Price is 1 OPEN = 1 USDC, marked [CONFIRMED] in §3, and it is what the
 *     deployed presale program actually enforces: `open_entitlement_for` in
 *     openfiat-core scales the USDC amount by the two mints' decimal
 *     difference and applies no other rate. A different price shown here
 *     would be a figure the chain refuses.
 *   - Maximum contribution per wallet is 1,000,000 USDC, also [CONFIRMED].
 *
 * The rest is §3's proposal, still marked [PROPOSED — NEEDS SIGN-OFF]: the
 * 30,000,000 USDC hard cap (sized to the 30,000,000 OPEN Community Presale
 * bucket, since at 1:1 the bucket *is* the ceiling), the 5,000,000 soft cap
 * below which contributions are refundable, and the 50 USDC minimum.
 *
 * `raised` is the only simulated figure — the live number comes from the
 * program's own `total_raised` once this app is wired to a node.
 */

/** [CONFIRMED] OFS-4100 §3. Not a tunable. */
export const OPEN_PRICE_USDC = 1;

export const PRESALE = {
  phase: "Community Presale",
  status: "Live" as const,
  priceUsdc: OPEN_PRICE_USDC,
  /** Simulated. Real value is `SaleConfig.total_raised` on chain. */
  raised: 4_120_000,
  /** Equals the presale bucket in OPEN, because the price is 1:1. */
  cap: 30_000_000,
  softCap: 5_000_000,
  minContribution: 50,
  maxContribution: 1_000_000,
};

/**
 * A single presale at a single price, per OFS-4100 §3 — there is no seed or
 * public tier at a different rate. Vesting is none: presale OPEN unlocks at
 * claim (§2), which is why nothing here carries a schedule.
 */
export const SALE_PHASES = [
  {
    name: "Community Presale",
    priceUsdc: OPEN_PRICE_USDC,
    allocation: "30,000,000 OPEN",
    status: "Live",
  },
  {
    name: "Mainnet — P2P & swaps",
    priceUsdc: null,
    allocation: "Market priced",
    status: "Upcoming",
  },
] as const;
