import { DEFAULT_NODE_URL } from "@/lib/node-endpoint";

/**
 * Exchange rates as the oracle index actually holds them (OFS-7000).
 *
 * # Why this reads records and not `getMedianExchangeRate`
 *
 * There is an RPC method that returns the median directly, and it is the
 * obvious thing to call. It returns `Option<f64>` — so a pair nobody
 * publishes and a pair whose every feed has lapsed both come back as `null`,
 * indistinguishable.
 *
 * `openfiat_oracles`' own `ExchangeRateLookup` refuses to make that
 * conflation, and its doc says why in as many words: collapsing them "is how
 * a caller ends up treating 'the feed died' as 'this pair isn't supported'
 * and quietly moving on". The three-variant enum exists inside the node; the
 * JSON-RPC surface flattens it back to two states on the way out.
 *
 * So this module asks `getOracleRecords` for the raw records and derives the
 * same three answers on this side, applying §11's median rule exactly as
 * `OracleIndex::exchange_rate` does: every matching record, expired ones
 * included, because telling "absent" from "expired" apart is only possible
 * while you can still see the expired ones.
 *
 * That distinction is not academic here. The devnet feed is published with a
 * three-hour expiry and the refresh timer is written but not deployed, so a
 * pair lapsing is a state this app will show routinely rather than a branch
 * kept for completeness. "The rate has gone stale, come back shortly" and
 * "no oracle prices this pair at all" send a reader in opposite directions,
 * and only one of them is worth waiting on.
 *
 * # No rate is ever a number
 *
 * Neither failure produces a figure. §12 is explicit that expired data should
 * not be treated as current, so a lapsed feed does not license showing the
 * last value with a caveat next to it — a stale number on screen is read as
 * the rate, whatever the caption says.
 */

/** An `OracleRecord` whose `data` is an `ExchangeRate`, as the wire carries it. */
interface RawOracleRecord {
  id: string;
  data: { ExchangeRate?: { base: string; quote: string; rate: number } };
  expires_at: number;
  published_at: number;
}

export interface ExchangeRateRecord {
  id: string;
  base: string;
  quote: string;
  rate: number;
  expiresAt: number;
  publishedAt: number;
}

export type RateLookup =
  /** A median over at least one unexpired record, good until `expiresAt`. */
  | {
      kind: "current";
      rate: number;
      expiresAt: number;
      /**
       * How many unexpired records the median was taken over, or `null`
       * when the answer did not say.
       *
       * `null` rather than `1` or `0` for {@link fetchNodeRate}, which asks
       * the node for the median and is told the median: the count is a fact
       * about the node's index that only the records carry. A number here
       * would be this app's guess at how thin a feed is, in the direction
       * that makes a thin one look robust.
       */
      contributors: number | null;
    }
  /** Published, but every record for it has lapsed. Deliberately not a rate. */
  | {
      kind: "stale";
      /**
       * When the last contributing record expired, or `null` when the
       * answer did not say. Never `Date.now()` — dating somebody else's
       * lapsed feed from this app's clock is an invention.
       */
      lapsedAt: number | null;
    }
  /** No provider has ever published this pair. */
  | { kind: "no-data" };

async function rpc<T>(endpoint: string, method: string, params: unknown): Promise<T> {
  const res = await fetch(`${endpoint.replace(/\/$/, "")}/rpc`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    // The feed turns over every three hours and a cached rate is a wrong
    // rate, so this is never served from Next's data cache.
    cache: "no-store",
  });
  const body = (await res.json()) as { result?: T; error?: { message: string } };
  if (body.error) throw new Error(body.error.message);
  return body.result as T;
}

/**
 * Every exchange-rate record the node holds, expired ones included.
 *
 * Records that are not exchange rates are dropped rather than carried: OFS-7000
 * allows other `OracleData` variants, and none of them price a pair.
 */
export async function fetchExchangeRateRecords(
  endpoint: string = DEFAULT_NODE_URL,
): Promise<ExchangeRateRecord[]> {
  const records = await rpc<RawOracleRecord[]>(endpoint, "getOracleRecords", {});
  return (records ?? []).flatMap((record) => {
    const rate = record.data?.ExchangeRate;
    if (!rate) return [];
    return [
      {
        id: record.id,
        base: rate.base,
        quote: rate.quote,
        rate: rate.rate,
        expiresAt: record.expires_at,
        publishedAt: record.published_at,
      },
    ];
  });
}

/**
 * §11's median for one pair: the middle rate among every unexpired record,
 * from any provider, so that "no single provider should become a mandatory
 * dependency".
 *
 * `expiresAt` is the *earliest* expiry among the contributors rather than the
 * latest, because the median stops being the median the moment the first one
 * lapses. Taking the latest would keep quoting a figure assembled partly from
 * records that had already gone stale.
 */
