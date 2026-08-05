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
        description="Edit, pause or take down what you have on offer. There is no identity check — the OPEN merchant bond is what is at risk if you do not settle, and Become a merchant reads yours against the chain's own minimum."
      />
      <div className="mt-8">
        <MerchantConsole />
      </div>
    </section>
  );
}
