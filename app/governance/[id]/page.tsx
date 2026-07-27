import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { proposalById } from "@/lib/data/governance";
import { Panel } from "@/components/panel";
import { StatusPill } from "@/components/status-pill";
import { VotePanel } from "@/components/governance/vote-panel";
import { VoteBar } from "@/components/governance/vote-bar";

export const metadata: Metadata = {
  title: "Proposal",
};

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proposal = proposalById(id.toUpperCase());
  if (!proposal) notFound();

  return (
    <section className="max-w-3xl">
      <Link href="/governance" className="text-sm text-gray-500 hover:text-white">
        ← Back to Governance
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className="font-mono text-sm text-gray-500">{proposal.id}</span>
        <h1 className="text-xl font-semibold text-white">{proposal.title}</h1>
        <StatusPill status={proposal.status} />
      </div>
      <p className="mt-1 text-sm text-gray-500">{proposal.votingEnds}</p>

      <div className="mt-8 space-y-6">
        <Panel title="Description">
          <p className="px-4 py-3 text-sm leading-relaxed text-gray-300">{proposal.description}</p>
        </Panel>

        <Panel title="Votes">
          <div className="space-y-1.5 px-4 py-3">
            <VoteBar label="For" pct={proposal.votesFor} cls="bg-emerald-500" />
            <VoteBar label="Against" pct={proposal.votesAgainst} cls="bg-red-400" />
            <VoteBar label="Abstain" pct={proposal.votesAbstain} cls="bg-gray-500" />
            <p className="pt-1 text-xs tabular-nums text-gray-500">
              Turnout {proposal.turnoutPct}% of {proposal.quorumPct}% quorum
              {proposal.turnoutPct >= proposal.quorumPct ? " — quorum reached" : " — quorum not yet reached"}
            </p>
          </div>
          <div className="border-t border-white/10 px-4 py-3">
            <VotePanel status={proposal.status} />
            <p className="mt-2 text-[11px] text-gray-600">Voting is simulated — no transaction is signed.</p>
          </div>
        </Panel>
      </div>
    </section>
  );
}
