import type { ReferenceData } from "@openfiat/sdk";
import { localizedCountryName } from "@/lib/display-names";

/**
 * Countries, as URL segments and as rows on a page — both derived from the
 * node's own table rather than from one compiled in here.
 *
 * # `lib/data/countries.ts` is gone
 *
 * It was 458 lines: 253 countries, each with a currency code, a currency
 * name, a currency symbol, an `isRecognized` flag and a hand-kept list of
 * second currencies. Its own doc comment had already conceded that
 * everything except the URL slug belonged to the node, and listed two
 * readers that were "not routing and have simply not been moved yet".
 *
 * The remaining argument for keeping it was that `generateStaticParams` and
 * `app/sitemap.ts` need slugs at build time, when there is no node to ask.
 * That argument does not survive contact with how a slug is made: it is
 * `slugify(name)`, a pure function of the country's name, and the node
 * sends the names. So there is nothing left for a table to hold — the slug
 * is computed from the node's answer, and the second copy of the world goes
 * away with it.
 *
 * # What that costs, stated plainly
 *
 * Two things.
 *
 * A URL is now downstream of a name the node chose, so a node that renames
 * "Côte d'Ivoire" changes `/country/cote-d-ivoire`. That is a real cost and
 * the reason a local table looked attractive; it is smaller than the cost it
 * replaces, which was two lists of the world that could disagree with each
 * other while both looked authoritative. `ReferenceData.revision` changes
 * when and only when the table does, so a rename is at least detectable.
 *
 * And a build that cannot reach a node prerenders no country pages. The
 * routes still work — they are rendered on demand — and the page says it
 * could not reach a node rather than claiming the country does not exist.
 * A sitemap missing routes recovers on the next build; one asserting routes
 * nobody verified does not.
 */

/** The country rows this app renders, resolved against the node's answer. */
export interface CountryView {
  code: string;
  /** The node's own (English) name. Canonical: the slug, all search, and every
   *  match are computed from this, so it never varies by locale. */
  name: string;
  /** The name to *show*, localized to the active locale via CLDR — equal to
   *  `name` for English and for pseudo-codes the CLDR has no entry for. Display
   *  only; never used to slug, search, or match. */
  displayName: string;
  /** `slugify(name)` — this app's own URL scheme, and the only local part. */
  slug: string;
  /** ISO 4217 (or local pseudo-code) primary currency, from the node. */
  currency: string;
  /** Other currencies the node says are in genuine use there. */
  altCurrencies: string[];
}

/**
 * A country name as a URL segment.
 *
 * Kept byte-identical to what `lib/data/countries.ts` produced, so every
 * `/country/...` URL that has ever been indexed still resolves. Diacritics
 * are folded rather than dropped, which is why "Côte d'Ivoire" is
 * `cote-d-ivoire` and not `cte-divoire`.
 */
export function countrySlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Every country the node listed, slugged, in the node's own order.
 *
 * `locale` localizes only the `displayName`; pass the active route locale where
 * one is available (a server component reads it with `getLocale()`), or omit it
 * at build time — `app/sitemap.ts` and `generateStaticParams` need slugs, which
 * come from the canonical `name` and do not depend on locale.
 */
export function countryViews(
  data: Pick<ReferenceData, "countries">,
  locale = "en",
): CountryView[] {
  return data.countries.map((country) => ({
    code: country.code,
    name: country.name,
    displayName: localizedCountryName(country.code, country.name, locale),
    slug: countrySlug(country.name),
    currency: country.currency,
    altCurrencies: [...country.alt_currencies].filter((code) => code !== country.currency),
  }));
}

/** The country a `/country/[slug]` URL names, or `undefined` if none does. */
export function countryBySlug(
  data: Pick<ReferenceData, "countries">,
  slug: string,
  locale = "en",
): CountryView | undefined {
  return countryViews(data, locale).find((country) => country.slug === slug);
}

/** Every currency a country trades in, primary first. */
export function currenciesFor(country: CountryView): string[] {
  return [country.currency, ...country.altCurrencies];
}

/**
 * Case-insensitive search across name, code, slug and currency code.
 *
 * Currency *names* are searchable too, but only where the node described
 * them — `describedCurrencies` is `getReferenceData`'s currency table keyed
 * by code. Passing an empty map narrows the search rather than breaking it,
 * which is the right failure for a control that is still usable.
 */
export function searchCountries(
  countries: readonly CountryView[],
  query: string,
  describedCurrencies: ReadonlyMap<string, { name: string }> = new Map(),
): CountryView[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...countries];
  return countries.filter(
    (country) =>
      country.name.toLowerCase().includes(q) ||
      // The localized name too, so a reader who sees "Alemania" can search for
      // it — matching only the canonical English name would make the search box
      // work in a language the page is no longer written in.
      country.displayName.toLowerCase().includes(q) ||
      country.code.toLowerCase() === q ||
      country.slug.includes(q) ||
      country.currency.toLowerCase().includes(q) ||
      (describedCurrencies.get(country.currency)?.name ?? "").toLowerCase().includes(q),
  );
}

/** Countries whose primary currency is `code` — used for a pair page's prose. */
export function countriesUsing(
  countries: readonly CountryView[],
  code: string,
): string[] {
  return countries.filter((country) => country.currency === code).map((c) => c.name);
}

// ── Flags ─────────────────────────────────────────────────────────────

/** Regional-indicator pair for an ISO 3166-1 alpha-2 code. */
export function flagEmoji(iso2: string): string {
  return String.fromCodePoint(
    ...iso2
      .toUpperCase()
      .split("")
      .map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65),
  );
}

/**
 * Territories with no flag of their own in Unicode, or none that renders.
 *
 * Presentation, and it stays in this app: the node's table carries codes
 * and names, and "which flag to draw for Somaliland" is not a protocol
 * question. The choices here are the ones a person would recognise —
 * Somaliland shows Somalia's, Northern Cyprus Türkiye's, Transnistria
 * Moldova's — rather than a blank square that reads as a broken font.
 */
const FLAG_SUBSTITUTE: Record<string, string> = { XS: "SO", XNC: "TR", XTR: "MD" };

/** Flag for a country code, or a neutral flag when none can be derived. */
export function flagForCountry(code: string): string {
  const iso = FLAG_SUBSTITUTE[code.toUpperCase()] ?? code.toUpperCase();
  return /^[A-Z]{2}$/.test(iso) ? flagEmoji(iso) : "🏳️";
}
