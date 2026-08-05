import createMiddleware from "next-intl/middleware";

import { routing } from "./i18n/routing";

/**
 * Locale negotiation and prefixing, run at the edge before every page.
 *
 * With `localePrefix: "as-needed"` this does three things: serves the default
 * locale unprefixed, prefixes the others, and — the reason the matcher below is
 * written the way it is — never touches anything that is not a page.
 */
export default createMiddleware(routing);

export const config = {
  /**
   * Run on everything except Next internals, API routes, and files with an
   * extension. The negative lookahead is what keeps the middleware off
   * `sitemap.xml`, `robots.txt`, `/manifest.webmanifest`, the favicons, and the
   * `next/og` image routes — all of which live at the app root (not under a
   * locale) and must be served once, canonically, not multiplied per locale.
   */
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