export function lookupRate(
  records: ExchangeRateRecord[],
  base: string,
  quote: string,
  now: number = Date.now(),
): RateLookup {
  const matching = records.filter(
    (record) =>
      record.base.toUpperCase() === base.toUpperCase() &&
      record.quote.toUpperCase() === quote.toUpperCase(),
  );
  if (matching.length === 0) return { kind: "no-data" };

  const current = matching.filter((record) => now < record.expiresAt);
  if (current.length === 0) {
    return {
      kind: "stale",
      lapsedAt: Math.max(...matching.map((record) => record.expiresAt)),
    };
  }

  const sorted = [...current].sort((a, b) => a.rate - b.rate);
  return {
    kind: "current",
    rate: sorted[Math.floor(sorted.length / 2)]!.rate,
    expiresAt: Math.min(...current.map((record) => record.expiresAt)),
    contributors: current.length,
  };
}

/**
 * One pair's rate, asked of the node directly.
 *
 * # This used to be `lookupRate` over every record, and no longer needs to be
 *
 * The module comment above explains why: `getMedianExchangeRate` returns
 * `Option<f64>`, so a pair nobody publishes and a pair whose every feed has
 * lapsed came back as the same `null`. Recovering the distinction meant
 * pulling every oracle record the node holds — some hundreds of them, for
 * one pair — and re-deriving §11's median on this side.
 *
 * `getExchangeRate` is the node making that distinction itself, in the same
 * three states this module already had names for, quoting the same reason
 * back: "a caller ends up treating 'the feed died' as 'this pair isn't
 * supported' and quietly moving on". So a single pair is now a single small
 * answer.
 *
 * Note what it is *not*: it is not one provider's rate. It is the same §11
 * median over every unexpired record, with the reason attached when there
 * is no median to give.
 *
 * {@link fetchExchangeRateRecords} stays, and callers that need more than
 * one pair should keep using it — the pair page derives its sideways links
 * from the same records it reads the rate out of, and asking per pair there
 * would be one call per market.
 */
export async function fetchNodeRate(
  base: string,
  quote: string,
  endpoint: string = DEFAULT_NODE_URL,
): Promise<RateLookup> {
  const view = await rpc<
    | { status: "current"; rate: number; expiresAt: number }
    | { status: "stale" }
    | { status: "noData" }
  >(endpoint, "getExchangeRate", { base, quote });

  if (view.status === "current") {
    return {
      kind: "current",
      rate: view.rate,
      expiresAt: view.expiresAt,
      contributors: null,
    };
  }
  if (view.status === "stale") return { kind: "stale", lapsedAt: null };
  return { kind: "no-data" };
}

/** One pair's rate derived here from every record the node holds. */
export async function fetchRate(
  base: string,
  quote: string,
  endpoint: string = DEFAULT_NODE_URL,
): Promise<RateLookup> {
  return lookupRate(await fetchExchangeRateRecords(endpoint), base, quote);
}

export interface PricedPair {
  base: string;
  quote: string;
  slug: string;
}

/**
 * The pairs an oracle is pricing right now, deduplicated and sorted.
 *
 * Only `current` pairs, because this is what decides which pair pages are
 * linked and listed in the sitemap. A lapsed pair keeps its own page — the
 * page can say the feed has lapsed, which is a real answer — but pointing
 * crawlers and sideways links at it would be advertising a market that
 * cannot currently be quoted.
 */
export function pricedPairs(
  records: ExchangeRateRecord[],
  now: number = Date.now(),
): PricedPair[] {
  const seen = new Map<string, PricedPair>();
  for (const record of records) {
    if (now >= record.expiresAt) continue;
    const base = record.base.toUpperCase();
    const quote = record.quote.toUpperCase();
    const slug = `${base.toLowerCase()}/${quote.toLowerCase()}`;
    if (!seen.has(slug)) seen.set(slug, { base, quote, slug });
  }
  return [...seen.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

/**
 * `pricedPairs` straight from a node, or an empty list if it cannot be
 * reached.
 *
 * Empty rather than thrown, because both callers — the sitemap and the
 * sideways links on a pair page — are better off omitting pairs they cannot
 * confirm than failing the render. A sitemap that lists nothing is a build
 * that says nothing; a sitemap built from a stale hardcoded list is a build
 * that submits markets to a search engine on no evidence, which is the
 * mistake `/providers/[id]` was removed from the sitemap for.
 */
export async function fetchPricedPairs(
  endpoint: string = DEFAULT_NODE_URL,
): Promise<PricedPair[]> {
  try {
    return pricedPairs(await fetchExchangeRateRecords(endpoint));
  } catch {
    return [];
  }
}
