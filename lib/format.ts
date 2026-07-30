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

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Deterministic pseudo Solana address (44 base58 chars) derived from a seed string. */
export function pseudoAddress(seed: string): string {
  let h = 0x811c9dc5;
  let out = "";
  for (let i = 0; i < 44; i++) {
    h ^= seed.charCodeAt(i % seed.length) + i * 31;
    h = Math.imul(h, 0x01000193);
    out += BASE58[(h >>> 8) % 58];
  }
  return out;
}

/** Deterministic 88-char base58 transaction signature (Solana-style) from a seed. */
export function pseudoSignature(seed: string): string {
  return pseudoAddress(`sig-a-${seed}`) + pseudoAddress(`sig-b-${seed}`);
}

/** Truncated middle-ellipsis display for signatures: "5KtP4z…9xYq2m". */
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
