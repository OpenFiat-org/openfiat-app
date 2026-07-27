import Link from "next/link";
import type { Merchant } from "@/lib/types";
import { getCountry } from "@/lib/data/countries";
import { formatNumber } from "@/lib/format";
import { MerchantAvatar } from "@/components/merchant-avatar";
import { ReputationScore } from "@/components/reputation-score";
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
        {/* Reputation sits on the canonical cell rather than being added per
            page: this component is how a counterparty appears in the order
            book, orders, disputes, the trade room and the explorer, so the
            figure follows them everywhere by construction. */}
        <p className="mt-0.5 flex items-center gap-2 text-xs tabular-nums text-gray-500">
          <ReputationScore merchant={merchant} />
          <span className="text-gray-600">·</span>
          {formatNumber(merchant.orders, 0)} orders · {merchant.completionRate}% completion
        </p>
      </div>
    </Link>
  );
}
