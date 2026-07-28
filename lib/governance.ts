import type { ProposalCategory } from "@/lib/types";

/**
 * Category → quorum/threshold rules and badge color, in one place. OFS-4100
 * §5: higher-impact categories require both a higher quorum and a
 * supermajority, not just simple majority — the two move together per
 * category, they are not independently configurable per proposal.
 */
export const CATEGORY_RULES: Record<
  ProposalCategory,
  { quorumPct: number; approvalThresholdPct: number; thresholdLabel: string; badge: string }
> = {
  Informational: {
    quorumPct: 10,
    approvalThresholdPct: 50,
    thresholdLabel: "Simple majority",
    badge: "border-white/15 bg-white/5 text-gray-300",
  },
  Standards: {
    quorumPct: 10,
    approvalThresholdPct: 50,
    thresholdLabel: "Simple majority",
    badge: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  },
  Parameter: {
    quorumPct: 10,
    approvalThresholdPct: 50,
    thresholdLabel: "Simple majority",
    badge: "border-brand/30 bg-brand/10 text-brand-hover",
  },
  Treasury: {
    quorumPct: 10,
    approvalThresholdPct: 60,
    thresholdLabel: "60% supermajority",
    badge: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  },
  "Protocol-Upgrade": {
    quorumPct: 20,
    approvalThresholdPct: 66,
    thresholdLabel: "66% supermajority",
    badge: "border-violet-400/30 bg-violet-400/10 text-violet-300",
  },
  Constitutional: {
    quorumPct: 20,
    approvalThresholdPct: 66,
    thresholdLabel: "66% supermajority",
    badge: "border-red-400/30 bg-red-400/10 text-red-300",
  },
};

export const CATEGORY_ORDER: ProposalCategory[] = [
  "Informational",
  "Standards",
  "Parameter",
  "Treasury",
  "Protocol-Upgrade",
  "Constitutional",
];

/** [PROPOSED — NEEDS SIGN-OFF] OFS-4100 §5. */
export const PROPOSAL_STAKE_DEPOSIT_OPEN = 5000;
