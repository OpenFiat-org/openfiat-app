import type { MetadataRoute } from "next";
import { COUNTRIES } from "@/lib/data/countries";
import { CURRENT_USER, MERCHANTS } from "@/lib/data/merchants";
import { PROVIDERS } from "@/lib/data/providers";

const BASE = "https://app.openfiat.network";
const LAST_UPDATED = new Date("2026-07-27");

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = [
    "",
    "/countries",
    "/guide",
    "/guide/buy",
    "/guide/sell",
    "/explorer",
    "/orders",
    "/ads",
    "/wallet",
    "/wallet/deposit",
    "/wallet/withdraw",
    "/disputes",
    "/account/identity",
    "/account/reputation",
    "/staking",
    "/staking/stake",
    "/governance",
    "/network",
    "/providers",
    "/settings",
  ].map((path) => ({
    url: `${BASE}${path}`,
    lastModified: LAST_UPDATED,
  }));

  const countryRoutes = COUNTRIES.map((c) => ({
    url: `${BASE}/country/${c.slug}`,
    lastModified: LAST_UPDATED,
  }));

  const merchantRoutes = [...MERCHANTS, CURRENT_USER].map((m) => ({
    url: `${BASE}/merchants/${m.id}`,
    lastModified: LAST_UPDATED,
  }));

  const providerRoutes = PROVIDERS.map((p) => ({
    url: `${BASE}/providers/${p.id}`,
    lastModified: LAST_UPDATED,
  }));

  return [...staticRoutes, ...countryRoutes, ...merchantRoutes, ...providerRoutes];
}
