import { cache } from "react";
import type { ReferenceData } from "@openfiat/sdk";

import { DEFAULT_NODE_URL } from "@/lib/node-endpoint";
import { nodeRpc } from "@/lib/node-rpc";

/**
 * Asset/fiat pairs that get their own landing page — /usdt/kes, /usdc/ngn.
 *
 * People search "convert USDT to KES", not "peer-to-peer exchange", and a
 * page titled for the query is the only thing that answers it.
 *
 * # This module used to decide which pairs exist. It cannot.
 *
 * `PAIRS` was a constant, built at module load by crossing a `MARKETS`
 * fixture with `ORACLE_MID` — a hand-written table of fifteen rates — and
 * keeping the combinations that had entries in a PRNG-generated
 * advertisement book. Every pair page's headline number came from that table,
 * as did the converter beneath it, the `<meta name="description">`, and the
 * rate printed on the OpenGraph card that went out with every shared link. It
 * was fifteen invented exchange rates published as this network's prices.
 *
 * The live equivalent is one call away and now answers for these pairs, so
 * the table is deleted rather than annotated. Which pairs are priced is a
 * question only an oracle can answer, and the answer changes: devnet feeds
 * carry a three-hour expiry, so a set fixed at build time would be wrong
 * within a working day. See `lib/live-oracle.ts`.
 *
 * # Nor which *assets* exist, which took a second pass to see
 *
 * The rates went, and a `PAIR_ASSETS` constant stayed behind:
 * `["USDT", "USDC", "USD1", "SOL"]`, four tickers this app had decided were
 * the tradeable ones. It was wrong in both directions against the only thing
 * entitled to name a token — the node, which resolves each advertisement's
 * `asset_mint` through `openfiat_chain::symbol_for_mint`:
 *
 * - `SOL` named nothing. The node calls that mint **wSOL**, and the book is
 *   filtered on the symbol the node returned, so `"WSOL" !== "SOL"` meant
 *   /sol/kes could never match an advertisement. Not "empty for now" —
 *   structurally incapable of ever having one.
 * - `USD1` named nothing at all: no mint on this deployment is called that.
 *   The page rendered a USD1 coin mark anyway, which is art asserting a
 *   token that does not exist here.
 * - `wSOL` and `tUSDC` — names the node genuinely answers, tUSDC being the
 *   Token-2022 mint the running devnet deployment denominates its fee
 *   treasuries in — 404'd.
 *
 * Correcting those four strings by hand would have rebuilt the same fault
 * one release later. The settlement-mint allowlist is on chain and
 * governance-updatable, so any list here is a snapshot of somebody else's
 * table and starts going stale the moment governance touches it. So the app
 * stops holding one: which tickers name a mint is asked of the node, through
 * `getReferenceData`.
 *
 * What is left as a constant here is the part that genuinely is static —
 * which countries use a currency. That is a fact about the world, not a
 * claim about this network.
 */

export interface PairSlug {
  /**
   * The ticker, spelled the way the node spells it — `USDC`, `wSOL`.
   *
   * Not the URL segment uppercased. The node's own spelling is what the
   * book carries in `assetSymbol`, so keeping it lets the pair page match
   * advertisements by equality instead of by case-folding, and lets the
   * heading say "wSOL" rather than shouting a name nothing uses.
   */
  asset: string;
  currency: string;
  slug: string;
}

/**
 * A cheap offline reject for URLs that cannot be a pair in any deployment.
 *
 * `/[asset]/[currency]` sits at the site root, so it sees every two-segment
 * URL there is and would happily render "Convert GUIDE to SEL" for a
 * mistyped `/guide/sell`. This runs before the node is asked, so obvious
 * junk costs no round trip — and it is the only gate left standing when the
 * node cannot be reached at all.
 *
 * Deliberately generous on length and character class: it is a shape check,
 * not a membership check, and the membership answer belongs to the node.
 */
function looksLikeAPair(asset: string, currency: string): boolean {
  return /^[A-Z0-9]{2,10}$/.test(asset) && /^[A-Z]{3,4}$/.test(currency);
}

/**
 * `getReferenceData`, over a plain JSON-RPC POST.
 *
 * Not `@openfiat/sdk`'s `reference.getReferenceData`: the package published
 * `types` pointing at `src` and `import` pointing at a `dist` built before
 * that namespace existed, so the call type-checked and threw a `TypeError`
 * at runtime. The `dist` has caught up since, and collapsing this onto that
 * one call together with `lib/live-vaults.ts`'s `fetchMintNames` remains the
 * right end state; the envelope handling is at least shared now.
 *
 * The *type* is imported from the SDK regardless. A type-only import is
 * erased at compile time, so it cannot depend on a runtime export that is
 * missing — and taking the shape from the SDK rather than restating it here
 * is what keeps this from becoming another copy of somebody else's table.
 * `Partial` because a node built before the mint table simply omits it.
 */
