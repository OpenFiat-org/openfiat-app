import { COUNTRIES_BY_SLUG, countriesByCurrency } from "@/lib/data/countries";

/**
 * The market this browser last chose, and the one the exchange opens on.
 *
 * # Why this module exists
 *
 * The key was private to `components/p2p/exchange.tsx`, which read and wrote
 * it correctly. The settings screen had its own "Default fiat currency"
 * control that wrote nowhere: a `useState("KES")` under the caption "Used
 * across the P2P exchange and trade screens", which it was not. Changing it
 * changed nothing, and the page's own footer admitted as much in grey text —
 * "Preferences are simulated and reset on reload".
 *
 * A control that names an effect it does not have is the same class of
 * problem as a fabricated number: a reader has no way to tell it apart from
 * one that works. So the key moved here and both screens read it.
 *
 * # It stores a country slug, not a currency code
 *
 * Because a market is a country page — `/country/kenya` — and the exchange
 * remembers the last one browsed. A currency maps to many countries, so
 * writing a currency would lose which of them the reader meant. Going the
 * other way is lossless, which is why {@link preferredCurrency} exists and
 * its inverse takes the recognized country as the representative one.
 *
 * This is genuinely local: it is a preference about this browser, not a
 * fact about the network, and no node has an opinion about it.
 */

export const MARKET_STORAGE_KEY = "openfiat:market";

/** The stored country slug, or `null` when nothing has been chosen. */
export function readMarketSlug(): string | null {
  try {
    return localStorage.getItem(MARKET_STORAGE_KEY);
  } catch {
    // Private-mode Safari and embedded webviews throw rather than returning
    // null. A missing preference is not an error worth surfacing.
    return null;
  }
}

export function writeMarketSlug(slug: string): void {
  try {
    localStorage.setItem(MARKET_STORAGE_KEY, slug);
  } catch {
    /* localStorage unavailable */
  }
}

/** The currency of the remembered market, or `null` if there is none. */
export function preferredCurrency(): string | null {
  const slug = readMarketSlug();
  if (!slug) return null;
  return COUNTRIES_BY_SLUG.get(slug)?.currencyCode ?? null;
}

/**
 * Remembers a currency by storing a country that trades in it.
 *
 * A UN-member state wins where there is a choice, so the euro is remembered
 * under a country a reader would expect rather than whichever entry happened
 * to sort first. Returns `false` when no country in the table uses the code,
 * which the caller should treat as "not stored" rather than ignoring.
 */
export function writePreferredCurrency(code: string): boolean {
  const users = countriesByCurrency(code);
  const country = users.find((c) => c.isRecognized) ?? users[0];
  if (!country) return false;
  writeMarketSlug(country.slug);
  return true;
}
