import { fetchAdvertisements, type LiveAd } from "@/lib/live-advertisements";

/**
 * The set of wallets this app is willing to call merchants, and what it can
 * honestly say about each one.
 *
 * # What makes a wallet a merchant here
 *
 * **A wallet is a merchant if it has published an advertisement that has not
 * been deleted.** That is the whole rule, and it is deliberate rather than
 * whatever the easiest query happened to return.
 *
 * There is no merchant record anywhere in this protocol — no registration, no
 * profile, no roster to read. `crates/identity` has a `MerchantName` claim, but
 * it is a self-published string with nothing behind it, and the only way to
 * read claims is `getIdentityClaimsByWallet`, which needs a wallet you already
 * know. It cannot enumerate anybody, so it cannot found a directory. Whichever
 * definition is chosen, the *list* has to come from somewhere else.
 *
 * Two things a node will enumerate could plausibly define the set:
 *
 *  1. `getAdvertisements` — every wallet that has offered a trade.
 *  2. `getSettlements` — every wallet that has been the seller in one.
 *
 * (2) is arguably the truer definition of "merchant": someone who has actually
 * traded, not merely someone who has posted an offer. It was rejected anyway,
 * and the reason matters more than the choice. `getSettlements` returned every
 * settlement on the network with both parties' PeerIds in it, so building a
 * directory on it meant reconstructing the buyer-seller graph client-side and
 * putting it on a public page. `lib/counterparties.ts` explains why this
 * protocol gates exactly that: an enumerable "who trades with whom, how often"
 * map exposes which merchant a wallet always returns to and who a high-volume
 * merchant's regulars are, which in a P2P fiat market is a physical-safety
 * problem rather than a privacy nicety. `getCounterparties` demands a signature
 * from the wallet being asked about and refuses to answer for anyone else, and
 * that `getSettlements` answered the same question unauthenticated was a hole
 * in the node rather than a licence to build a product surface on top of it.
 *
 * The node has since closed it: `getSettlements` is redacted and names neither
 * party, so (2) is not merely a bad idea now but unavailable. That changes
 * nothing here. This module never depended on the hole, and the reasoning
 * above is why the directory was not built on settlements while it was still
 * open — which is the only reason worth having, since a definition chosen
 * because a leak happened to be convenient would have had to be rewritten the
 * day it was plugged.
 *
 * (1) leaks nothing: an advertisement is a public offer, published precisely so
 * that strangers can find it, and the merchant's PeerId is already on every row
 * of the order book.
 *
 * # The churn this definition causes, and why it is not papered over
 *
 * A directory defined by advertisements only holds wallets that are currently
 * offering something. A merchant who withdraws every advertisement disappears
 * from it, however long their history. This is a real cost and the honest
 * response is to be accurate about what the page is rather than to widen the
 * definition until the list stops moving.
 *
 * Two things soften it without inventing anything. Advertisements do not
 * expire — OFS-2100 has no expiry field, only the merchant's own `Disabled`,
 * `Vacation` and `Deleted` transitions — so nobody falls off this list through
 * inattention, only by acting. And `Disabled` and `Vacation` advertisements are
 * kept: §16 makes `Vacation` a merchant-initiated pause and deliberately
 * distinct from `Disabled` ("something's wrong", §18), and a merchant on
 * holiday is still a merchant. Only `Deleted` — §21's permanent removal —
 * drops a wallet, because after it there is nothing left in reach of this app
 * that says the wallet was ever a merchant at all.
 *
 * # What a row does not carry
 *
 * Everything below is computed from advertisement fields. There is no rating,
 * no trust or verification badge, and no trade count on a row, because none of
 * those can be had from an advertisement:
 *
 *  - **Ratings and reviews do not exist in this protocol.** No crate defines a
 *    rating event, a review, or a star. OFS-3000 §26 requires that only
 *    cryptographically verified protocol events move reputation, which is why
 *    `crates/reputation` has no event type of its own and computes everything
 *    from settlement, dispute and reservation state.
 *  - **Verification badges would be a lie by construction.** A claim's
 *    `verification_status` is set by whoever published it, and
 *    `crates/identity`'s own module doc records that OTP delivery is not
 *    implemented — no node checks anything. A tick next to a name would report
 *    a check nobody performed.
 *  - **Tiers are not on the wire.** `ReputationProfile::tier()` exists but is a
 *    method, not a field, so `getReputation` never serializes it; the crate
 *    also marks its thresholds as placeholder defaults pending governance. A
 *    ladder rung called "Verified" or "Elite" beside a wallet would be this
 *    app's invention twice over.
 *
 * Trade counts, completion rate, disputes and response timings *are* real —
 * `crates/reputation` computes all of them — but they come from `getReputation`,
 * one call per wallet. Putting them in the table would mean one request per
 * merchant on every page load, so a directory would get slower exactly as the
 * network succeeded. They are read when a row is opened instead; see
 * `components/merchants/merchants-directory.tsx`.
 */

