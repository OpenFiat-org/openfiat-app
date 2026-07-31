import {
  Client,
  advertisements,
  type AdvertisementView as ProtocolAd,
} from "@openfiat/sdk";
import { nodeUrl } from "@/lib/node-endpoint";

/**
 * The real advertisement book, read from a node's `getAdvertisements`
 * (OFS-2100).
 *
 * This replaces `lib/data/ads.ts`, which generated a book at module load
 * from a fixed-seed PRNG against a static FX table. That dataset was
 * internally consistent and completely fictional, which is the worst
 * combination: every screen looked healthy whether or not the protocol
 * worked.
 *
 * # A row is narrower than the old mock type, deliberately
 *
 * `lib/types.ts`'s `Advertisement` carries fields the protocol has no
 * concept of — `terms`, `minReputation`, `international`, a display-name
 * `merchantId`. Those existed because a mock can invent anything. A real
 * advertisement (OFS-2100 §6) carries the merchant's PeerId and public
 * key, the pair, the trade bounds, liquidity, payment methods, a pricing
 * model and a status. Nothing else.
 *
 * So this module exposes what is really there rather than padding the
 * shape out with plausible-looking values, following the same decision
 * `live-providers.ts` already made for the Service Registry.
 */
export interface LiveAd {
  id: string;
  /** Merchant PeerId, base58 — the only merchant identity the protocol carries. */
  merchantPeerId: string;
  /** Short form for display; the full id remains available for linking. */
  merchantShort: string;
  /**
   * The mint the escrow will actually move — the token's identity.
   *
   * This was `asset: string`, free text the merchant wrote, and the two are
   * not the same kind of thing. A ticker on a record is a label its author
   * chose, tied to the token being escrowed by nothing: an advertisement
   * could say "USDC" and settle in something else, and every layer would
   * agree the trade completed, because each did what it was asked. A mint
   * address is an identity, so it is what the record carries and what this
   * interface treats as the answer to "which token".
   */
  assetMint: string;
  /**
   * The name the node resolved for `assetMint`, or `null` when this build of
   * the node has no name for it.
   *
   * `null` is an ordinary answer, not an error, and not a reason to guess.
   * The resolution happens on the node, from a table every node compiles in
   * identically — never here. A mint-to-ticker table in this app would put
   * back the merchant-independent labelling the protocol change removed, one
   * layer further out, and would disagree with the node the first time
   * governance allowlists a mint. See `assetLabel`.
   */
  assetSymbol: string | null;
  fiatCurrency: string;
  /** The MERCHANT's direction. A `Sell` ad is what a taker buys from. */
  direction: "Buy" | "Sell";
  /**
   * Fiat per unit of asset, as the node resolved it when it answered.
   *
   * `null` only when the node reports the advertisement as unpriceable —
   * see `unpriceableReason`. A floating advertisement whose oracle read
   * succeeded has a price here like any other, which is the thing this
   * field got wrong for as long as it was derived from `pricing` instead
   * of from the node's `quote`.
   */
  price: number | null;
  /**
   * Why there is no price, when there is none. Three distinct situations
   * that must not be shown with one message: nobody prices this pair
   * (`NoOracleData`), the feed existed and lapsed (`StaleOracleData`), or
   * the merchant's own premium puts the result out of range
   * (`PriceOutOfRange`). Only the middle one is likely to fix itself.
   */
  unpriceableReason:
    "NoOracleData" | "StaleOracleData" | "PriceOutOfRange" | null;
  /**
   * When the oracle mid behind `price` lapses, for a floating quote.
   * `null` for a fixed one, which does not expire.
   *
   * This is what makes a floating price safe to display and unsafe to
   * hold: past it, re-read rather than re-use.
   */
  quoteExpiresAt: number | null;
  /** How the price is set, for a UI that should not present the two as equivalent. */
  pricingKind: "Fixed" | "Floating";
  /** Basis points over the oracle mid; `null` unless `pricingKind` is Floating. */
  premiumBps: number | null;
  /**
   * The smallest and largest trade this advertisement will take,
   * **denominated in the asset** — never in `fiatCurrency`.
   *
   * `availableLiquidity` below is in the asset too. All three come from
   * `Amount`s on the record, and `openfiat-core`'s `Advertisement` says so
   * on the fields themselves (21986fe). It previously said it once, in
   * passing, under `PricingModel::Floating::price_decimals` as the reason
   * that field exists — and two screens in this app read the same record
   * and reached opposite conclusions, one rendering these as fiat and one
   * as the asset. At a KES/USDC rate near 129 a limit of "50" reads as
   * plausible either way, so nothing on screen catches the wrong one:
   * only the contract does. Render them through `assetLabel`/`AssetLabel`,
   * never through `formatFiat`.
   */
  minTrade: number;
  maxTrade: number;
  /** In the asset, like `minTrade`/`maxTrade` above. */
  availableLiquidity: number;
  /**
   * The precision the three amounts above were published at.
   *
   * Carried because editing an advertisement's limits has to publish them
   * at the *same* precision: `Amount` is base units plus decimals, the
   * node refuses a min and max that disagree, and quietly picking a
   * different precision would rescale a merchant's limits by a power of
   * ten with nothing on screen to show it. See `lib/merchant-ads.ts`.
   */
  assetDecimals: number;
  paymentMethods: string[];
  /**
   * `Deleted` is in this union because the node really can return it.
   *
   * `getAdvertisements` maps over `AdvertisementStore::all()` with no filter,
   * and OFS-2100 §21's `Deleted` is a status on the record rather than a
   * removal from it — a withdrawn advertisement stays in every node's replica
   * forever. Leaving it out of the type did not stop it arriving; it only
   * stopped callers from being able to name it, so a deleted advertisement
   * type-checked as `Active | Disabled | Vacation` and any code branching on
   * "is this one still on offer" had to get the answer by exclusion.
   */
  status: "Active" | "Disabled" | "Vacation" | "Deleted";
  createdAt: number;
  updatedAt: number;
}

