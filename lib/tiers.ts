import type { MerchantTier } from "@/lib/types";

/**
 * The single source of truth for reputation-tier colors. Used by
 * `merchant-avatar.tsx` (ring) and `tier-badge.tsx` (badge).
 */
export const TIER_RING: Record<MerchantTier, string> = {
  Explorer: "ring-gray-500/70",
  Verified: "ring-sky-500/70",
  Professional: "ring-violet-500/70",
  Elite: "ring-amber-400/80",
  Institutional: "ring-teal-400/80",
};

export const TIER_BADGE: Record<MerchantTier, string> = {
  Explorer: "border-gray-500/30 bg-gray-500/10 text-gray-400",
  Verified: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  Professional: "border-violet-500/30 bg-violet-500/10 text-violet-300",
  Elite: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  Institutional: "border-teal-400/30 bg-teal-400/10 text-teal-300",
};
