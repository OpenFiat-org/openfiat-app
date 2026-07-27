import type { MetadataRoute } from "next";

const BASE = "https://app.openfiat.network";

/**
 * Everything is crawlable. There is no private area to protect — the app holds
 * no accounts and no balances of its own, and every page describes a public
 * protocol.
 *
 * `/console`-style disallows would be wrong here for the same reason: the
 * wallet-dependent pages are empty without a wallet rather than sensitive.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
