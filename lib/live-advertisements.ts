import { Client, advertisements, type AdvertisementView as ProtocolAd } from "@openfiat/sdk";
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
  /** Merchant PeerId, hex — the only merchant identity the protocol carries. */
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
  /** Fiat per unit of asset. `null` for a floating price with no oracle read yet. */
  price: number | null;
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
export function assetLabel(ad: Pick<LiveAd, "assetMint" | "assetSymbol">): string {
  return ad.assetSymbol ?? ad.assetMint;
}

/** An `Amount` is base units plus a decimal exponent, never a float. */
function toWhole(amount: { base_units: number; decimals: number }): number {
  return amount.base_units / 10 ** amount.decimals;
}

function toHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function client(): Client {
  return new Client({ endpoint: nodeUrl(), timeoutMs: 15_000 });
}

function toLiveAd(ad: ProtocolAd): LiveAd {
  const peerId = toHex(ad.merchant as unknown as number[]);
  const pricing = ad.pricing as
    | { Fixed: { price: { base_units: number; decimals: number } } }
    | { Floating: { oracle_provider: string; premium_bps: number } };

  const fixed = "Fixed" in pricing ? pricing.Fixed : null;
  const floating = "Floating" in pricing ? pricing.Floating : null;

  return {
    id: ad.id,
    merchantPeerId: peerId,
    // Last 6 hex characters. A PeerId has no human-readable name in the
    // protocol, and inventing one here is exactly what the mock did.
    merchantShort: peerId.slice(-6),
    assetMint: ad.asset_mint,
    assetSymbol: ad.asset_symbol,
    fiatCurrency: ad.fiat_currency,
    direction: ad.direction as "Buy" | "Sell",
    price: fixed ? toWhole(fixed.price) : null,
    pricingKind: fixed ? "Fixed" : "Floating",
    premiumBps: floating ? floating.premium_bps : null,
    minTrade: toWhole(ad.min_trade),
    maxTrade: toWhole(ad.max_trade),
    availableLiquidity: toWhole(ad.available_liquidity),
    paymentMethods: ad.payment_methods,
    status: ad.status as LiveAd["status"],
    createdAt: ad.created_at,
    updatedAt: ad.updated_at,
  };
}

/**
 * One page of `getAdvertisements`, as a node running the paged method
 * answers it. Older nodes answer with a bare array instead.
 */
interface AdvertisementsPage {
  advertisements: ProtocolAd[];
  /** Hand straight back as `page.after`. `null` was the last page. */
  next_cursor: string | null;
}

/**
 * Every advertisement the queried node currently knows about.
 *
 * # Two response shapes, and every page of the newer one
 *
 * `getAdvertisements` used to answer with the whole book as a bare array.
 * It now answers with one page plus a cursor, because a response that
 * returns every advertisement on the network cannot survive real volume.
 * The SDK this app is pinned to predates that change and types the result
 * as an array, so against a current node `.map` was being called on a page
 * object and every screen that reads the book — the exchange, the
 * merchants directory, the ad console — failed with a type error dressed
 * up as "could not reach a node".
 *
 * So the call goes through `client.call` and accepts either shape. The
 * cursor is followed to the end rather than stopping at the first page: a
 * book silently truncated at whatever the node's page size happens to be
 * is a market with rows missing and nothing on screen to say so, which is
 * worse than the error it replaces. The cursor is passed back exactly as
 * received — deriving a resume point here would mean reimplementing the
 * node's ordering, and two orderings that disagree skip rows.
 *
 * `MAX_PAGES` bounds the walk. A node that keeps handing back a cursor
 * forever would otherwise hang the page it is rendering into.
 */
const MAX_PAGES = 50;

export async function fetchAdvertisements(): Promise<LiveAd[]> {
  const c = client();
  const rows: ProtocolAd[] = [];
  let after: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const answer: ProtocolAd[] | AdvertisementsPage = await c.call<
      { page?: { after: string } },
      ProtocolAd[] | AdvertisementsPage
    >("getAdvertisements", after === null ? {} : { page: { after } });

    if (Array.isArray(answer)) return answer.map(toLiveAd);
    rows.push(...answer.advertisements);
    after = answer.next_cursor;
    if (after === null || after === undefined) break;
  }

  return rows.map(toLiveAd);
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
export async function fetchTradablePairs(): Promise<{ asset: string; fiatCurrency: string }[]> {
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
export async function fetchAdsByMerchant(merchantPeerIdHex: string): Promise<LiveAd[]> {
  const all = await fetchAdvertisements();
  return all.filter((ad) => ad.merchantPeerId === merchantPeerIdHex);
}
