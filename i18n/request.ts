import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import { DEFAULT_LOCALE } from "./locales";
import { routing } from "./routing";

/**
 * Per-request i18n config: which locale, and the messages for it.
 *
 * Messages are loaded per locale from `messages/<locale>.json`. English is the
 * source catalogue and always exists; every other locale falls back to it for
 * any key it has not translated yet, which is what lets the long-tail locales
 * ship with the `Intl`-driven layer live (country/currency/number/date names)
 * while their message catalogue is still being filled in — a missing string
 * renders in English rather than as a raw key.
 *
 * `next-intl` resolves this fallback automatically when a namespace lookup
 * misses, provided English is loaded as the base; we merge explicitly so the
 * behaviour is visible here rather than implied.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : DEFAULT_LOCALE;

  const en = (await import("../messages/en.json")).default;
  const messages =
    locale === DEFAULT_LOCALE
      ? en
      : { ...en, ...(await import(`../messages/${locale}.json`)).default };

  return { locale, messages };
});
