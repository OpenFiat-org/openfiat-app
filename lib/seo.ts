import { DEFAULT_LOCALE, LOCALE_CODES } from "@/i18n/locales";

/**
 * Per-locale URL and `hreflang` helpers, shared by the sitemap and by every
 * page's metadata so the two never disagree about where a locale lives.
 *
 * The rule is `localePrefix: "as-needed"` (see `i18n/routing.ts`): the default
 * locale is unprefixed, every other locale is prefixed. Encoding that in one
 * place means a route that moves, or a locale that is added, updates the
 * canonical URL, the `hreflang` alternates, and the sitemap together.
 */

/** Absolute site origin. Kept here so the sitemap and metadata share one. */
export const SITE_ORIGIN = "https://app.openfiat.network";

/** The path for `locale`, given a canonical (default-locale) path like
 *  `/countries` or `""` for the home page. */
export function localePath(path: string, locale: string): string {
  return locale === DEFAULT_LOCALE ? path || "/" : `/${locale}${path}`;
}

/**
 * The `hreflang` map for a path: every locale's absolute URL, plus
 * `x-default` pointing at the unprefixed default.
 *
 * Google reads `x-default` as "the page to serve when no declared language
 * matches the user" — the default locale is the honest answer, since that is
 * what the unprefixed URL actually serves.
 */
export function hreflangLanguages(path: string): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const code of LOCALE_CODES) {
    languages[code] = `${SITE_ORIGIN}${localePath(path, code)}`;
  }
  languages["x-default"] = `${SITE_ORIGIN}${path || "/"}`;
  return languages;
}

/**
 * The `alternates` block for a Next.js `Metadata` object: a self-referential
 * canonical (the locale's own URL) and the full language set. Dropped into a
 * page's `generateMetadata` return so search engines learn every translation
 * of that page exists and which URL is canonical for the current one.
 */
export function alternatesFor(
  path: string,
  locale: string,
): { canonical: string; languages: Record<string, string> } {
  return {
    canonical: `${SITE_ORIGIN}${localePath(path, locale)}`,
    languages: hreflangLanguages(path),
  };
}
