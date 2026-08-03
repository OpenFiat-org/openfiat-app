import { Client } from "@openfiat/sdk";
import { nodeUrl } from "@/lib/node-endpoint";
import type { SolanaProvider } from "@/lib/wallet-connection";
import { cachedRead, signedRead, type GatedSurface } from "@/lib/wallet-proof";
import { peerIdParam } from "@/lib/wallet-param";

/**
 * What people who actually traded with a wallet said about it, read from
 * the node's `getReviews`.
 *
 * # What this replaced
 *
 * `lib/data/reviews.ts`: eight paragraphs of invented testimony about two
 * invented merchants, complete with invented complaints — the file argued
 * that negative reviews made the fixture more honest, which had it exactly
 * backwards. Prose attributed to a stranger is the one thing on a merchant
 * profile a reader cannot sanity-check against anything else, so inventing
 * it is the most convincing lie the page could tell.
 *
 * # A review is opinion, and the node keeps it apart from the record
 *
 * `getReviews` is deliberately not folded into `getReputation`, and the two
 * must not be merged here either. Reputation is recomputed by every node
 * from signed settlement and dispute events and cannot be talked up or
 * down; a review is one counterparty's words. Show both, say which is
 * which.
 *
 * # What a public review does not carry, and why
 *
 * No author and no settlement id. Both parties may review the same trade,
 * so publishing the settlement id would pair two reviews and rebuild the
 * trade graph that `getCounterparties` demands a signature to see at all —
 * the author's identity would do it directly. The timestamp is truncated to
 * midnight UTC for the same reason: two reviews published in the same minute
 * correlate their subjects, and a day does not.
 *
 * So a row here says "somebody who really traded with this wallet wrote
 * this", and nothing more. Rendering it as though it named a person would
 * put back what the node took out.
 */

/**
 * Wire shape of `PublicReview`. Snake-case, and a `Rating` is a **number**.
 *
 * It was typed here as one of five English words, which is what the Rust
 * enum's variants are called and is not what crosses the wire: `Rating`
 * carries a hand-written `serialize_u8`, and `openfiat-reviews`' own test
 * `a_rating_crosses_the_wire_as_a_plain_integer` pins it, on the stated
 * grounds that "an SDK in another language sends the number a user
 * clicked". So every row arriving from a real node failed the word lookup
 * below and was dropped as off-scale — every merchant profile in this app
 * reported "no reviews of this wallet on this node" no matter how many
 * there were, and the drop-the-unknown-rating rule (right in itself) is
 * what made it silent. Confirmed against a live node by publishing one and
 * reading it back.
 */
interface RawReview {
  about: string;
  rating: number;
  comment: string;
  created_on: number;
}

export interface LiveReview {
  /** Whom the review is about, as a base58 PeerId. */
  about: string;
  /** 1 to 5, exactly as the wire carries it. */
  stars: number;
  comment: string;
  /** Midnight UTC of the day it was written — never the exact moment. */
  createdOn: number;
}

/**
 * The scale the protocol defines, and the only one this app will render.
 *
 * `Rating::from_stars` is the enum's only constructor and refuses anything
 * outside it, so a node cannot store a 6 — but a caller can still be handed
 * one by something that is not the node it thinks it is, and coercing it
 * would put an invented score under somebody's name.
 */
export function isRating(stars: unknown): stars is number {
  return typeof stars === "number" && Number.isInteger(stars) && stars >= 1 && stars <= 5;
}

/**
 * Exported so the mapping can be tested without a node.
 *
 * A rating off the protocol's scale is dropped rather than coerced — see
 * {@link isRating}.
 */
export function toLiveReviews(raw: RawReview[]): LiveReview[] {
  const rows: LiveReview[] = [];
  for (const review of raw) {
    if (!isRating(review.rating)) continue;
    rows.push({
      about: review.about,
      stars: review.rating,
      comment: review.comment,
      createdOn: review.created_on,
    });
  }
  return rows;
}

/**
 * Every review of one wallet this node holds, newest first.
 *
 * "This node holds" is the honest bound and worth saying on screen: reviews
 * are gossiped, so a node that has replicated less of the network reports
 * fewer of them. An empty answer means this node has seen none — never that
 * nobody has written one.
 */
