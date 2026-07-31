import { cache } from "react";

import { fetchAdvertisements } from "@/lib/live-advertisements";
import {
  fetchExchangeRateRecords,
  lookupRate,
  pricedPairs,
  type PricedPair,
  type RateLookup,
} from "@/lib/live-oracle";
import { countriesUsing, type PairSlug } from "@/lib/pairs";

/**
 * Everything a pair page states, read from the node once per request.
 *
 * `generateMetadata` and the page body both need the rate, and Next calls
 * them separately. `cache()` de-duplicates within a request so a single page
 * view makes one oracle call rather than two — which matters more than usual
 * here, because the rate must not be served from Next's data cache at all
 * (see `lib/live-oracle.ts`) and would otherwise be fetched twice on every
 * hit.
 *
 * A node that cannot be reached yields a `no-data` rate and no advertisers.
 * That is indistinguishable, on screen, from a node that answered and knew
 * nothing — which is a real limitation and the reason `unreachable` is
 * carried separately rather than folded in: the page says which of the two
 * happened, because "we could not ask" and "we asked and there is nothing"
 * are different facts and only one of them is about the network.
 */
export interface PairData {
  rate: RateLookup;
  /** Live advertisements on this pair, both directions, currently active. */
  advertisers: number;
  /** Payment rails those advertisements actually accept. */
  methods: string[];
  /** Countries using this currency — reference data, not a network claim. */
  countries: string[];
  /** Other pairs an oracle is pricing right now. */
  priced: PricedPair[];
  /** True when the node could not be reached at all. */
  unreachable: boolean;
}

export const loadPairData = cache(async (pair: PairSlug): Promise<PairData> => {
  const countries = countriesUsing(pair.currency);

  let records;
  try {
    records = await fetchExchangeRateRecords();
  } catch {
    return {
      rate: { kind: "no-data" },
      advertisers: 0,
      methods: [],
      countries,
      priced: [],
      unreachable: true,
    };
  }

  // The book is a separate read and a separate failure: a node with a healthy
  // oracle index can still fail this call, and an empty advertisement list is
  // a legitimate answer that must not be reported as a broken node.
  let advertisers = 0;
  let methods: string[] = [];
  try {
    // `pair.asset` is a ticker, because the URL is one. It is matched against
    // the symbol the node resolved for each advertisement's mint — never
    // against a mint this app decided the ticker means. An advertisement in a
    // mint the node cannot name therefore counts towards no ticker page,
    // which is right: nothing names it, so no ticker URL is about it.
    const ads = (await fetchAdvertisements()).filter(
      (ad) =>
        ad.status === "Active" &&
        ad.assetSymbol?.toUpperCase() === pair.asset &&
        ad.fiatCurrency.toUpperCase() === pair.currency,
    );
    advertisers = new Set(ads.map((ad) => ad.merchantPeerId)).size;
    methods = [...new Set(ads.flatMap((ad) => ad.paymentMethods))].sort();
  } catch {
    /* The rate is the page; a missing book leaves the rest of it standing. */
  }

  return {
    rate: lookupRate(records, pair.asset, pair.currency),
    advertisers,
    methods,
    countries,
    priced: pricedPairs(records),
    unreachable: false,
  };
});
