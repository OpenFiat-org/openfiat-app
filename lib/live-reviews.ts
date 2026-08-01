import { Client } from "@openfiat/sdk";
import { nodeUrl } from "@/lib/node-endpoint";
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

/** Wire shape of `PublicReview`. Snake-case, and a `Rating` is a word. */
interface RawReview {
  about: string;
  rating: "One" | "Two" | "Three" | "Four" | "Five";
  comment: string;
  created_on: number;
}

export interface LiveReview {
  /** Whom the review is about, as a base58 PeerId. */
  about: string;
  /** 1 to 5. The wire carries a word; a UI needs to count stars. */
  stars: number;
  comment: string;
  /** Midnight UTC of the day it was written — never the exact moment. */
  createdOn: number;
}

const STARS: Record<RawReview["rating"], number> = {
  One: 1,
  Two: 2,
  Three: 3,
  Four: 4,
  Five: 5,
};

/**
 * Exported so the mapping can be tested without a node.
 *
 * A rating outside the five the protocol defines is dropped rather than
 * coerced. `Rating::from_stars` is the only constructor and refuses
 * anything off the scale, so a sixth word on the wire means this app and
 * that node disagree about the type — and picking a number for it would
 * put an invented score under somebody's name.
 */
export function toLiveReviews(raw: RawReview[]): LiveReview[] {
  const rows: LiveReview[] = [];
  for (const review of raw) {
    const stars = STARS[review.rating];
    if (stars === undefined) continue;
    rows.push({
      about: review.about,
      stars,
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
