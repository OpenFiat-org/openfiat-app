import type { Metadata } from "next";
import { MerchantConsole } from "@/components/ads/merchant-console";
import { PageHero } from "@/components/page-hero";

export const metadata: Metadata = {
  title: "My Ads",
  description: "Merchant console — publish and manage OpenFiat advertisements backed by your liquidity vaults.",
};

export default function AdsPage() {
  return (
    <section>
      <PageHero
        title="My Ads"
        description="Publishing advertisements requires an L2 Verified Merchant Identity and an OPEN merchant bond."
      />
      <div className="mt-8">
        <MerchantConsole />
      </div>
    </section>
  );
}
