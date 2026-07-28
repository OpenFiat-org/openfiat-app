import type { Metadata } from "next";
import Link from "next/link";
import { PROPOSALS, TREASURY } from "@/lib/data/governance";
import { formatNumber } from "@/lib/format";
import { DataTable, Td, Th, Tr } from "@/components/data-table";
import { CategoryBadge } from "@/components/governance/category-badge";
import { MetricStrip } from "@/components/metrics";
import { PageHero } from "@/components/page-hero";
import { StatusPill } from "@/components/status-pill";
import { VoteStack } from "@/components/governance/vote-bar";

export const metadata: Metadata = {
  title: "Governance",
  description: "OpenFiat governance — OFIPs, OPEN-weighted voting, and the protocol treasury.",
};

export default function GovernancePage() {
  return (
    <section>
      <PageHero
        variant="ballot"
        title="Governance"
        description="OpenFiat Improvement Proposals (OFIPs) are decided by OPEN-weighted voting; executed proposals move the on-chain treasury."
      >
        <MetricStrip
          items={[
            { label: "Treasury (OPEN)", value: `${formatNumber(TREASURY.openBalance, 0)} OPEN` },
            { label: "Treasury (USDC)", value: `${formatNumber(TREASURY.usdcBalance, 0)} USDC`, sub: "fee revenue diversification" },
            { label: "Your voting power", value: "25,000 OPEN", sub: "staked + bonded" },
            { label: "Active proposals", value: String(PROPOSALS.filter((p) => p.status === "Active").length) },
          ]}
        />
      </PageHero>

      <div className="mt-10">
        <DataTable
          minWidth={900}
          head={
            <tr>
              <Th>Proposal</Th>
              <Th>Proposal</Th>
              <Th className="w-28">Category</Th>
              <Th className="w-64">Votes (For / Against / Abstain)</Th>
              <Th className="w-24">Quorum</Th>
              <Th className="w-32">Voting</Th>
              <Th right className="w-24">Status</Th>
            </tr>
          }
        >
          {PROPOSALS.map((p) => (
            <Tr key={p.id}>
              <Td py="py-5">
                <Link href={`/governance/${p.id}`} className="group">
                  <span className="mr-2 font-mono text-xs text-gray-500">{p.id}</span>
                  <span className="font-medium text-white group-hover:text-brand-hover">{p.title}</span>
                </Link>
              </Td>
              <Td py="py-5" className="w-28">
                <CategoryBadge category={p.category} />
              </Td>
              <Td py="py-5" className="w-64">
                <VoteStack proposal={p} />
              </Td>
              <Td py="py-5" className="w-24 text-xs tabular-nums text-gray-500">
                {p.turnoutPct}% / {p.quorumPct}%
                {p.turnoutPct >= p.quorumPct && <span className="text-emerald-400"> ✓</span>}
              </Td>
              <Td py="py-5" className="w-32 text-xs text-gray-500">{p.votingEnds}</Td>
              <Td py="py-5" right className="w-24"><StatusPill status={p.status} /></Td>
            </Tr>
          ))}
        </DataTable>
      </div>
    </section>
  );
}
