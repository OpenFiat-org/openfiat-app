import type { Metadata } from "next";
import { EarningsConsole } from "@/components/earnings/earnings-console";
import { RewardObservations } from "@/components/earnings/reward-observations";
import { PageHero } from "@/components/page-hero";

export const metadata: Metadata = {
  title: "Provider earnings",
  description:
    "Read your service's earnings statement by signing a challenge with the key it was registered under.",
};

export default function EarningsPage() {
  return (
    <section>
      <PageHero
        variant="bloom"
        title="Provider earnings"
        description="If you run a node, an oracle, a notification gateway or a risk intelligence service, this is where you read what it has earned. There is no provider account: you prove the service is yours by signing a one-time challenge with the key you registered it under."
      />

      <div className="mt-8">
        <EarningsConsole />
      </div>

      {/*
        * A node operator is not a registered service and has no statement
        * to sign for, so the console above answers nothing for them. This
        * does, and it needs no wallet: OFS-4100 §9.4 makes the observations
        * public precisely so the schedule computed from them can be checked
        * by anyone.
        */}
      <RewardObservations />
    </section>
  );
}
