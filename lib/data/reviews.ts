import type { MerchantReview } from "@/lib/types";

/**
 * Counterparty reviews.
 *
 * Two merchants only, deliberately. A rating is a number and can be derived
 * from a merchant's record; a review is prose and cannot, so inventing forty
 * merchants' worth would be forty merchants' worth of fabricated testimony
 * about people who do not exist. These two exist to show the surface, and every
 * other profile says plainly that it has no written reviews yet.
 *
 * They also reconcile with `ratingFor`, which reports the full rating count:
 * most people rate without writing anything, so the written subset is much
 * smaller than the total. Showing four reviews under a claim of 217 ratings is
 * the honest shape, not a gap.
 *
 * The negative ones are the point. A page of praise tells a reader nothing —
 * what tells them something is *how* a merchant fails: slow at a particular
 * hour, strict about references, unhelpful when a payment goes astray.
 */
export const REVIEWS: MerchantReview[] = [
  // ── KenyaStarTrades (Elite, 99.2% completion) ─────────────────────────────
  {
    id: "rev-ks-1",
    merchantId: "m-kenyastar",
    rater: "7xKm…9fQ2",
    positive: true,
    at: "2026-07-26T09:14:00Z",
    side: "Bought",
    comment:
      "Released in about two minutes after I sent the M-Pesa. Put the trade ID in the reference like they ask and there is no back and forth at all.",
  },
  {
    id: "rev-ks-2",
    merchantId: "m-kenyastar",
    rater: "4hRt…2mWv",
    positive: true,
    at: "2026-07-24T17:41:00Z",
    side: "Sold",
    comment:
      "Paid from a business account so the sender name did not match, which worried me, but they had said so in their terms and the reference lined up. Fine.",
  },
  {
    id: "rev-ks-3",
    merchantId: "m-kenyastar",
    rater: "9pLc…7dTn",
    positive: false,
    at: "2026-07-22T21:08:00Z",
    side: "Bought",
    comment:
      "Traded late at night and waited close to the full window. Got there in the end, but their terms say 07:00-22:00 EAT and they meant it — my own fault for not reading.",
  },
  {
    id: "rev-ks-4",
    merchantId: "m-kenyastar",
    rater: "2bQs…5nEx",
    positive: true,
    at: "2026-07-20T11:22:00Z",
    side: "Bought",
    comment: "Large amount, no fuss. Asked in chat first as they suggest and they had the depth ready.",
  },

  // ── SwiftKES (Professional, 99.0% completion) ─────────────────────────────
  {
    id: "rev-sk-1",
    merchantId: "m-swiftkes",
    rater: "5tYw…8kBp",
    positive: true,
    at: "2026-07-27T08:52:00Z",
    side: "Bought",
    comment: "Bank transfer cleared and they confirmed straight away. Would use again.",
  },
  {
    id: "rev-sk-2",
    merchantId: "m-swiftkes",
    rater: "8nVd…3xLq",
    positive: false,
    at: "2026-07-25T14:03:00Z",
    side: "Bought",
    comment:
      "I forgot the reference and they could not match my payment for nearly an hour. Sorted it once I sent the slip, but read their terms — no reference means a wait.",
  },
  {
    id: "rev-sk-3",
    merchantId: "m-swiftkes",
    rater: "6cJf…1zRm",
    positive: true,
    at: "2026-07-23T10:30:00Z",
    side: "Sold",
    comment: "Sent the KES within a few minutes of me locking the escrow. No complaints.",
  },
];

export function reviewsFor(merchantId: string): MerchantReview[] {
  return REVIEWS.filter((r) => r.merchantId === merchantId).sort((a, b) =>
    b.at.localeCompare(a.at),
  );
}
