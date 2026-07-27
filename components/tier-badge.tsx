import { TIER_NOTE, TIER_ORDER } from "@/lib/reputation";
import { TIER_BADGE } from "@/lib/tiers";
import type { MerchantTier } from "@/lib/types";

/**
 * Tier badge. The hover text names the ladder and, more importantly, says that
 * tiers are descriptive — a reader could otherwise reasonably assume a higher
 * tier buys looser escrow or higher limits, and it does not.
 */
export function TierBadge({ tier }: { tier: MerchantTier }) {
  const position = TIER_ORDER.indexOf(tier) + 1;
  return (
    <span
      title={`${tier} — tier ${position} of ${TIER_ORDER.length} (${TIER_ORDER.join(" → ")}). ${TIER_NOTE}`}
      className={`cursor-help whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TIER_BADGE[tier]}`}
    >
      {tier}
    </span>
  );
}
