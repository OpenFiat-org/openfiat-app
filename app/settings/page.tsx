import type { Metadata } from "next";
import { SettingsForm } from "@/components/settings/settings-form";
import { MerchantNameForm } from "@/components/account/merchant-name-form";
import { PageHero } from "@/components/page-hero";

export const metadata: Metadata = {
  title: "Settings",
};

export default function SettingsPage() {
  return (
    <section className="max-w-3xl">
      <PageHero
        title="Settings"
        description="Your merchant name is published to the network and signed by your wallet. Everything below it is a local preference stored in this browser."
      />
      <div className="mt-8">
        <MerchantNameForm />
      </div>

      <div className="mt-8">
        <SettingsForm />
      </div>
    </section>
  );
}