/** How a merchant's advertisements describe their current availability. */
export type MerchantOffering = "Advertising" | "On vacation" | "Disabled";

export interface MerchantRow {
  /**
   * The merchant's PeerId as lowercase hex — the only identity the protocol
   * carries for them, and the seed the placeholder avatar is drawn from. Two
   * spellings of one key draw two robots, so this stays in the single encoding
   * `lib/live-advertisements.ts` already produces.
   */
  peerId: string;
  /** Last six hex characters, which is what the order book shows. */
  short: string;
  /** Their advertisements, deleted ones excluded, newest change first. */
  ads: LiveAd[];
  activeAds: number;
  vacationAds: number;
  disabledAds: number;
  offering: MerchantOffering;
  /** `ASSET/FIAT` for every pair they advertise, sorted. */
  pairs: string[];
  /** Every payment method named across their advertisements, sorted. */
  paymentMethods: string[];
  /** Their earliest advertisement's `created_at`. */
  firstAdvertisedAt: number;
  /** The most recent change to any of their advertisements. */
  lastUpdatedAt: number;
}

/**
 * Whether one advertisement makes its publisher a merchant.
 *
 * Split out and exported because it is the entire definition this page rests
 * on: if it moves, the directory silently starts describing a different set of
 * people, and that should be something a test notices rather than something a
 * reader discovers.
 */
export function countsAsMerchantAd(ad: LiveAd): boolean {
  return ad.status !== "Deleted";
}

/**
 * `Active` wins over any number of paused or broken advertisements: a merchant
 * with one live offer is open for business whatever else they have parked.
 * `Vacation` beats `Disabled` for the same reason in reverse — a deliberate
 * pause is a better description of a wallet than a fault is, and §18's
 * `Disabled` covers "liquidity hit zero" as well as "manually disabled", so it
 * is the least informative of the three.
 */
function offeringFrom(ads: LiveAd[]): MerchantOffering {
  if (ads.some((ad) => ad.status === "Active")) return "Advertising";
  if (ads.some((ad) => ad.status === "Vacation")) return "On vacation";
  return "Disabled";
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

/**
 * Groups a book into one row per merchant.
 *
 * Pure, and takes the advertisements rather than fetching them, so the
 * grouping rules can be tested without a node and so a caller that already
 * holds the book does not read it twice.
 *
 * Ordered merchants-with-live-offers first, then by most recent advertisement
 * change, then by PeerId. The last tiebreak is what makes the order total:
 * without it two merchants whose advertisements share a timestamp could swap
 * places between renders for no reason a reader could see.
 */
export function merchantsFrom(ads: LiveAd[]): MerchantRow[] {
  const byMerchant = new Map<string, LiveAd[]>();
  for (const ad of ads) {
    if (!countsAsMerchantAd(ad)) continue;
    const existing = byMerchant.get(ad.merchantPeerId);
    if (existing) existing.push(ad);
    else byMerchant.set(ad.merchantPeerId, [ad]);
  }

  const rows: MerchantRow[] = [];
  for (const [peerId, merchantAds] of byMerchant) {
    const sorted = [...merchantAds].sort((a, b) => b.updatedAt - a.updatedAt);
    rows.push({
      peerId,
      short: peerId.slice(-6),
      ads: sorted,
      activeAds: sorted.filter((ad) => ad.status === "Active").length,
      vacationAds: sorted.filter((ad) => ad.status === "Vacation").length,
      disabledAds: sorted.filter((ad) => ad.status === "Disabled").length,
      offering: offeringFrom(sorted),
      pairs: unique(sorted.map((ad) => `${ad.asset}/${ad.fiatCurrency}`)),
      paymentMethods: unique(sorted.flatMap((ad) => ad.paymentMethods)),
      firstAdvertisedAt: Math.min(...sorted.map((ad) => ad.createdAt)),
      lastUpdatedAt: Math.max(...sorted.map((ad) => ad.updatedAt)),
    });
  }

  const rank: Record<MerchantOffering, number> = {
    Advertising: 0,
    "On vacation": 1,
    Disabled: 2,
  };
  return rows.sort(
    (a, b) =>
      rank[a.offering] - rank[b.offering] ||
      b.lastUpdatedAt - a.lastUpdatedAt ||
      a.peerId.localeCompare(b.peerId),
  );
}

/** Every merchant the selected node knows of, from one read of the book. */
export async function fetchMerchants(): Promise<MerchantRow[]> {
  return merchantsFrom(await fetchAdvertisements());
}
