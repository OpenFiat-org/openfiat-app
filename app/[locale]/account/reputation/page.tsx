import type { Metadata } from "next";
import { PageHero } from "@/components/page-hero";
import { LiveReputationPanel } from "@/components/account/live-reputation";

export const metadata: Metadata = {
  title: "Reputation",
  description: "Your OpenFiat reputation — wallet-bound, portable, built on 8 objective dimensions.",
};


/*
 * A `TIER_LADDER` stood here — Newcomer through Institutional, each
 * promising ad slots, priority placement and bond discounts, with a "← you"
 * marker against whichever tier the fixture claimed. It is gone rather than
 * relabelled: the protocol has no tiers, and nothing in this codebase grants
 * an ad slot or a bond discount for reputation. Presenting it beside real
 * counters would have made an unbuilt design read as current standing.
 */

export default function ReputationPage() {
  return (
    <section>
      <PageHero
        title="Reputation"
        description="No star ratings — reputation is a set of objective, on-chain-verifiable dimensions, bound to your wallet and portable across every OpenFiat application."
      />

      <div className="mt-8">
        <LiveReputationPanel />
      </div>


      <p className="mt-8 text-xs text-gray-500">
        Reputation events (SettlementCompleted, DisputeResolved, PaymentApproved, …) are emitted as
        signed protocol events and aggregate into the counters above on every OpenFiat application
        that reads the same wallet.
      </p>

    </section>
  );
}
