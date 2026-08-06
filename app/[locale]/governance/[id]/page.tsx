import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "governance" });
  return { title: t("proposalMetaTitle") };
}

/** The three distinct approval bars, keyed by their supermajority percentage. */
function thresholdKey(pct: number): string {
  return pct >= 66 ? "super66" : pct >= 60 ? "super60" : "simple";
}

export default async function ProposalPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "governance" });
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
        {t("backToGovernance")}
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className="font-mono text-sm text-gray-500">#{proposal.id.toString()}</span>
        <h1 className="font-mono text-lg font-semibold text-white">{hashFingerprint(proposal.titleHash)}</h1>
        <StatusPill status={statusLabel(proposal)} label={t(`status.${statusLabel(proposal)}`)} />
        <CategoryBadge category={category} />
      </div>
      <p className="mt-1 text-sm text-gray-500">{votingEndsLabel(proposal)}</p>

      <div className="mt-8 space-y-6">
        <Panel title={t("onchainRecordTitle")}>
          <div className="space-y-1.5 px-4 py-3 text-sm text-gray-300">
            <p>
              {t.rich("onchainRecordBody", {
                titleHash: hashFingerprint(proposal.titleHash),
                summaryHash: hashFingerprint(proposal.summaryHash),
                m: (c) => <span className="font-mono text-xs text-gray-500">{c}</span>,
              })}
            </p>
            <p className="text-xs text-gray-500">
              {t("proposerLabel")} <span className="font-mono">{proposal.proposer.toBase58()}</span>
            </p>
          </div>
        </Panel>

        <Panel title={t("votesTitle")}>
          <div className="space-y-1.5 px-4 py-3">
            <VoteBar label={t("forLabel")} pct={forPct} cls="bg-emerald-500" />
            <VoteBar label={t("againstLabel")} pct={againstPct} cls="bg-red-400" />
            <p className="pt-1 text-xs tabular-nums text-gray-500">
              {t("turnoutLine", {
                pct: turnout.toFixed(1),
                met: proposal.quorumMet ? "reached" : "notReached",
              })}
            </p>
            <p className="text-xs tabular-nums text-gray-500">
              {t("thresholdLine", {
                threshold: t(`threshold.${thresholdKey(rule.approvalThresholdPct)}`),
                pct: thresholdPct.toFixed(1),
                met: forPct >= thresholdPct ? "met" : "notMet",
              })}
            </p>
          </div>
          <div className="border-t border-white/10 px-4 py-3">
            <VotePanel proposalId={proposal.id} state={proposal.state} />
            <p className="mt-2 text-[11px] text-gray-600">{t("votePanelNote")}</p>
          </div>
          <div className="border-t border-white/10 px-4 py-3 text-xs text-gray-500">
            <span className="text-gray-400">{t("depositLabel")}</span> {toOpen(proposal.stakeDeposit).toLocaleString()} OPEN
            {t(`depositState.${!proposal.depositSettled ? "held" : proposal.quorumMet ? "refunded" : "forfeited"}`)}
          </div>
        </Panel>
      </div>
    </section>
  );
}
