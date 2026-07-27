import type { MerchantTier } from "@/lib/types";
import { TIER_RING } from "@/lib/tiers";

/**
 * Deterministic avatar: initial + hue derived from the merchant name, ringed
 * in the merchant's reputation-tier color (see lib/tiers.ts).
 */
export function MerchantAvatar({
  name,
  tier,
  size = "md",
}: {
  name: string;
  tier?: MerchantTier;
  size?: "sm" | "md";
}) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 360;
  const cls = size === "sm" ? "h-8 w-8 text-sm" : "h-10 w-10 text-base";
  const ring = tier ? `ring-2 ${TIER_RING[tier]}` : "";
  return (
    <span
      className={`flex ${cls} ${ring} shrink-0 items-center justify-center rounded-full font-semibold text-white`}
      style={{ backgroundColor: `hsl(${hash} 55% 38%)` }}
      aria-hidden
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
