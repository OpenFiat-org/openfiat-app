import type { ProposalCategory } from "@/lib/live-proposals";

/**
 * The category badge for a **network** proposal.
 *
 * Deliberately not `components/governance/category-badge.tsx`, and the two
 * must not be merged: the on-chain program's `ProposalCategory` is
 * Informational / Standards / Parameter / Treasury / Protocol-Upgrade /
 * Constitutional, and the off-chain protocol's is Protocol / Economics /
 * Marketplace / Infrastructure / Governance. Different sets, different
 * registries, no mapping between them — and since both are Borsh/serde
 * enums serialised by declaration index, a shared component would happily
 * render "Treasury" over a proposal filed as "Marketplace".
 *
 * No quorum or threshold in the tooltip either, for the same reason: the
 * approval bar is the *chain's* rule, keyed on the chain's categories, and
 * an off-chain category sets nothing.
 */
const BADGE: Record<ProposalCategory, string> = {
  Protocol: "border-violet-400/30 bg-violet-400/10 text-violet-300",
  Economics: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  Marketplace: "border-brand/30 bg-brand/10 text-brand-hover",
  Infrastructure: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  Governance: "border-white/15 bg-white/5 text-gray-300",
};

export function ProposalCategoryBadge({ category }: { category: ProposalCategory }) {
  return (
    <span
      className={`whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        BADGE[category] ?? BADGE.Governance
      }`}
    >
      {category}
    </span>
  );
}
