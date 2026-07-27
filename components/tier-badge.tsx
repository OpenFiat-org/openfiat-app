import type { MerchantTier } from "@/lib/types";
import { TIER_BADGE } from "@/lib/tiers";

export function TierBadge({ tier }: { tier: MerchantTier }) {
  return (
    <span
      className={`whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TIER_BADGE[tier]}`}
    >
      {tier}
    </span>
  );
}
