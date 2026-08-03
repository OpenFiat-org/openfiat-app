import type { MetadataRoute } from "next";
import { countryViews, currenciesFor } from "@/lib/countries";
import { referenceForRender } from "@/lib/server-reference";
import { fetchPricedPairs } from "@/lib/live-oracle";

const BASE = "https://app.openfiat.network";
const LAST_UPDATED = new Date("2026-07-28");

type Frequency = "daily" | "weekly" | "monthly";

/**
 * Every indexable route.
 *
 * Derived from the data wherever a route is derived from data, so a new country
 * or provider appears here without anyone remembering. The hand-written list is
 * the part that drifts, and it had: /guide/merchant, /open, /providers/register,
 * the per-currency country pages and the dispute records were all live and none
 * were listed.
 *
 * Priorities are relative and only mean anything against each other. Country
 * markets rank highest because they are what people actually search — "buy USDT
 * in Kenya" — followed by the guides that answer the question behind that
 * search. Wallet-dependent pages are listed for completeness but ranked bottom:
 * they are empty without a connected wallet, so a searcher landing on one learns
 * nothing.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entry = (path: string, priority: number, changeFrequency: Frequency) => ({
    url: `${BASE}${path}`,
    lastModified: LAST_UPDATED,
    changeFrequency,
    priority,
  });

  const primary = [
    entry("", 1, "daily"),
    entry("/countries", 0.9, "weekly"),
    entry("/open", 0.8, "weekly"),
  ];

  const guides = [
    entry("/guide", 0.8, "monthly"),
    entry("/guide/buy", 0.8, "monthly"),
    entry("/guide/sell", 0.8, "monthly"),
    entry("/guide/merchant", 0.8, "monthly"),
    entry("/become-a-merchant", 0.8, "monthly"),
  ];

  // Public, and worth indexing: they show how the protocol behaves rather than
  // requiring an account to be useful.
  const publicSurfaces = [
    entry("/disputes", 0.6, "daily"),
    entry("/governance", 0.6, "daily"),
    entry("/network", 0.5, "daily"),
    entry("/explorer", 0.5, "daily"),
    entry("/merchants", 0.6, "weekly"),
    entry("/providers", 0.6, "weekly"),
    entry("/providers/register", 0.7, "monthly"),
    entry("/staking", 0.5, "weekly"),
  ];

  const account = [
    "/orders",
    "/orders/new",
    "/ads",
    "/ads/new",
    "/wallet",
    "/wallet/deposit",
    "/wallet/withdraw",
    "/staking/stake",
    "/account/identity",
    "/account/reputation",
    "/account/counterparties",
    "/settings",
  ].map((path) => entry(path, 0.2, "monthly"));

  /*
   * One page per country, plus one per additional currency it trades in.
   *
   * Read from the node rather than from a table in this repository. Those
   * routes used to be generated from `lib/data/countries.ts`, whose 253 rows
   * and hand-kept second currencies were this app's own copy of the world —
   * so the sitemap submitted `/country/zimbabwe/usd` to search engines on
   * the strength of a line somebody typed here, and would have kept
   * submitting a country the network had dropped.
   *
   * A build that cannot reach a node emits none of these. That is the same
   * trade the pair routes below already make: a sitemap missing routes
   * recovers on the next build, whereas one asserting routes nobody verified
   * does not.
   */
  const reference = await referenceForRender();
  const countryRoutes = (reference ? countryViews(reference) : []).flatMap((c) => [
    entry(`/country/${c.slug}`, 0.9, "daily"),
    ...currenciesFor(c)
      .slice(1)
      .map((code) => entry(`/country/${c.slug}/${code.toLowerCase()}`, 0.7, "daily")),
  ]);

  /*
   * Pair pages, ranked with the country markets. "convert USDT to KES" and "buy
   * USDT in Kenya" are the same intent expressed two ways, and both deserve to
   * be found.
   *
   * Read from the oracle rather than from a list. These used to come from
   * `PAIRS`, a constant crossing a markets fixture with fifteen hand-written
   * rates, so this sitemap submitted markets to search engines on the strength
   * of a table somebody typed — the same mistake the 19 invented provider
   * routes below were removed for, and harder to notice because the pairs
   * themselves sound plausible.
   *
   * Only pairs with a current median are listed. A lapsed pair keeps its page,
   * which says the feed has lapsed, but pointing a crawler at it advertises a
   * market that cannot presently be quoted. And a node that cannot be reached
   * yields none: a sitemap missing a few routes recovers on the next build,
   * whereas one asserting routes nobody verified does not.
   */
  const pairRoutes = (await fetchPricedPairs()).map((pair) =>
    entry(`/${pair.slug}`, 0.9, "daily"),
  );

  /*
   * No per-merchant routes, for the same reason there are no per-provider
   * ones. This used to enumerate `lib/data/merchants.ts` and submit 68
   * invented trading desks — with invented order counts, completion rates and
   * reviews — to search engines as real, indexable profiles. `/merchants` is
   * now a live directory read from the advertisement book, and a per-merchant
   * page backed by anything real does not exist yet. Publishing the fabricated
   * ones in the meantime is worse than publishing none: an absent page costs a
   * reader nothing, and a fabricated one costs them their judgement about a
   * stranger they are about to send money to.
   */
  const merchantRoutes: MetadataRoute.Sitemap = [];

  // No per-provider routes. They used to be generated from a fixture, so
  // this sitemap submitted 19 invented service providers to search engines
  // as real, indexable pages. The directory reads the live registry now,
  // and a live per-provider page does not exist yet — publishing the
  // fabricated ones in the meantime is worse than publishing none.
  const providerRoutes: MetadataRoute.Sitemap = [];

  // Individual dispute case pages are not listed here: the docket is read
  // from a live node (`lib/live-disputes.ts`), not a static fixture, so there
  // is no build-time list of ids to enumerate. `/disputes` itself is listed
  // above under `publicSurfaces`.

  return [
    ...primary,
    ...guides,
    ...publicSurfaces,
    ...countryRoutes,
    ...pairRoutes,
    ...merchantRoutes,
    ...providerRoutes,
    ...account,
  ];
}