/**
 * What to call an advertisement's token on screen: the node's name for the
 * mint, or the mint itself when it has none.
 *
 * The fallback is the whole point, so it is one function rather than a `??`
 * repeated at each call site where somebody could quietly substitute a dash,
 * a placeholder, or a guess. A mint this build's node cannot name is an
 * address with no nickname; showing the address is unhelpful and true, which
 * beats helpful and false — and the alternative, a mint-to-ticker table in
 * this repo, is the merchant-independent labelling the protocol just removed,
 * rebuilt one layer out.
 *
 * Callers should put `assetMint` in a `title` even when a symbol came back.
 * The symbol is a nickname the node applied; the address is the fact.
 */
export function assetLabel(
  ad: Pick<LiveAd, "assetMint" | "assetSymbol">,
): string {
  return ad.assetSymbol ?? ad.assetMint;
}

/**
 * Why an advertisement currently has no price, in words a trader can act
 * on.
 *
 * One function rather than a string at each call site, because the three
 * reasons imply different things about whether waiting helps and screens
 * that each invent their own wording drift into saying the same thing about
 * all three. Every one of these used to read "no oracle read yet", which
 * was true of none of them: it described the app's own failure to read the
 * node's quote, not anything about the advertisement.
 */
export function unpriceableLabel(
  reason: NonNullable<LiveAd["unpriceableReason"]>,
): string {
  switch (reason) {
    case "NoOracleData":
      return "No oracle prices this pair";
    case "StaleOracleData":
      // The only one that plausibly resolves on its own.
      return "Oracle feed has lapsed";
    case "PriceOutOfRange":
      // The merchant's own premium, so nothing external will fix it.
      return "Premium puts the price out of range";
  }
}

/** An `Amount` is base units plus a decimal exponent, never a float. */
function toWhole(amount: { base_units: number; decimals: number }): number {
  return amount.base_units / 10 ** amount.decimals;
}

function client(): Client {
  return new Client({ endpoint: nodeUrl(), timeoutMs: 15_000 });
}

