/**
 * OPEN token sale. OPEN P2P trading and swapping unlock at mainnet — until
 * then OPEN is only available through the official sale.
 *
 * Figures come from OFS-4100 (OpenFiat Tokenomics Specification) §2–3, not
 * from this file's own invention. Settled figures, marked [CONFIRMED]:
 *
 *   - Presale price is 1 OPEN = 1 USDC, and it is what the deployed presale
 *     program actually enforces: `open_entitlement_for` in openfiat-core
 *     scales the USDC amount by the two mints' decimal difference and
 *     applies no other rate. A different price shown here would be a figure
 *     the chain refuses.
 *   - Maximum contribution per wallet is 1,000,000 USDC.
 *   - The Community Presale bucket is the entire 20% of supply
 *     (200,000,000 OPEN, §2) — not sized to cap the raise. The presale has
 *     no hard cap distinct from that bucket: it sells at 1:1 toward a
 *     $2,000,000 *target* (a goal, not a ceiling) and keeps selling out of
 *     the same bucket for as long as demand continues past that target.
 *   - Whatever remains unsold when the presale closes moves to a Public
 *     Sale phase at 1 OPEN = 1.25 USDC — a second, higher-priced phase for
 *     the bucket's remainder, not a separate allocation.
 *
 * Still §3's proposal, marked [PROPOSED — NEEDS SIGN-OFF]: the 5,000,000
 * USDC soft cap below which contributions are refundable, and the 50 USDC
 * minimum.
 *
 * `raised` is the only simulated figure — the live number comes from the
 * program's own `total_raised` once this app is wired to a node. It is
 * deliberately simulated *above* the target, to illustrate that the target
 * is a goal the presale keeps selling past, not a cap that stops it.
 */

/** [CONFIRMED] OFS-4100 §3. Not a tunable. */
export const OPEN_PRICE_USDC = 1;

/** [CONFIRMED] OFS-4100 §3. Public Sale phase, after the presale closes. */
export const PUBLIC_SALE_PRICE_USDC = 1.25;

/** [CONFIRMED] OFS-4100 §2. The entire Community Presale bucket, in OPEN. */
export const PRESALE_BUCKET_OPEN = 200_000_000;

export const PRESALE = {
  phase: "Community Presale",
  status: "Live" as const,
  priceUsdc: OPEN_PRICE_USDC,
  /** Simulated. Real value is `SaleConfig.total_raised` on chain. */
  raised: 4_120_000,
  /** [CONFIRMED] A goal, not a cap — see the file-level comment. */
  target: 2_000_000,
  softCap: 5_000_000,
  minContribution: 50,
  maxContribution: 1_000_000,
  bucketOpen: PRESALE_BUCKET_OPEN,
};

/**
 * Two priced phases against the one Community Presale bucket, per OFS-4100
 * §2–3: the presale sells at 1:1 toward the target above, then whatever's
 * left of the bucket sells in the Public Sale at 1.25. Vesting is none —
 * presale OPEN unlocks at claim (§2), which is why nothing here carries a
 * schedule.
 */
export const SALE_PHASES = [
  {
    name: "Community Presale",
    priceUsdc: OPEN_PRICE_USDC,
    allocation: "200,000,000 OPEN",
    status: "Live",
  },
  {
    name: "Public Sale",
    priceUsdc: PUBLIC_SALE_PRICE_USDC,
    allocation: "Unsold presale remainder",
    status: "Upcoming",
  },
  {
    name: "Mainnet — P2P & swaps",
    priceUsdc: null,
    allocation: "Market priced",
    status: "Upcoming",
  },
] as const;
