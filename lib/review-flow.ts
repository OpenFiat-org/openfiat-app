import bs58 from "bs58";

import { sendSignedEvent, signPayload } from "@/lib/arbitration";
import { explainNodeRefusal, type RefusalTranslator } from "@/lib/node-refusal";
import { nodeUrl } from "@/lib/node-endpoint";
import type { TradeIdentity } from "@/lib/trade-flow";

/**
 * Publishing a review of a trade, as the connected wallet signs it.
 *
 * # Key order is load-bearing, and silent when wrong
 *
 * The same rule `lib/trade-flow.ts` sets out at length: the node
 * re-serialises the payload with `serde_json`, which emits fields in the
 * Rust struct's declaration order, and verifies the signature over *its
 * own* rendering. `JSON.stringify` emits insertion order. A reordered key
 * is a valid signature over the wrong bytes and comes back as
 * `INVALID_SIGNATURE` with nothing on screen to tell it from a wallet
 * fault. {@link buildReview} is written in `openfiat_reviews::Review`'s
 * declaration order and says so.
 *
 * # What a review is not
 *
 * It is not reputation, and this app must never let the two blur.
 * `openfiat-reputation` deliberately does not depend on
 * `openfiat-reviews`: a score is recomputed by every node from signed
 * settlements and disputes and cannot be talked up or down; a review is
 * one counterparty's words, and its signature proves who wrote it and
 * nothing about whether it is true. Publishing one moves no counter.
 *
 * # Who may write one, and where that is decided
 *
 * Not here. `Review` deliberately does not carry the wallet it is about —
 * the node derives that from the settlement (`subject_of`), so a review
 * cannot name a wallet that was never in the trade. This module's local
 * checks are shape checks only; being entitled to review is the node's
 * answer, and a refusal comes back as `INVALID_IDENTITY_CLAIM`.
 */

/** Longest comment the protocol accepts — `openfiat_reviews::MAX_COMMENT_CHARS`. */
export const MAX_COMMENT_CHARS = 500;

/**
 * Characters `Review::validate` refuses, transcribed.
 *
 * Not a content filter — every one of these does something to the text
 * *around* it rather than to itself. A review renders beside a wallet id, a
 * star count and a date; a bidirectional override reverses what follows it
 * so a comment can be made to read as the label next to it, and a carriage
 * return or an escape redraws a terminal line, which is where a node
 * operator reads these. A newline survives, because a paragraph break is
 * ordinary prose.
 *
 * Checked here so the refusal arrives before a wallet prompt rather than
 * after one, and phrased for the person typing. The node checks it again;
 * this is convenience, never the authority.
 */
function isDisplayHazard(char: string): boolean {
  if (char === "\n") return false;
  const code = char.codePointAt(0)!;
  if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return true;
  return (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069);
}

/** Why a comment cannot be published, in the words of whoever typed it, or `null`. */
/** A validation problem as a stable key (plus values); prose lives in
 *  `reviews.commentProblem.*`. `null` when the comment is acceptable. */
export interface CommentProblem {
  key: string;
  values?: Record<string, string | number>;
}

export function commentProblem(comment: string): CommentProblem | null {
  if ([...comment].length > MAX_COMMENT_CHARS) {
    return { key: "tooLong", values: { max: MAX_COMMENT_CHARS, len: [...comment].length } };
  }
  if ([...comment].some(isDisplayHazard)) {
    return { key: "hazard" };
  }
  return null;
}

/**
 * `openfiat_reviews::record::Review` — settlement, author,
 * author_public_key, rating, comment, created_at.
 *
 * `rating` is the plain integer 1-5. The Rust enum's variants are called
 * `One`..`Five` but it carries a hand-written `serialize_u8`, so the
 * number is what the signature covers and the word would be a different
 * transcript.
 *
 * Exported unsigned so the exact bytes can be asserted in a test without a
 * wallet — the field order is the part that goes wrong, and it goes wrong
 * silently.
 */
export function buildReview(
  who: TradeIdentity,
  settlementId: string,
  stars: number,
  comment: string,
) {
  return {
    settlement: settlementId,
    author: who.peerId,
    author_public_key: bs58.encode(who.publicKey),
    rating: stars,
    comment,
    created_at: Date.now(),
  };
}

/**
 * Signs and publishes a review, returning the id the node derived for it.
 *
 * That id is `<settlement>:<author>` and is not the author's to choose:
 * it *is* the rule "one review per party per trade", so publishing again
 * lands on the same key on every node and supersedes your own earlier
 * words rather than adding a second row. Nobody can supersede anybody
 * else's.
 */
export async function publishReview(
  who: TradeIdentity,
  settlementId: string,
  stars: number,
  comment: string,
): Promise<string> {
  // A backstop only — the form disables publishing while a problem stands, so
  // this fires solely if that guard is bypassed. The key is enough to trace it.
  const problem = commentProblem(comment);
  if (problem) throw new Error(`comment:${problem.key}`);
  const review = buildReview(who, settlementId, stars, comment);
  const signature = await signPayload(who.provider, review);
  const id = await sendSignedEvent(nodeUrl(), "sendReviewPublish", { review, signature });
  return String(id);
}


/** What a refusal means to somebody who just pressed "publish". */
export function explainReviewRefusal(t: RefusalTranslator, error: unknown): string {
  return explainNodeRefusal(t, error, "review", { max: MAX_COMMENT_CHARS });
}