/**
 * Exported for `tests/advertisement-quote.test.ts`, which is the only place
 * that can check the quote mapping: the three variants differ only in what
 * the node sends, so nothing short of feeding all three through this
 * function distinguishes a correct mapping from one that always reports
 * "no price".
 */
export function toLiveAd(ad: ProtocolAd): LiveAd {
  const peerId = ad.merchant;
  const pricing = ad.pricing as
    | { Fixed: { price: { base_units: number; decimals: number } } }
    | { Floating: { oracle_provider: string; premium_bps: number } };

  const fixed = "Fixed" in pricing ? pricing.Fixed : null;
  const floating = "Floating" in pricing ? pricing.Floating : null;

  // `pricing` is the merchant's standing instruction; `quote` is what that
  // instruction produced against the oracle reading the node held when it
  // answered. Reading the price out of `pricing` alone means every floating
  // advertisement shows as unpriced even when the node resolved one — which
  // is what this app did until the SDK started typing `quote`.
  const quote = ad.quote;

  return {
    id: ad.id,
    merchantPeerId: peerId,
    // Last 6 base58 characters. A PeerId has no human-readable name in the
    // protocol, and inventing one here is exactly what the mock did.
    merchantShort: peerId.slice(-6),
    assetMint: ad.asset_mint,
    assetSymbol: ad.asset_symbol,
    fiatCurrency: ad.fiat_currency,
    direction: ad.direction as "Buy" | "Sell",
    price: quote.kind === "Unpriceable" ? null : toWhole(quote.price),
    unpriceableReason: quote.kind === "Unpriceable" ? quote.reason : null,
    // Only a floating quote expires. A fixed one moves when the merchant
    // signs a new price and not before, so giving it an expiry would invite
    // a caller to re-read something that cannot have changed.
    quoteExpiresAt: quote.kind === "Floating" ? quote.mid_expires_at : null,
    pricingKind: fixed ? "Fixed" : "Floating",
    // From the quote when there is one, since an unpriceable quote still
    // carries the premium so the ad's terms stay displayable.
    premiumBps:
      quote.kind === "Floating" || quote.kind === "Unpriceable"
        ? quote.premium_bps
        : floating
          ? floating.premium_bps
          : null,
    minTrade: toWhole(ad.min_trade),
    maxTrade: toWhole(ad.max_trade),
    availableLiquidity: toWhole(ad.available_liquidity),
    assetDecimals: ad.min_trade.decimals,
    paymentMethods: ad.payment_methods,
    status: ad.status as LiveAd["status"],
    createdAt: ad.created_at,
    updatedAt: ad.updated_at,
  };
}

/**
 * Every advertisement the queried node currently knows about.
 *
 * `getAdvertisements` answers with one page plus a cursor, because a
 * response returning every advertisement on the network cannot survive real
 * volume. This walks to the end rather than stopping at the first page: a
 * book silently truncated at whatever the node's page size happens to be is
 * a market with rows missing and nothing on screen to say so.
 *
 * The SDK's `eachAdvertisement` owns the walk, so the cursor is passed back
 * exactly as received. Deriving a resume point here would mean
 * reimplementing the node's ordering, and two orderings that disagree hand
 * some rows over twice and others never.
 *
 * `MAX_PAGES` bounds it. A node that keeps handing back a cursor forever
 * would otherwise hang the page rendering into it.
 */
const MAX_PAGES = 50;
const PAGE_SIZE = 100;

export async function fetchAdvertisements(
  filter: { status?: LiveAd["status"] } = {},
): Promise<LiveAd[]> {
  const rows: LiveAd[] = [];
  for await (const ad of advertisements.eachAdvertisement(client(), {
    filter,
    page: { limit: PAGE_SIZE },
  })) {
    rows.push(toLiveAd(ad));
    if (rows.length >= MAX_PAGES * PAGE_SIZE) break;
  }
  return rows;
}

/** One advertisement, or `null` if this node has never seen that id. */
export async function fetchAdvertisement(id: string): Promise<LiveAd | null> {
  const ad = await advertisements.getAdvertisement(client(), id);
  return ad ? toLiveAd(ad) : null;
}

