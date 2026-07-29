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
 *     $20,000,000 *target* (a goal, not a ceiling) and keeps selling out of
 *     the same bucket for as long as demand continues past that target.
 *   - Whatever remains unsold when the presale closes moves to a Public
 *     Sale phase at 1 OPEN = 1.25 USDC — a second, higher-priced phase for
 *     the bucket's remainder, not a separate allocation.
 *
 * There is no soft cap and no refund condition derived from one — §3 records
 * this as [CONFIRMED]. An earlier draft proposed a 5,000,000 USDC soft cap
 * below which contributions were refundable; with no minimum to raise there
 * is no threshold to fall short of, so the term was withdrawn rather than
 * reworded. Nothing in this file should imply a refundable presale.
 *
 * Note the deployed program still *has* a `soft_cap` field and a `refund`
 * instruction — that is how "no minimum" is expressed on chain, by setting
 * `soft_cap = 0` so the `SoftCapMissed` state refunds are gated on can never
 * be reached. Code reading those from the chain is correct; only the stated
 * terms changed.
 *
 * Still §3's proposal, marked [PROPOSED — NEEDS SIGN-OFF]: the 50 USDC
 * minimum contribution.
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
  /** Simulated. Real value is `SaleConfig.total_raised` on chain. Kept
   *  deliberately above `target` — the whole point of the figure is to show
   *  the presale selling past its goal rather than stopping at it, so it has
   *  to move whenever the target does. */
  raised: 24_500_000,
  /** [CONFIRMED] A goal, not a cap — see the file-level comment. */
  target: 20_000_000,
  /** [CONFIRMED] None. There is no minimum to raise, so no shortfall
   *  condition exists and contributions are not refundable on that ground. */
  softCap: null,
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
