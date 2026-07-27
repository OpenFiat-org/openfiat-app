import Link from "next/link";
import type { Merchant } from "@/lib/types";
import { getCountry } from "@/lib/data/countries";
import { formatNumber } from "@/lib/format";
import { MerchantAvatar } from "@/components/merchant-avatar";
import { TierBadge } from "@/components/tier-badge";

/**
 * The canonical merchant/counterparty cell: tier-ringed avatar, name, country
 * flag, tier badge, and reputation stats (orders · completion) — linking to
 * the merchant's profile page. Used wherever a merchant appears.
 */
export function MerchantCell({ merchant, size = "sm" }: { merchant: Merchant; size?: "sm" | "md" }) {
  const country = getCountry(merchant.countryCode);
  return (
    <Link href={`/merchants/${merchant.id}`} className="group flex items-center gap-3">
      <MerchantAvatar name={merchant.name} tier={merchant.tier} size={size} />
      <div>
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-white group-hover:text-brand-hover">{merchant.name}</span>
          <span title={country?.name}>{country?.flag}</span>
          <TierBadge tier={merchant.tier} />
        </div>
        <p className="mt-0.5 text-xs tabular-nums text-gray-500">
          {formatNumber(merchant.orders, 0)} orders · {merchant.completionRate}% completion
        </p>
      </div>
    </Link>
  );
}