export async function fetchReviews(peerId: string): Promise<LiveReview[]> {
  const client = new Client({ endpoint: nodeUrl(), timeoutMs: 8_000 });
  const raw = await client.call<{ wallet: string }, RawReview[]>("getReviews", {
    wallet: peerIdParam(peerId),
  });
  return toLiveReviews(raw ?? []).sort((a, b) => b.createdOn - a.createdOn);
}

/** Mean stars, or `null` when nobody has reviewed this wallet. */
export function meanStars(reviews: LiveReview[]): number | null {
  if (reviews.length === 0) return null;
  return reviews.reduce((sum, r) => sum + r.stars, 0) / reviews.length;
}

/**
 * A review as one of its two parties reads it — `PublishedReview`, whole.
 *
 * Everything the public shape drops is here: who wrote it, which trade it
 * is about, and the moment rather than the day. Nothing is disclosed to a
 * party they were not present for, which is why this read exists at all
 * and why it is the *only* place "have I reviewed this trade yet" can be
 * answered. The public feed cannot answer it — it carries no settlement id
 * on purpose, so matching a public row to one of your own trades is
 * exactly the correlation the redaction exists to prevent.
 */
export interface MyReview {
  /** `<settlement>:<author>` — derived by the node, never chosen. */
  id: string;
  settlement: string;
  /** Base58 PeerId of whoever wrote it. */
  author: string;
  /** Base58 PeerId of whoever it is about, read out of the settlement. */
  about: string;
  stars: number;
  comment: string;
  createdAt: number;
}

interface RawMyReview {
  id: string;
  settlement: string;
  author: string;
  about: string;
  rating: number;
  comment: string;
  created_at: number;
}

/** Exported for the same reason {@link toLiveReviews} is. */
export function toMyReviews(raw: RawMyReview[]): MyReview[] {
  const rows: MyReview[] = [];
  for (const review of raw) {
    if (!isRating(review.rating)) continue;
    rows.push({
      id: review.id,
      settlement: review.settlement,
      author: review.author,
      about: review.about,
      stars: review.rating,
      comment: review.comment,
      createdAt: review.created_at,
    });
  }
  return rows;
}

/** The copy for this surface's half of the handshake. */
export const MY_REVIEWS: GatedSurface = {
  challenge: "getWalletChallenge",
  domain: "openfiat-my-reviews",
  messages: {
    "not-your-wallet":
      "The node refused: the connected wallet is not one of the two people in these reviews. Whole reviews are readable only by their author and their subject — everyone else reads the redacted feed.",
    "challenge-expired":
      "The challenge expired before it was signed — it is only valid for five minutes. Try again and approve the wallet prompt promptly.",
    "challenge-spent": "That challenge was already used. Each one is single-use; try again.",
    "wrong-key": "The signature did not verify against the connected wallet's key.",
    "wallet-cannot-sign":
      "This wallet does not support message signing, which is how you prove these reviews are yours to read.",
    unreachable: "Could not reach the selected node.",
  },
};

/** Every review this wallet wrote or is the subject of, newest first. */
export async function fetchMyReviews(
  endpoint: string,
  address: string,
  signer: SolanaProvider,
): Promise<MyReview[]> {
  const raw = await signedRead<RawMyReview[]>(
    endpoint,
    "getMyReviews",
    address,
    signer,
    MY_REVIEWS,
  );
  return toMyReviews(raw ?? []).sort((a, b) => b.createdAt - a.createdAt);
}

export const myReviews = cachedRead(fetchMyReviews);

/**
 * This wallet's own review of one settlement, or `null` if it has not
 * written one.
 *
 * Matched on the author rather than on the settlement alone: both parties
 * may review the same trade, so a settlement match on its own would show
 * one party the *other's* review as their own.
 */
export function myReviewOf(
  reviews: MyReview[] | null,
  settlementId: string,
  myPeerId: string | null,
): MyReview | null {
  if (!reviews || !myPeerId) return null;
  return reviews.find((r) => r.settlement === settlementId && r.author === myPeerId) ?? null;
}
