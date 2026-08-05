import type { Metadata } from "next";
import { StakingRolesPanel } from "@/components/staking/staking-roles-panel";
import { PageHero } from "@/components/page-hero";

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
        description="OPEN secures the coordination layer: every protocol role is bonded. Stake for your role — merchant, node operator, arbitrator, or one of the four service-provider roles. Bonds are enforced by the real openfiat-staking program on Solana devnet."
      />
      {/*
        * A metric strip stating "Unstake cooldown — 7 days" used to sit
        * here, with a comment arguing it was "a fixed protocol parameter,
        * not a per-request live value, so it's safe to state directly
        * rather than fetch". It was not fixed: `StakingConfig` replaced the
        * flat `unbonding_period_secs` with a per-role array, and this
        * cluster now holds 24 hours for a merchant, 3 days for an
        * arbitrator and 7 days for everyone else. The claim was wrong for
        * two of the roles on the page listing them.
        *
        * The general lesson is worth keeping over the specific number: a
        * governance-updatable on-chain field is never safe to state
        * directly, because nothing tells this app when it moves. Each row
        * below carries its own period, read from the same account as its
        * minimum.
        */}

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-gray-400">Stake by role</h2>
      <div className="mt-3">
        <StakingRolesPanel />
      </div>

      <p className="mt-6 border-l-2 border-white/15 px-4 py-2 text-sm text-gray-400">
        Unstaking is <code className="text-gray-300">request_unstake</code>, then{" "}
        <code className="text-gray-300">withdraw_unstaked</code> once that role&apos;s cooldown
        elapses — the periods are in the table above, one per role. Rewards accrue as{" "}
        <code className="text-gray-300">pending_rewards</code> and are claimable via{" "}
        <code className="text-gray-300">claim_rewards</code> — not yet wired to this page&apos;s UI,
        and the schedule that fills that field is an off-chain cranker&apos;s, published nowhere this
        app can read.
      </p>
    </section>
  );
}
