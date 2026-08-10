import { PublicKey } from "@solana/web3.js";

import { getConnection } from "@/lib/onchain-config";
import { decodeSaleConfig, type DecodedSaleConfig } from "@/lib/onchain-decode";

/**
 * The OPEN sale, as the deployed presale program actually holds it.
 *
 * # What this replaced
 *
 * `lib/data/sale.ts`'s `PRESALE`, whose `raised` field was the number
 * 24,500,000 — chosen, by its own comment, to sit above the target so the
 * page could illustrate a sale selling past its goal. `/open` rendered it as
 * "$24,500,000 / $20,000,000 (123%)" over a progress bar, with a Buy button
 * under it. A fabricated fundraising total on a token-sale page is the single
 * most consequential invented number this app could carry, and it was the
 * headline of the page.
 *
 * # The SaleConfig singleton is live on devnet
 *
 * The presale program is deployed at the id below, and as of the
 * 2026-08-09 re-baseline `initialize_sale` has been run on this cluster:
 * the singleton `SaleConfig` PDA (`79UQFdUjraHGb6LCduVELiM9c8rtUQwKXMRy7eTH3tSf`)
 * exists, reads `state: Active`, and carries `openPerUsdc: 100` (1 USDC =
 * 100 OPEN). `fetchSaleConfig` still returns `null` on any cluster where the
 * account genuinely doesn't exist — a fresh localnet, or a devnet reset —
 * and `null` still means exactly one thing there: **the sale is not open,
 * and there is no raised figure, no cap, no minimum and no deadline to
 * show.** Callers must render that as an unavailable state, never as zero
 * and never as a placeholder. Zero raised is a claim about a sale that is
 * running.
 *
 * Every economic parameter is an `initialize_sale` argument rather than a
 * compile-time constant, precisely so a tokenomics sign-off does not require
 * a program change — which is also why none of them may be mirrored here.
 * When the account exists, it is the answer.
 */

/**
 * `openfiat-presale`'s program id, from its own `declare_id!`.
 *
 * Hand-copied for the same reason and with the same reservation as
 * `DEVNET_OPEN_MINT` in `lib/onchain-config.ts`: `@openfiat/sdk` exports the
 * escrow, staking and governance ids from the protocol's own pinning and
 * does not export this one. A transposed character here would derive a PDA
 * that does not exist, which reads as "the sale is not open" — a plausible
 * answer even though the real sale is live, and therefore an error nothing
 * on screen would catch. It is pinned by `tests/onchain-decode.test.ts`
 * against the `declare_id!` in
 * `openfiat-core/programs/programs/presale/src/lib.rs`.
 */
export const PRESALE_PROGRAM_ID = "7KaEpDzZuqye1xqqp3RnvBJXnDxbU3W9zVrUr5vBS2fU";

/** PDA seed for the singleton `SaleConfig` (OFS-4200 §3). */
const SALE_CONFIG_SEED = "sale_config";

export function saleConfigPda(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from(SALE_CONFIG_SEED)],
    new PublicKey(PRESALE_PROGRAM_ID),
  );
  return pda;
}

/** `null` when `initialize_sale` has not run on this cluster. */
export async function fetchSaleConfig(): Promise<DecodedSaleConfig | null> {
  const account = await getConnection().getAccountInfo(saleConfigPda());
  return account ? decodeSaleConfig(account.data) : null;
}

/** A base-unit amount as a whole-token number, for display only. */
export function toWhole(baseUnits: bigint, decimals: number): number {
  return Number(baseUnits) / 10 ** decimals;
}

/**
 * OPEN base units a USDC contribution entitles a wallet to, computed the way
 * the deployed `SaleConfig::open_entitlement_for` computes it: scaled by the
 * two mints' decimal difference, then multiplied by the configured
 * `open_per_usdc` rate — OFS-4100 §3's re-baselined 1 USDC = 100 OPEN,
 * deployed 2026-08-09.
 *
 * Mirrored rather than fetched because it is the program's arithmetic, not a
 * parameter — a different formula shown here would be a figure the chain
 * refuses. It still takes the decimals and the rate off the account rather
 * than assuming them: `openPerUsdc` is `SaleConfig`'s own field (see
 * `DecodedSaleConfig` in `lib/onchain-decode.ts`), not a constant baked in
 * here, so a config the admin re-initializes at a different rate is read
 * correctly without a code change.
 */
export function openEntitlementFor(
  usdcBaseUnits: bigint,
  config: Pick<DecodedSaleConfig, "openDecimals" | "usdcDecimals" | "openPerUsdc">,
): bigint {
  return usdcBaseUnits * 10n ** BigInt(config.openDecimals - config.usdcDecimals) * config.openPerUsdc;
}
