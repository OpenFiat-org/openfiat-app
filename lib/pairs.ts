import { COUNTRIES } from "@/lib/data/countries";
import type { StablecoinAsset } from "@/lib/types";

/**
 * Asset/fiat pairs that get their own landing page — /usdt/kes, /usdc/ngn.
 *
 * People search "convert USDT to KES", not "peer-to-peer exchange", and a
 * page titled for the query is the only thing that answers it.
 *
 * # This module used to decide which pairs exist. It cannot.
 *
 * `PAIRS` was a constant, built at module load by crossing a `MARKETS`
 * fixture with `ORACLE_MID` — a hand-written table of fifteen rates — and
 * keeping the combinations that had entries in a PRNG-generated
 * advertisement book. Every pair page's headline number came from that table,
 * as did the converter beneath it, the `<meta name="description">`, and the
 * rate printed on the OpenGraph card that went out with every shared link. It
 * was fifteen invented exchange rates published as this network's prices.
 *
 * The live equivalent is one call away and now answers for these pairs, so
 * the table is deleted rather than annotated. Which pairs are priced is a
 * question only an oracle can answer, and the answer changes: devnet feeds
 * carry a three-hour expiry, so a set fixed at build time would be wrong
 * within a working day. See `lib/live-oracle.ts`.
 *
 * What is left here is the part that genuinely is static — which asset slugs
 * are real, and which countries use a currency. Neither is a claim about the
 * network's prices.
 */

/** The assets this app has pages for. A URL naming anything else is a 404. */
export const PAIR_ASSETS: readonly StablecoinAsset[] = ["USDT", "USDC", "USD1", "SOL"];

export interface PairSlug {
  asset: StablecoinAsset;
  currency: string;
  slug: string;
}

/**
 * `("usdt", "kes")` to a canonical pair, or `null` if the URL is not one.
 *
 * The asset is checked against a closed list and the currency only for shape.
 * That asymmetry is deliberate: the asset set is ours and finite, while the
 * currencies are whatever an oracle chooses to publish — validating those
 * against a table here would 404 a pair the network genuinely prices the
 * moment somebody adds a corridor this app has not heard of.
 *
 * The asset check is what keeps `/[asset]/[currency]` from swallowing junk:
 * two arbitrary path segments fail it and 404 rather than rendering a pair
 * page about nothing.
 */
export function normalisePair(asset: string, currency: string): PairSlug | null {
  const upperAsset = asset.toUpperCase();
  const upperCurrency = currency.toUpperCase();
  if (!PAIR_ASSETS.includes(upperAsset as StablecoinAsset)) return null;
  if (!/^[A-Z]{3,4}$/.test(upperCurrency)) return null;
  return {
    asset: upperAsset as StablecoinAsset,
    currency: upperCurrency,
    slug: `${upperAsset.toLowerCase()}/${upperCurrency.toLowerCase()}`,
  };
}

/** Countries where this is the primary currency — a fact about the world. */
export function countriesUsing(currency: string): string[] {
  return COUNTRIES.filter((country) => country.currencyCode === currency).map(
    (country) => country.name,
  );
}
