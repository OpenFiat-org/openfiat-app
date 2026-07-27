import { MARKETS, ORACLE_MID, PUBLIC_ADS } from "@/lib/data/ads";
import { COUNTRIES } from "@/lib/data/countries";
import type { StablecoinAsset } from "@/lib/types";

/**
 * Asset/fiat pairs that get their own landing page.
 *
 * People search "convert USDT to KES", not "P2P exchange", and a page titled for
 * the query is the only thing that answers it. So: one page per pair, at
 * /usdt/kes.
 *
 * Restricted to pairs that actually have advertisements. Every asset against
 * every currency in the registry would be well over a thousand pages, most of
 * them empty — which dilutes the ones that matter and teaches a crawler the site
 * is mostly thin content. A pair earns a page by having a market behind it.
 */

export interface Pair {
  asset: StablecoinAsset;
  currency: string;
  /** Oracle mid: fiat per 1 unit of the asset. */
  rate: number;
  /** Live advertisement count on this pair. */
  ads: number;
  /** The market's local payment rails. */
  methods: string[];
  /** Countries where this currency is the primary one. */
  countries: string[];
  slug: string;
}

/** Ads on a pair, both directions, online only. */
function adsOn(asset: string, currency: string): number {
  return PUBLIC_ADS.filter(
    (a) => a.status === "Online" && a.asset === asset && a.fiatCurrency === currency,
  ).length;
}

export const PAIRS: Pair[] = MARKETS.flatMap((market) =>
  market.assets
    .map((asset) => {
      const rate = ORACLE_MID[`${asset}/${market.currency}`];
      const ads = adsOn(asset, market.currency);
      if (rate === undefined || ads === 0) return null;
      return {
        asset,
        currency: market.currency,
        rate,
        ads,
        methods: market.methods,
        countries: COUNTRIES.filter((c) => c.currencyCode === market.currency).map((c) => c.name),
        slug: `${asset.toLowerCase()}/${market.currency.toLowerCase()}`,
      } satisfies Pair;
    })
    .filter((p): p is Pair => p !== null),
);

const BY_SLUG = new Map(PAIRS.map((p) => [p.slug, p]));

export function findPair(asset: string, currency: string): Pair | undefined {
  return BY_SLUG.get(`${asset.toLowerCase()}/${currency.toLowerCase()}`);
}

/** Other pairs on the same currency — the useful sideways link. */
export function siblingsByCurrency(pair: Pair): Pair[] {
  return PAIRS.filter((p) => p.currency === pair.currency && p.asset !== pair.asset);
}

/**
 * The same asset in nearby currencies. Ranked by advertisement count rather
 * than alphabetically, so the suggestions are markets someone can actually
 * trade in.
 */
export function siblingsByAsset(pair: Pair, limit = 8): Pair[] {
  return PAIRS.filter((p) => p.asset === pair.asset && p.currency !== pair.currency)
    .sort((a, b) => b.ads - a.ads)
    .slice(0, limit);
}
