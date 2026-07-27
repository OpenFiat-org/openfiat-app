import type { Metadata } from "next";
import Link from "next/link";
import { STAKING_POSITIONS, STAKING_ROLES, STAKING_SUMMARY } from "@/lib/data/staking";
import { formatNumber } from "@/lib/format";
import { DataTable, Td, Th, Tr } from "@/components/data-table";
import { MetricStrip } from "@/components/metrics";
import { PageHero } from "@/components/page-hero";
import { StatusPill } from "@/components/status-pill";

export const metadata: Metadata = {
  title: "Staking",
  description: "Bond OPEN for your protocol role — merchant, node operator, arbitrator, or service provider.",
};

export default function StakingPage() {
  const nodeRole = STAKING_ROLES.find((r) => r.role === "node")!;

  return (
    <section>
      <PageHero
        variant="bloom"
        title="Staking"
        description="OPEN secures the coordination layer: every protocol role is bonded. Stake for your role — merchant, node operator, arbitrator, or service provider."
      >
        <MetricStrip
          items={[
            { label: "Total staked", value: `${formatNumber(STAKING_SUMMARY.totalStaked, 0)} OPEN` },
            { label: "Pending rewards", value: `${formatNumber(STAKING_SUMMARY.pendingRewards)} OPEN` },
            { label: "Unstake cooldown", value: `${STAKING_SUMMARY.cooldownDays} days`, sub: "bond releases after cooldown" },
          ]}
        />
      </PageHero>

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-gray-400">Stake by role</h2>
      <div className="mt-3 divide-y divide-white/5 border-y border-white/5">
        {STAKING_ROLES.map((r) => (
          <div key={r.role} className="flex flex-wrap items-center gap-x-8 gap-y-3 py-6">
            <div className="min-w-64 flex-1">
              <div className="flex items-center gap-3">
                <h3 className="font-medium text-white">{r.title}</h3>
                <StatusPill status={r.status === "Active" ? "Online" : "Not started"} />
              </div>
              <p className="mt-1 max-w-xl text-sm text-gray-400">{r.requirement}</p>
            </div>
            <div className="text-sm">
              <p className="text-xs text-gray-500">Required</p>
              <p className="mt-0.5 tabular-nums text-gray-200">{formatNumber(r.minBond, 0)} OPEN</p>
            </div>
            <div className="text-sm">
              <p className="text-xs text-gray-500">You staked</p>
              <p className={`mt-0.5 tabular-nums ${r.staked > 0 ? "text-emerald-300" : "text-gray-500"}`}>
                {formatNumber(r.staked, 0)} OPEN
              </p>
            </div>
            <div className="text-sm">
              <p className="text-xs text-gray-500">Rewards</p>
              <p className="mt-0.5 text-gray-300">{r.rewards}</p>
            </div>
            <Link
              href={`/staking/stake?role=${r.role}`}
              className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
            >
              Stake
            </Link>
          </div>
        ))}
      </div>

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-gray-400">
        Node Operator positions ({formatNumber(nodeRole.staked, 0)} OPEN delegated)
      </h2>
      <div className="mt-3">
        <DataTable
          minWidth={640}
          head={
            <tr>
              <Th>Node</Th>
              <Th>Role</Th>
              <Th right>Staked</Th>
              <Th right>APR</Th>
              <Th right>Rewards earned</Th>
            </tr>
          }
        >
          {STAKING_POSITIONS.map((p) => (
            <Tr key={p.node}>
              <Td py="py-5" className="font-mono text-gray-200">{p.node}</Td>
              <Td py="py-5" className="text-gray-300">{p.role}</Td>
              <Td py="py-5" right num className="text-gray-200">{formatNumber(p.amount, 0)} OPEN</Td>
              <Td py="py-5" right num className="text-emerald-300">{p.aprPct}%</Td>
              <Td py="py-5" right num className="text-gray-300">{formatNumber(p.rewards)} OPEN</Td>
            </Tr>
          ))}
        </DataTable>
      </div>

      <p className="mt-6 border-l-2 border-white/15 px-4 py-2 text-sm text-gray-400">
        Unstaking starts a {STAKING_SUMMARY.cooldownDays}-day cooldown. Your merchant bond cannot be unstaked while you
        have active advertisements, open reservations, or unsettled escrow. Rewards accrue per epoch and are claimable
        at any time (simulated here).
      </p>
    </section>
  );
}
