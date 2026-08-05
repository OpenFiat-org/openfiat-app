import type { Metadata } from "next";
import { ArbitrationConsole } from "@/components/arbitrate/arbitration-console";
import { PageHero } from "@/components/page-hero";

export const metadata: Metadata = {
  title: "Arbitrate",
  description:
    "Work a dispute case: join it, then cast the commit-reveal vote that decides the outcome.",
};

export default function ArbitratePage() {
  return (
    <section>
      <PageHero
        variant="bloom"
        title="Arbitrate"
        description="Arbitrators choose their own cases and rule with their own OPEN at risk. Joining a case unlocks its evidence; the ruling is a commit-reveal vote, so nobody can follow the crowd. Two votes run side by side — one records the case off-chain, the other decides payout and slashing on chain."
      />

      <div className="mt-8">
        <ArbitrationConsole />
      </div>
    </section>
  );
}
