/**
 * Plain number/date formatting helpers. No dependencies, fully deterministic:
 * dates are parsed from fixed ISO strings (never `Date.now()`), so server and
 * client renders always match.
 */

export function formatNumber(value: number, decimals = 2): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** e.g. "33,112.50 KES" */
export function formatFiat(value: number, currency: string, decimals = 2): string {
  return `${formatNumber(value, decimals)} ${currency}`;
}

/** e.g. "250.00 USDT" */
export function formatCrypto(value: number, asset: string, decimals = 2): string {
  return `${formatNumber(value, decimals)} ${asset}`;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

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

/** "2026-07-12T14:32:00Z" → "12 Jul 2026 · 14:32" (deterministic substring parse). */
export function formatDate(iso: string): string {
  const day = iso.slice(8, 10).replace(/^0/, "");
  const month = MONTHS[Number(iso.slice(5, 7)) - 1] ?? "?";
  const year = iso.slice(0, 4);
  const time = iso.slice(11, 16);
  return `${day} ${month} ${year} · ${time}`;
}

/** "2026-07-12T14:32:00Z" → "12 Jul 2026" */
export function formatDateShort(iso: string): string {
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
export function formatDateMs(ms: number): string {
  return formatDate(new Date(ms).toISOString());
}

export function formatDateShortMs(ms: number): string {
  return formatDateShort(new Date(ms).toISOString());
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
export function sinceLabel(millis: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - millis) / 1000));
  if (seconds < 90) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} hours ago`;
  return `${Math.round(hours / 24)} days ago`;
}
