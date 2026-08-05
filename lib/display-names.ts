/**
 * Localized display names for the node's country and currency codes.
 *
 * # Why this is allowed to exist next to "the node is the authority"
 *
 * `lib/reference.ts` is emphatic that this app invents no facts about the
 * network — countries, currencies and payment methods are the node's answer,
 * passed through. It makes exactly two exceptions, and states why: flags and
 * default ordering, because both are "a rendering detail... not a fact about
 * the network." A localized name is the same kind of thing. The node says a
 * country's code is `DE`; whether a reader sees "Germany", "Alemania" or
 * "ドイツ" is presentation, decided from that code at the edge, and no more a
 * claim about the network than which flag to draw. The node's own English
 * name stays the canonical value — it is what the URL slug and every search
 * and match are computed from (`lib/countries.ts`); this only changes what is
 * shown.
 *
 * # Why `Intl.DisplayNames` rather than translation files
 *
 * The names of every country and currency, in all 27 shipped locales, already
 * live in the platform's CLDR data. Translating them by hand would be
 * re-deriving that, worse, for thousands of entries — and getting a currency
 * or country name subtly wrong in a financial UI is exactly the nuance error
 * this whole effort is meant to avoid. So the message catalogues carry the
 * app's own copy; these names come from the browser/runtime.
 *
 * # Determinism
 *
 * The `locale` passed here is always the route locale (`/es/…`), identical on
 * server and client, never the browser's `Accept-Language`. So a name renders
 * the same in both passes and there is no hydration mismatch — the same
 * guarantee `lib/format.ts` protects for numbers.
 */

/** ISO 4217 codes are three ASCII letters; anything else is a node pseudo-code
 *  (e.g. a local unit the CLDR has no entry for) and must fall back. */
const ISO_CURRENCY = /^[A-Za-z]{3}$/;
/** `Intl.DisplayNames` accepts a region as two ASCII letters or three digits.
 *  The node's `XNC`/`XTR`-style pseudo-codes are three letters and would throw,
 *  so they are routed to the fallback rather than into `Intl`. */
const ISO_REGION = /^([A-Za-z]{2}|\d{3})$/;

type DisplayType = "region" | "currency";

/**
 * One `Intl.DisplayNames` per (locale, type). Constructing one is not free and
 * the country list runs to ~250 entries per render; without this each row would
 * build and throw away its own formatter.
 */
const cache = new Map<string, Intl.DisplayNames>();

function displayNames(locale: string, type: DisplayType): Intl.DisplayNames {
  const key = `${locale}:${type}`;
  let dn = cache.get(key);
  if (!dn) {
    // `fallback: "none"` makes `.of()` return `undefined` for a code the CLDR
    // does not know, so this app's own fallback (the node's name) is used
    // rather than the bare code the "code" fallback would leave behind.
    dn = new Intl.DisplayNames([locale], { type, fallback: "none" });
    cache.set(key, dn);
  }
  return dn;
}

/**
 * A country's name in `locale`, or `fallback` (the node's own English name)
 * when the code is a pseudo-code the CLDR has no entry for.
 *
 * `fallback` is required, not optional: there is always a better answer than a
 * two-letter code to show a person, and it is the name the node already sent.
 */
export function localizedCountryName(code: string, fallback: string, locale: string): string {
  if (!ISO_REGION.test(code)) return fallback;
  try {
    return displayNames(locale, "region").of(code.toUpperCase()) ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * A currency's name in `locale`, or `fallback` when the code is not an ISO 4217
 * code the CLDR describes. Note ISO codes like `XOF`/`XAF`/`XCD`/`XPF` — the
 * CFA francs and Pacific/Caribbean units — *are* in the CLDR and localize
 * normally; only genuine node pseudo-codes fall through.
 */
export function localizedCurrencyName(code: string, fallback: string, locale: string): string {
  if (!ISO_CURRENCY.test(code)) return fallback;
  try {
    return displayNames(locale, "currency").of(code.toUpperCase()) ?? fallback;
  } catch {
    return fallback;
  }
}
