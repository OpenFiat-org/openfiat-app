/**
 * The OPEN sale's *stated terms*, as OFS-4100 §2–3 records them.
 *
 * # What this is, and what it is not
 *
 * Terms, not state. Nothing here says whether a sale is running, how much
 * has been raised, or what a wallet may contribute — those are fields on the
 * on-chain `SaleConfig`, and `lib/live-presale.ts` reads them or reports
 * that there is no sale to read. This file exists only for what a
 * specification fixes and a chain does not answer.
 *
 * The distinction is the whole point of the split. Its predecessor,
 * `lib/data/sale.ts`, mixed the two in one object: alongside the confirmed
 * price it carried `raised: 24_500_000`, a number its own comment admitted
 * was invented and had been positioned above the target so the page could
 * illustrate a sale overshooting its goal. `/open` rendered it as the
 * headline of a page with a Buy button on it.
 *
 * # The figures, and their standing
 *
 * `OPEN_PRICE_USDC` is [CONFIRMED] and is also what the deployed program
 * enforces: `SaleConfig::open_entitlement_for` scales a USDC amount by the
 * two mints' decimal difference and applies no other rate, so a different
 * price shown anywhere would be a figure the chain refuses.
 *
 * `PUBLIC_SALE_PRICE_USDC` is [CONFIRMED] in the specification but has no
 * deployed program behind it yet — it prices a later phase against the
 * remainder of the same bucket. It is a stated future term, and a UI must
 * present it as one.
 *
 * `PRESALE_BUCKET_OPEN` is the entire Community Presale allocation (§2), and
 * it is the presale's own ceiling: §3 gives the sale no hard cap distinct
 * from the bucket, and `claim` pays out of a vault holding exactly that much
 * OPEN.
 *
 * There is no soft cap and no refund condition derived from one — §3 records
 * that as [CONFIRMED]. The deployed program still carries a `soft_cap` field
 * and a `refund` instruction because setting `soft_cap = 0` is how "no
 * minimum to raise" is expressed on chain: the `SoftCapMissed` state refunds
 * are gated on then becomes unreachable. Nothing here or on screen should
 * imply a refundable presale.
 */

/** [CONFIRMED] OFS-4100 §3, and enforced by the deployed program. */
export const OPEN_PRICE_USDC = 1;

/** [CONFIRMED] OFS-4100 §3. A later phase, not yet deployed anywhere. */
export const PUBLIC_SALE_PRICE_USDC = 1.25;

/** [CONFIRMED] OFS-4100 §2. The entire Community Presale bucket, in OPEN. */
export const PRESALE_BUCKET_OPEN = 200_000_000;

/**
 * The three phases OPEN passes through, and what each is priced at.
 *
 * No `status` field. The previous version of this list marked the presale
 * "Live" as a constant, which meant the page said so whether or not a
 * `SaleConfig` existed — and none does on this cluster. Whether a phase is
 * running is a fact about the chain, so `/open` derives it from the account
 * and leaves this list to say only what the specification fixes.
 */
export const SALE_PHASES = [
  {
    name: "Community Presale",
    priceUsdc: OPEN_PRICE_USDC,
    allocation: "200,000,000 OPEN",
    note: "The full Community Presale bucket. Presale OPEN unlocks at claim — there is no vesting (§2).",
  },
  {
    name: "Public Sale",
    priceUsdc: PUBLIC_SALE_PRICE_USDC,
    allocation: "Unsold presale remainder",
    note: "A second, higher-priced phase against whatever is left of the same bucket when the presale closes.",
  },
  {
    name: "Mainnet — P2P & swaps",
    priceUsdc: null,
    allocation: "Market priced",
    note: "No fixed rate after the sale phases, so no figure is shown.",
  },
] as const;
