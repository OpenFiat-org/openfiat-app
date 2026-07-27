import type { Metadata } from "next";
import { SettingsForm } from "@/components/settings/settings-form";
import { PageHero } from "@/components/page-hero";

export const metadata: Metadata = {
  title: "Settings",
};

export default function SettingsPage() {
  return (
    <section className="max-w-3xl">
      <PageHero
        title="Settings"
        description="Local preferences for the demo app."
      />
      <div className="mt-8">
        <SettingsForm />
      </div>
    </section>
  );
}
