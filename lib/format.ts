/**
 * Number/date formatting helpers. Deterministic: dates are parsed from fixed
 * ISO strings anchored to UTC (never the local time zone, never `Date.now()`),
 * so server and client renders always match.
 *
 * # Locale
 *
 * Every function takes an optional `locale`, defaulting to `en`. That default
 * is load-bearing: for `en` the output is byte-for-byte what these helpers
 * produced before they were localized — the same grouping, the same
 * `12 Jul 2026 · 14:32` — so every existing call site and test is unchanged
 * until it opts in by passing a locale. When a locale *is* passed it is always
 * the route locale (`/es/…`), identical on server and client, so localized
 * numerals and month names never cause a hydration mismatch.
 *
 * The currency/asset suffix stays the code (`33.112,50 KES`, not a symbol):
 * only the number is localized. Appending the code rather than a symbol is a
 * deliberate app-wide convention (a symbol is ambiguous across the dollar and
 * franc zones this app serves), and localizing the symbol placement would fight
 * it; the digits are the part that actually differs by locale.
 */

/** `en` is stored as `en-US` so its grouping matches the historical output
 *  exactly; any other locale is used as given. */
function numberLocale(locale: string): string {
  return locale === "en" ? "en-US" : locale;
}

export function formatNumber(value: number, decimals = 2, locale = "en"): string {
  return new Intl.NumberFormat(numberLocale(locale), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** e.g. "33,112.50 KES" (en) or "33.112,50 KES" (de) */
export function formatFiat(value: number, currency: string, decimals = 2, locale = "en"): string {
  return `${formatNumber(value, decimals, locale)} ${currency}`;
}

/** e.g. "250.00 USDT" */
export function formatCrypto(value: number, asset: string, decimals = 2, locale = "en"): string {
  return `${formatNumber(value, decimals, locale)} ${asset}`;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** A UTC `Date` from an ISO string's own numeric parts — the same substring
 *  read the `en` paths do, so a `Z`-less timestamp is never reinterpreted in
 *  the local zone. Shared by the localized date paths below. */
function utcFromIso(iso: string): Date {
  return new Date(
    Date.UTC(
      Number(iso.slice(0, 4)),
      Number(iso.slice(5, 7)) - 1,
      Number(iso.slice(8, 10)),
      Number(iso.slice(11, 13)),
      Number(iso.slice(14, 16)),
    ),
  );
}

/*
 * `pseudoAddress` and `pseudoSignature` used to sit here: deterministic
 * fake base58 strings derived from a seed, which gave every merchant in
 * `lib/data/merchants.ts` a wallet and every trade a signature. Both fed
 * fixtures only, and both went with them. Nothing in this app should be
 * able to manufacture an address that looks real.
 */

export function shortSig(sig: string): string {
  return `${sig.slice(0, 6)}…${sig.slice(-6)}`;
}

/** "7xKmVd8h…" → "7xKm…9fQ2" */
export function shortAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/** "2026-07-12T14:32:00Z" → "12 Jul 2026 · 14:32" (en), localized otherwise.
 *  Deterministic in both: the `en` path reads substrings, the localized path
 *  formats a UTC date, so neither depends on the runtime's time zone. */
export function formatDate(iso: string, locale = "en"): string {
  if (locale !== "en") {
    const date = new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(utcFromIso(iso));
    const time = new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: "UTC",
    }).format(utcFromIso(iso));
    return `${date} · ${time}`;
  }
  const day = iso.slice(8, 10).replace(/^0/, "");
  const month = MONTHS[Number(iso.slice(5, 7)) - 1] ?? "?";
  const year = iso.slice(0, 4);
  const time = iso.slice(11, 16);
  return `${day} ${month} ${year} · ${time}`;
}

/** "2026-07-12T14:32:00Z" → "12 Jul 2026" (en), localized otherwise. */
export function formatDateShort(iso: string, locale = "en"): string {
  if (locale !== "en") {
    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(utcFromIso(iso));
  }
  const day = iso.slice(8, 10).replace(/^0/, "");
  const month = MONTHS[Number(iso.slice(5, 7)) - 1] ?? "?";
  const year = iso.slice(0, 4);
  return `${day} ${month} ${year}`;
}

/**
 * `formatDate`/`formatDateShort` for a live `TimestampMs` (milliseconds
 * since the Unix epoch — `openfiat_types::Timestamp`'s wire shape) rather
 * than a fixture's already-ISO string.
 */
export function formatDateMs(ms: number, locale = "en"): string {
  return formatDate(new Date(ms).toISOString(), locale);
}

export function formatDateShortMs(ms: number, locale = "en"): string {
  return formatDateShort(new Date(ms).toISOString(), locale);
}

/**
 * "3 hours ago" — how long ago a millisecond timestamp was.
 *
 * Written for `last_health_update`, which is the only liveness signal OFS-1500
 * carries. The registry records a health state and when it was last refreshed;
 * it does not record an uptime percentage, and nothing in the protocol
 * computes one. "Last heard from" is the honest answer to the question people
 * reach for uptime to ask, and this lives here so the directory and the
 * per-service page give that answer in one vocabulary rather than two.
 */
export function sinceLabel(millis: number, locale = "en"): string {
  const seconds = Math.max(0, Math.round((Date.now() - millis) / 1000));
  const minutes = Math.round(seconds / 60);
  const hours = Math.round(minutes / 60);

  if (locale !== "en") {
    // `Intl.RelativeTimeFormat` has no "just now", so the sub-90-second case
    // still routes through the message catalogue; the rest localizes here.
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "always" });
    if (seconds < 90) return rtf.format(-Math.max(1, seconds), "second");
    if (minutes < 90) return rtf.format(-minutes, "minute");
    if (hours < 36) return rtf.format(-hours, "hour");
    return rtf.format(-Math.round(hours / 24), "day");
  }

  if (seconds < 90) return "just now";
  if (minutes < 90) return `${minutes} minutes ago`;
  if (hours < 36) return `${hours} hours ago`;
  return `${Math.round(hours / 24)} days ago`;
}
