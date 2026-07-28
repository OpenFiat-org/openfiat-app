import { CATEGORY_RULES } from "@/lib/governance";
import type { ProposalCategory } from "@/lib/types";

/**
 * Proposal category badge. Category sets the approval bar (OFS-4100 §5) —
 * the hover text says so, because a reader could otherwise assume every
 * proposal needs the same quorum and majority, and most don't.
 */
export function CategoryBadge({ category }: { category: ProposalCategory }) {
  const rule = CATEGORY_RULES[category];
  return (
    <span
      title={`${category} — ${rule.thresholdLabel}, ${rule.quorumPct}% quorum`}
      className={`cursor-help whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${rule.badge}`}
    >
      {category}
    </span>
  );
}
