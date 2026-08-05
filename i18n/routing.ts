import { defineRouting } from "next-intl/routing";

import { DEFAULT_LOCALE, LOCALE_CODES } from "./locales";

/**
 * The routing contract shared by the middleware, the navigation helpers, and
 * the request config.
 *
 * `localePrefix: "as-needed"` is the load-bearing choice. The default locale
 * (English) is served with no prefix, so every existing URL — including the
 * asset-pair routes like `/usdt/kes` and the country routes like `/kenya` —
 * keeps working untouched, and only the other locales get a `/es/`, `/ar/`
 * prefix. Because the locale set is closed (see `i18n/locales.ts`), the
 * middleware can tell a real locale prefix from a first path segment that only
 * looks like one: `usdt`, `countries`, `kenya` are not in the set, so they fall
 * through to the default locale and reach the same route they always did. This
 * is what resolves the collision between a `[locale]` segment and the
 * pre-existing top-level `[asset]` segment without a runtime guess.
 */
export const routing = defineRouting({
  locales: LOCALE_CODES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "as-needed",
});
