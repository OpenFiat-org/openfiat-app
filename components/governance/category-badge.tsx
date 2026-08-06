import { useTranslations } from "next-intl";
import { CATEGORY_RULES } from "@/lib/governance";
import type { ProposalCategory } from "@/lib/types";

/** The three distinct approval bars, keyed by their supermajority percentage. */
function thresholdKey(pct: number): string {
  return pct >= 66 ? "super66" : pct >= 60 ? "super60" : "simple";
}

/**
 * Proposal category badge. Category sets the approval bar (OFS-4100 §5) —
 * the hover text says so, because a reader could otherwise assume every
 * proposal needs the same quorum and majority, and most don't.
 */
export function CategoryBadge({ category }: { category: ProposalCategory }) {
  const t = useTranslations("governance");
  const rule = CATEGORY_RULES[category];
  const label = t(`onchainCategory.${category}`);
  return (
    <span
      title={`${label} — ${t(`threshold.${thresholdKey(rule.approvalThresholdPct)}`)}, ${rule.quorumPct}% ${t("quorumWord")}`}
      className={`cursor-help whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${rule.badge}`}
    >
      {label}
    </span>
  );
}
