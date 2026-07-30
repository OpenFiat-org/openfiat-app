import { Client, advertisements, type Advertisement as ProtocolAd } from "@openfiat/sdk";
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
  asset: string;
  fiatCurrency: string;
  /** The MERCHANT's direction. A `Sell` ad is what a taker buys from. */
  direction: "Buy" | "Sell";
  /** Fiat per unit of asset. `null` for a floating price with no oracle read yet. */
  price: number | null;
  /** How the price is set, for a UI that should not present the two as equivalent. */
  pricingKind: "Fixed" | "Floating";
  /** Basis points over the oracle mid; `null` unless `pricingKind` is Floating. */
  premiumBps: number | null;
  minTrade: number;
  maxTrade: number;
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
    asset: ad.asset,
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

/** Every advertisement the queried node currently knows about. */
export async function fetchAdvertisements(): Promise<LiveAd[]> {
  const ads = await advertisements.getAdvertisements(client());
  return ads.map(toLiveAd);
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
 */
export async function fetchBook(
  asset: string,
  fiatCurrency: string,
  side: "buy" | "sell",
): Promise<LiveAd[]> {
  const merchantDirection = side === "buy" ? "Sell" : "Buy";
  const all = await fetchAdvertisements();
  const matching = all.filter(
    (ad) =>
      ad.status === "Active" &&
      ad.asset === asset &&
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

/** Every `asset`/`fiatCurrency` pair with at least one active ad. */
export async function fetchTradablePairs(): Promise<{ asset: string; fiatCurrency: string }[]> {
  const all = await fetchAdvertisements();
  const seen = new Set<string>();
  const pairs: { asset: string; fiatCurrency: string }[] = [];
  for (const ad of all) {
    if (ad.status !== "Active") continue;
    const key = `${ad.asset}/${ad.fiatCurrency}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ asset: ad.asset, fiatCurrency: ad.fiatCurrency });
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
