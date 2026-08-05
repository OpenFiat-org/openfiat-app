import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import { fetchProposal } from "@/lib/live-governance";
import { categoryLabel, hashFingerprint, statusLabel, toOpen, turnoutPct, votePercentages, votingEndsLabel } from "@/lib/proposal-display";
import { CATEGORY_RULES } from "@/lib/governance";
import { Panel } from "@/components/panel";
import { StatusPill } from "@/components/status-pill";
import { CategoryBadge } from "@/components/governance/category-badge";
import { VotePanel } from "@/components/governance/vote-panel";
import { VoteBar } from "@/components/governance/vote-bar";

export const metadata: Metadata = {
  title: "Proposal",
};

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let proposalId: bigint;
  try {
    proposalId = BigInt(id);
  } catch {
    notFound();
  }

  const proposal = await fetchProposal(proposalId!);
  if (!proposal) notFound();

  const { forPct, againstPct } = votePercentages(proposal);
  const category = categoryLabel(proposal.category);
  const rule = CATEGORY_RULES[category];
  const thresholdPct = proposal.thresholdSnapshot / 100;
  const turnout = turnoutPct(proposal);

  return (
    <section className="max-w-3xl">
      <Link href="/governance" className="text-sm text-gray-500 hover:text-white">
        ← Back to Governance
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className="font-mono text-sm text-gray-500">#{proposal.id.toString()}</span>
        <h1 className="font-mono text-lg font-semibold text-white">{hashFingerprint(proposal.titleHash)}</h1>
        <StatusPill status={statusLabel(proposal)} />
        <CategoryBadge category={category} />
      </div>
      <p className="mt-1 text-sm text-gray-500">{votingEndsLabel(proposal)}</p>

      <div className="mt-8 space-y-6">
        <Panel title="On-chain record">
          <div className="space-y-1.5 px-4 py-3 text-sm text-gray-300">
            <p>
              Title/summary are stored on-chain only as a hash (
              <span className="font-mono text-xs text-gray-500">{hashFingerprint(proposal.titleHash)}</span> /{" "}
              <span className="font-mono text-xs text-gray-500">{hashFingerprint(proposal.summaryHash)}</span>) —
              this page shows the real on-chain fields, not a reconstructed title.
            </p>
            <p className="text-xs text-gray-500">
              Proposer: <span className="font-mono">{proposal.proposer.toBase58()}</span>
            </p>
          </div>
        </Panel>

        <Panel title="Votes">
          <div className="space-y-1.5 px-4 py-3">
            <VoteBar label="For" pct={forPct} cls="bg-emerald-500" />
            <VoteBar label="Against" pct={againstPct} cls="bg-red-400" />
            <p className="pt-1 text-xs tabular-nums text-gray-500">
              Turnout {turnout.toFixed(1)}% of quorum
              {proposal.quorumMet ? " — quorum reached" : " — quorum not yet reached"}
            </p>
            <p className="text-xs tabular-nums text-gray-500">
              {rule.thresholdLabel} required to pass ({thresholdPct.toFixed(1)}% For)
              {forPct >= thresholdPct ? " — threshold met" : " — threshold not met"}
            </p>
          </div>
          <div className="border-t border-white/10 px-4 py-3">
            <VotePanel proposalId={proposal.id} state={proposal.state} />
            <p className="mt-2 text-[11px] text-gray-600">Submits a real vote to the openfiat-governance program on Solana devnet.</p>
          </div>
          <div className="border-t border-white/10 px-4 py-3 text-xs text-gray-500">
            <span className="text-gray-400">Proposal deposit:</span> {toOpen(proposal.stakeDeposit).toLocaleString()} OPEN
            {!proposal.depositSettled
              ? " — held until tally_and_finalize + refund_or_forfeit_deposit run"
              : proposal.quorumMet
                ? " — refunded (quorum was met)"
                : " — forfeited to the Ecosystem Treasury (quorum wasn't met)"}
          </div>
        </Panel>
      </div>
    </section>
  );
}
