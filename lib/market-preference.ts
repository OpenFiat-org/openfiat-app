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
 * # It stores a currency, and separately the country page it came from
 *
 * It used to store only a country slug, and invert that slug back to a
 * currency through a 253-row table compiled into this app — which is why
 * `writePreferredCurrency` had to find "the country a euro belongs to"
 * before it could remember that somebody likes euros.
 *
 * That table is gone (see `lib/countries.ts`), and with it the inversion.
 * The currency is stored as a currency, which is what every reader wanted;
 * the slug is stored alongside it by the country pages, which already know
 * their own slug and are the only writers that do. Nothing has to map
 * between the two any more, and no list of the world is needed to do it.
 *
 * This is genuinely local: it is a preference about this browser, not a fact
 * about the network, and no node has an opinion about it.
 */

export const MARKET_STORAGE_KEY = "openfiat:market";
export const CURRENCY_STORAGE_KEY = "openfiat:currency";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    // Private-mode Safari and embedded webviews throw rather than returning
    // null. A missing preference is not an error worth surfacing.
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* localStorage unavailable */
  }
}

/** The stored country slug, or `null` when no country page has been visited. */
export function readMarketSlug(): string | null {
  return read(MARKET_STORAGE_KEY);
}

export function writeMarketSlug(slug: string): void {
  write(MARKET_STORAGE_KEY, slug);
}

/** The remembered fiat currency, or `null` when none has been chosen. */
export function preferredCurrency(): string | null {
  return read(CURRENCY_STORAGE_KEY);
}

/**
 * Remembers a currency.
 *
 * Takes the code as given. It deliberately does not check it against a list:
 * which currencies exist is the node's answer, this is a note about what one
 * person likes, and a preference refused because a build had not heard of a
 * corridor is a preference lost for no reason.
 */
export function writePreferredCurrency(code: string): void {
  write(CURRENCY_STORAGE_KEY, code);
}
