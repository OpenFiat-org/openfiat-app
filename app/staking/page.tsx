import type { Metadata } from "next";
import { StakingRolesPanel } from "@/components/staking/staking-roles-panel";
import { PageHero } from "@/components/page-hero";
import { MetricStrip } from "@/components/metrics";

export const metadata: Metadata = {
  title: "Staking",
  description: "Bond OPEN for your protocol role — merchant, node operator, arbitrator, or service provider.",
};

export default function StakingPage() {
  return (
    <section>
      <PageHero
        variant="bloom"
        title="Staking"
        description="OPEN secures the coordination layer: every protocol role is bonded. Stake for your role — merchant, node operator, arbitrator, or service provider. Bonds are enforced by the real openfiat-staking program on Solana devnet."
      >
        {/* 7 days is the real `unbonding_period_secs` this cluster's
         *  StakingConfig was initialized with (OFS-4100 §4) — a fixed
         *  protocol parameter, not a per-request live value, so it's
         *  safe to state directly rather than fetch. */}
        <MetricStrip items={[{ label: "Unstake cooldown", value: "7 days", sub: "bond releases after cooldown" }]} />
      </PageHero>

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-gray-400">Stake by role</h2>
      <div className="mt-3">
        <StakingRolesPanel />
      </div>

      <p className="mt-6 border-l-2 border-white/15 px-4 py-2 text-sm text-gray-400">
        Unstaking starts a 7-day cooldown (<code className="text-gray-300">request_unstake</code> then{" "}
        <code className="text-gray-300">withdraw_unstaked</code> once it elapses). Rewards accrue as{" "}
        <code className="text-gray-300">pending_rewards</code> and are claimable via{" "}
        <code className="text-gray-300">claim_rewards</code> — not yet wired to this page's UI.
      </p>
    </section>
  );
}