/**
 * The book a taker sees for one pair and one side.
 *
 * `side` is the TAKER's intent, which is the opposite of the merchant's:
 * someone buying USDC is looking at merchants advertising `Sell`. Getting
 * this inversion wrong silently shows the wrong half of the market, so it
 * is done once, here, rather than at each call site.
 *
 * Sorted best-price-first from the taker's perspective — cheapest when
 * buying, highest when selling. Floating-price ads sort last because their
 * price is not known without an oracle read; showing them interleaved at an
 * arbitrary position would misrepresent the ordering as authoritative.
 *
 * `symbol` is a ticker because that is what a market is asked for — "the
 * USDC/KES book" — and it is matched against the name the NODE resolved,
 * never against a ticker this app mapped to a mint. So the question this
 * answers is precisely "advertisements whose mint the node calls USDC", and
 * an advertisement naming a mint nothing has a name for belongs to no ticker
 * market at all. That is not a gap to paper over: nothing names it, so
 * nothing can ask for it by name.
 */
export async function fetchBook(
  symbol: string,
  fiatCurrency: string,
  side: "buy" | "sell",
): Promise<LiveAd[]> {
  const merchantDirection = side === "buy" ? "Sell" : "Buy";
  const all = await fetchAdvertisements();
  const matching = all.filter(
    (ad) =>
      ad.status === "Active" &&
      ad.assetSymbol === symbol &&
      ad.fiatCurrency === fiatCurrency &&
      ad.direction === merchantDirection,
  );
  return matching.sort((a, b) => {
    if (a.price === null && b.price === null) return 0;
    if (a.price === null) return 1;
    if (b.price === null) return -1;
    return side === "buy" ? a.price - b.price : b.price - a.price;
  });
}

/**
 * Every token/currency pair with at least one active ad.
 *
 * `asset` is whatever the token is called on screen — the node's symbol, or
 * the mint itself for one it cannot name (`assetLabel`). Both are included:
 * a market is no less real for being denominated in a mint nobody has
 * nicknamed, and dropping those pairs would make the list quietly disagree
 * with the book it was derived from.
 */
export async function fetchTradablePairs(): Promise<
  { asset: string; fiatCurrency: string }[]
> {
  const all = await fetchAdvertisements();
  const seen = new Set<string>();
  const pairs: { asset: string; fiatCurrency: string }[] = [];
  for (const ad of all) {
    if (ad.status !== "Active") continue;
    const label = assetLabel(ad);
    const key = `${label}/${ad.fiatCurrency}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ asset: label, fiatCurrency: ad.fiatCurrency });
  }
  return pairs;
}

/**
 * The ads belonging to one merchant, keyed by their PeerId hex.
 *
 * The merchant console needs this, and it is the honest version of what the
 * mock console did: it read a `MY_ADS` constant, so it showed the same rows
 * to everyone including a visitor with no wallet connected at all.
 */
/**
 * Every advertisement this wallet has published, whatever state it is in.
 *
 * Four queries, because `getAdvertisements` filters to `Active` by
 * default and its `status` filter takes one value. That default is right
 * for the order book — an advertisement that is paused is not on offer,
 * and listing it would be offering something that is not — and wrong for
 * the merchant's own console, where it meant a paused advertisement
 * vanished from the only screen that could put it back. The merchant
 * could pause an ad and then had no way to reach it again.
 *
 * The merchant filter is still applied here rather than by the node,
 * which is a real limit: this reads the whole book to find one wallet's
 * rows. It is fine for a devnet and is not fine for a market, and the fix
 * is a `merchant` filter on `AdvertisementFilter` rather than anything
 * this file can do.
 */
export async function fetchAdsByMerchant(merchantPeerId: string): Promise<LiveAd[]> {
  const statuses: LiveAd["status"][] = ["Active", "Vacation", "Disabled", "Deleted"];
  const pages = await Promise.all(statuses.map((status) => fetchAdvertisements({ status })));
  return pages.flat().filter((ad) => ad.merchantPeerId === merchantPeerId);
}