function fetchReferenceData(endpoint: string): Promise<Partial<ReferenceData>> {
  return nodeRpc<Partial<ReferenceData>>(endpoint, "getReferenceData");
}

/**
 * The tickers this deployment's node has a mint for, or `null` when it could
 * not be asked.
 *
 * `null` and `[]` are different answers and callers must keep them apart.
 * `[]` is the node saying it names no mints; `null` is silence — an
 * unreachable node, or one built before it published the table. Only the
 * first is evidence about a ticker, and the two send an interface in
 * different directions: nothing to name, versus nothing to go on.
 *
 * Takes an explicit endpoint because its callers do not agree on one and
 * must not. The pair route renders on the server against `DEFAULT_NODE_URL`;
 * `components/p2p/exchange.tsx` runs in the browser and reads the node the
 * *user* selected, and it has to ask that node — the one whose book it is
 * about to show — or the asset pills and the advertisements under them come
 * from two different tables.
 */
export async function fetchNamedAssets(
  endpoint: string = DEFAULT_NODE_URL,
): Promise<string[] | null> {
  try {
    const { mints } = await fetchReferenceData(endpoint);
    // Absent, rather than empty, on a node built before the mint table was
    // published. Absent is silence — see the `null` contract above.
    if (!Array.isArray(mints)) return null;
    // A mint with no symbol is an ordinary answer on the node's side — an
    // address with no nickname — and it names no ticker, so it is dropped
    // here rather than turned into a blank one.
    return mints.map((entry) => entry?.symbol).filter((symbol): symbol is string => !!symbol);
  } catch {
    return null;
  }
}

/**
 * `fetchNamedAssets`, memoised for one server render.
 *
 * `generateMetadata` and the page body are separate calls into this module
 * for a single page view, and `cache()` collapses them into one request
 * without letting the answer outlive it. Server-side only, which is why it
 * is not the exported form: `components/p2p/exchange.tsx` is a client
 * component, and a request-scoped cache means nothing in a browser that
 * fetches once per mount anyway.
 */
const namedAssetsForRender = cache(fetchNamedAssets);

/**
 * `("wsol", "kes")` to a canonical pair, or `null` if the URL is not one.
 *
 * The asset is resolved against the node's mint table case-insensitively and
 * comes back in the node's spelling; the currency is checked only for shape.
 * That asymmetry is smaller than it looks — neither set belongs to this app.
 * Currencies are whatever an oracle chooses to publish, and validating those
 * against a table here would 404 a pair the network genuinely prices the
 * moment somebody adds a corridor this app has not heard of. The same
 * sentence is true of mints once governance allowlists one, which is exactly
 * why the asset side stopped being a constant.
 *
 * A node that cannot be reached yields a pair rather than a 404. A 404 is
 * this app stating "there is no such asset", and it has no grounds to state
 * that on silence — it can only say it when it got an answer and the ticker
 * was not in it. Failing the other way would 404 every legitimate pair page
 * for the duration of an outage, which is the one thing these pages exist
 * not to do.
 */
export async function normalisePair(
  asset: string,
  currency: string,
  endpoint: string = DEFAULT_NODE_URL,
): Promise<PairSlug | null> {
  const upperAsset = asset.toUpperCase();
  const upperCurrency = currency.toUpperCase();
  if (!looksLikeAPair(upperAsset, upperCurrency)) return null;

  const named = await namedAssetsForRender(endpoint);
  // Silence: keep the caller's spelling, uppercased, since there is no
  // authoritative one to adopt.
  const resolved =
    named === null
      ? upperAsset
      : named.find((symbol) => symbol.toUpperCase() === upperAsset);
  if (resolved === undefined) return null;

  return {
    asset: resolved,
    currency: upperCurrency,
    slug: `${upperAsset.toLowerCase()}/${upperCurrency.toLowerCase()}`,
  };
}

/**
 * Countries where this is the primary currency, as the node lists them.
 *
 * This used to filter a 253-row table compiled into this app, under a
 * comment calling it "a fact about the world, not a claim about this
 * network". The distinction was real and the conclusion was not: the node
 * publishes the same fact, one build of this app disagreeing with it helps
 * nobody, and `lib/data/countries.ts` is gone.
 *
 * An empty list when the node cannot be reached, and the pair page renders
 * nothing rather than a wrong list — the sentence it feeds is a nicety, not
 * a number anybody trades on.
 */
export async function countriesUsing(
  currency: string,
  endpoint: string = DEFAULT_NODE_URL,
): Promise<string[]> {
  try {
    const { countries } = await namedReferenceForRender(endpoint);
    return (countries ?? [])
      .filter((country) => country.currency === currency)
      .map((country) => country.name);
  } catch {
    return [];
  }
}

/** `fetchReferenceData`, memoised for one server render — see `namedAssetsForRender`. */
const namedReferenceForRender = cache(fetchReferenceData);
