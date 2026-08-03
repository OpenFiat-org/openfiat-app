import type { Metadata } from "next";

import { BecomeMerchant } from "@/components/merchant/become-merchant";
import { PageHero } from "@/components/page-hero";

export const metadata: Metadata = {
  title: "Become a Merchant",
  description:
    "What it takes to advertise on OpenFiat: a wallet, the on-chain OPEN merchant bond, and an account to be paid into. Every requirement read live from the chain.",
};

export default function BecomeMerchantPage() {
  return (
    <section>
      <PageHero
        title="Become a merchant"
        description="Three things, and the screen reads all three rather than describing them. There is no application and no identity check — the bond is what is at risk if you do not settle."
      />
      <div className="mt-8">
        <BecomeMerchant />
      </div>
    </section>
  );
}
