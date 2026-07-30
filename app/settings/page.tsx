import type { Metadata } from "next";
import { SettingsForm } from "@/components/settings/settings-form";
import { AvatarForm } from "@/components/account/avatar-form";
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
        description="Your merchant name and avatar are published to the network and signed by your wallet. Everything below them is a local preference stored in this browser."
      />
      <div className="mt-8">
        <MerchantNameForm />
      </div>

      <div className="mt-8">
        <AvatarForm />
      </div>

      <div className="mt-8">
        <SettingsForm />
      </div>
    </section>
  );
}
