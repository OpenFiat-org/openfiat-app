/**
 * Simulated OPEN token public sale. OPEN P2P trading and swapping unlock at
 * mainnet — until then OPEN is only available through the official sale.
 */

export const OPEN_PRICE_USDC = 0.08;

export const PRESALE = {
  phase: "Presale",
  status: "Live" as const,
  priceUsdc: OPEN_PRICE_USDC,
  /** USDC raised so far toward the phase cap. */
  raised: 14750000,
  cap: 35000000,
  minContribution: 50, // USDC
  maxContribution: 250000, // USDC
};

export const SALE_PHASES = [
  { name: "Seed", priceUsdc: 0.05, allocation: "20,000,000 OPEN", status: "Done" },
  { name: "Presale", priceUsdc: OPEN_PRICE_USDC, allocation: "35,000,000 OPEN", status: "Live" },
  { name: "Public", priceUsdc: 0.12, allocation: "45,000,000 OPEN", status: "Upcoming" },
] as const;
