import { reputationFor } from "@/lib/data/merchants";
import type { Merchant, MerchantTier } from "@/lib/types";

/**
 * Reputation, per OFS-3000 (ORE).
 *
 * Two things the specification is deliberate about, which this module has to
 * respect rather than paper over:
 *
 * §6 — reputation is *not* a single score. It is eight independent dimensions,
 * so that an application can judge a counterparty on the axis that matters for
 * a given trade. A merchant who settles slowly but has never lost a dispute is
 * a different proposition from the reverse, and one number hides that.
 *
 * §16 — the protocol defines no fixed formula. It defines input metrics, event
 * definitions and update rules, and leaves scoring to governance so the
 * algorithm can improve without a protocol change.
 *
 * So the composite below is *this application's* summary of the eight
 * dimensions, not a protocol value, and the UI says so. It exists because a
 * table row cannot show eight numbers, not because the protocol has one.
 */

/** Plain-language description of each dimension, from OFS-3000 §7-15. */
export const DIMENSION_NOTE: Record<string, string> = {
  "Settlement Speed":
    "How quickly they release or confirm once payment is made. Recent trades count for more than old ones.",
  "Trade Success Rate":
    "The share of accepted trades that completed rather than being cancelled or expiring.",
  "Dispute Rate":
    "How often their trades end in a dispute. Lower is better — a rate near zero is what you want to see.",
  "Trade Volume":
    "Value settled over the last 30 days. Depth, not quality: high volume alone does not make a counterparty safe.",
  "Average Ticket Size":
    "The typical size of their trades, which tells you whether your amount is normal for them.",
  "Merchant Age":
    "How long they have been active on the protocol. Time is the one input that cannot be bought quickly.",
  Availability:
    "Whether they are online and how fast they reply. Decays with inactivity, so it reflects now rather than their best month.",
  "Payment Accuracy":
    "How reliably the amount and reference they send match what was agreed.",
};

/** OFS-3000 §18. Governance sets the thresholds; tiers are descriptive only. */
export const TIER_ORDER: MerchantTier[] = [
  "Explorer",
  "Verified",
  "Professional",
  "Elite",
  "Institutional",
];

export const TIER_NOTE =
  "Tiers summarise standing at a glance and are descriptive only — they never let a merchant bypass a protocol rule. Escrow, limits and dispute handling are identical at every tier.";

/**
 * The dimensions that describe how a counterparty *behaves*.
 *
 * Trade Volume, Average Ticket Size and Merchant Age are deliberately excluded.
 * They measure scale, not conduct: a large desk and a careful one are different
 * claims, and averaging them together produces a figure that means neither. It
 * also mis-signals badly — an Institutional merchant settling 99.8% of trades
 * scored in the 70s under a flat eight-way mean, purely because its ticket size
 * and age sat low on their own scales, and a reader would read that as a
 * mediocre counterparty.
 *
 * The excluded three are still shown in full on the merchant page, where their
 * own units make them meaningful. This is only about what a one-number summary
 * can honestly claim.
 */
const CONDUCT_DIMENSIONS = [
  "Trade Success Rate",
  "Dispute Rate",
  "Payment Accuracy",
  "Settlement Speed",
  "Availability",
];

/**
 * This application's summary of conduct: the mean of the five conduct
 * dimensions, rounded.
 *
 * Unweighted within that set. Any weighting encodes a judgement about which
 * dimension matters most, and under §16 that judgement belongs to governance,
 * not to a display helper.
 */
export function compositeScore(merchant: Merchant): number {
  const dims = reputationFor(merchant).filter((d) =>
    CONDUCT_DIMENSIONS.includes(d.label),
  );
  const total = dims.reduce((sum, d) => sum + d.score, 0);
  return Math.round(total / dims.length);
}

/** Coarse band for colouring, so a weak score is not styled as a strong one. */
export function scoreBand(score: number): "strong" | "fair" | "weak" {
  if (score >= 80) return "strong";
  if (score >= 60) return "fair";
  return "weak";
}

export const BAND_TEXT: Record<ReturnType<typeof scoreBand>, string> = {
  strong: "text-emerald-300",
  fair: "text-amber-300",
  weak: "text-red-300",
};

export const COMPOSITE_NOTE =
  "OpenFiat scores reputation on eight independent dimensions rather than one number — the protocol has no single score and no fixed formula for combining them. This figure is our own summary of the five that describe conduct: trade success, dispute rate, payment accuracy, settlement speed and availability. Volume, ticket size and account age describe scale rather than conduct, so they are left out of it and shown separately on the merchant's page.";
