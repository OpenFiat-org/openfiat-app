import type { MetadataRoute } from "next";
import { COUNTRIES, currenciesFor } from "@/lib/data/countries";
import { DISPUTES } from "@/lib/data/disputes";
import { CURRENT_USER, MERCHANTS } from "@/lib/data/merchants";
import { PROVIDERS } from "@/lib/data/providers";
import { PAIRS } from "@/lib/pairs";

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
export default function sitemap(): MetadataRoute.Sitemap {
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
  ];

  // Public, and worth indexing: they show how the protocol behaves rather than
  // requiring an account to be useful.
  const publicSurfaces = [
    entry("/disputes", 0.6, "daily"),
    entry("/governance", 0.6, "daily"),
    entry("/network", 0.5, "daily"),
    entry("/explorer", 0.5, "daily"),
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

  // One page per country, plus one per additional currency it trades in.
  const countryRoutes = COUNTRIES.flatMap((c) => [
    entry(`/country/${c.slug}`, 0.9, "daily"),
    ...currenciesFor(c)
      .slice(1)
      .map((code) => entry(`/country/${c.slug}/${code.toLowerCase()}`, 0.7, "daily")),
  ]);

  /*
   * Pair pages, ranked with the country markets. "convert USDT to KES" and "buy
   * USDT in Kenya" are the same intent expressed two ways, and both deserve to
   * be found.
   */
  const pairRoutes = PAIRS.map((pair) => entry(`/${pair.slug}`, 0.9, "daily"));

  const merchantRoutes = [...MERCHANTS, CURRENT_USER].map((m) =>
    entry(`/merchants/${m.id}`, 0.6, "daily"),
  );

  const providerRoutes = PROVIDERS.map((p) => entry(`/providers/${p.id}`, 0.5, "weekly"));

  // Dispute records are permanent for audit (OFS-2400 §7), which makes them
  // exactly the kind of thing worth being able to find again.
  const disputeRoutes = DISPUTES.map((d) => entry(`/disputes/${d.id}`, 0.4, "weekly"));

  return [
    ...primary,
    ...guides,
    ...publicSurfaces,
    ...countryRoutes,
    ...pairRoutes,
    ...merchantRoutes,
    ...providerRoutes,
    ...disputeRoutes,
    ...account,
  ];
}
