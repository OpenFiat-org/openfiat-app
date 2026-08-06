"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { ChainLinkPanel } from "@/components/governance/chain-link-panel";
import { NodeVotePanel } from "@/components/governance/node-vote-panel";
import { ProposalCategoryBadge } from "@/components/governance/proposal-category-badge";
import { Panel } from "@/components/panel";
import { PeerIdentity } from "@/components/peer-identity";
import { StatusPill } from "@/components/status-pill";
import { formatDateMs } from "@/lib/format";
import {
  fetchNodeProposal,
  fetchProposalChainLink,
  votePreview,
  votingClosed,
  type NodeProposal,
  type ProposalChainLink,
} from "@/lib/live-proposals";
import { formatBaseUnits } from "@/lib/live-vaults";
import { NODE_CHANGED_EVENT, readNodeSelection } from "@/lib/node-preference";
import { peerIdForAddress } from "@/lib/peer-id";
import { OPEN_DECIMALS } from "@/lib/staking-roles";
import {
  WALLET_CHANGED_EVENT,
  readWalletConnection,
  type WalletConnection,
} from "@/lib/wallet-connection";

/**
 * One network proposal, read from the node the user has selected.
 *
 * # Title and summary come from here, and only from here
 *
 * The on-chain `Proposal` account stores `title_hash` and `summary_hash`
 * and nothing else, so the chain can prove a text was not altered and can
 * never tell you what it said. This record carries the words the author
 * signed. That asymmetry is why the two registers are shown side by side
 * rather than merged.
 *
 * # The tallies here are not the outcome
 *
 * They are what *this node* has verified — a vote reaches local state only
 * after its weight has been confirmed against on-chain stake, so a node
 * without a Solana endpoint holds none and would report unanimous silence.
 * The resolution comes from the chain's `tally_and_finalize`, adopted
 * rather than recomputed. Every number below is labelled accordingly.
 */
export function ProposalDetail({ id }: { id: string }) {
  const t = useTranslations("governance");
  const [proposal, setProposal] = useState<NodeProposal | null | undefined>(undefined);
  const [link, setLink] = useState<ProposalChainLink | null>(null);
  const [error, setError] = useState(false);
  const [wallet, setWallet] = useState<WalletConnection | null>(null);

  const load = useCallback(() => {
    const endpoint = readNodeSelection().url;
    setError(false);
    fetchNodeProposal(id, endpoint)
      .then((row) => {
        setProposal(row);
        if (row) {
          // Failing to read the link is not failing to read the proposal:
          // the proposal still renders, and the panel simply is not shown.
          fetchProposalChainLink(id, endpoint)
            .then(setLink)
            .catch(() => setLink(null));
        }
      })
      .catch(() => {
        setProposal(undefined);
        setError(true);
      });
  }, [id]);

  useEffect(() => {
    load();
    window.addEventListener(NODE_CHANGED_EVENT, load);
    return () => window.removeEventListener(NODE_CHANGED_EVENT, load);
  }, [load]);

  useEffect(() => {
    const update = () => setWallet(readWalletConnection());
    update();
    window.addEventListener(WALLET_CHANGED_EVENT, update);
    return () => window.removeEventListener(WALLET_CHANGED_EVENT, update);
  }, []);

  if (error) return <p className="text-sm text-amber-300">{t("nodeNoAnswer")}</p>;
  if (proposal === undefined) return <p className="text-sm text-gray-500">{t("readingProposal")}</p>;
  if (proposal === null) {
    return (
      <div className="max-w-2xl space-y-2">
        <p className="text-sm text-gray-300">{t("noProposalId")}</p>
        <p className="text-xs leading-relaxed text-gray-500">
          {t("noProposalIdNote")}
        </p>
      </div>
    );
  }

  const totals = votePreview(proposal);
  const myPeerId = wallet ? peerIdForAddress(wallet.address) : null;
  const closed = votingClosed(proposal);

  return (
    <div className="max-w-3xl">
      <Link href="/governance" className="text-sm text-gray-500 hover:text-white">
        {t("backToGovernance")}
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold text-white">{proposal.title}</h1>
        <StatusPill
          status={proposal.status === "Voting" ? "Active" : proposal.status}
          label={t(`status.${proposal.status === "Voting" ? "Active" : proposal.status}`)}
        />
        <ProposalCategoryBadge category={proposal.category} />
      </div>
      <p className="mt-1 font-mono text-xs text-gray-600">{proposal.id}</p>

      <div className="mt-8 space-y-6">
        <Panel title={t("summaryTitle")}>
          {/* Rendered as text, never as markup: it is a stranger's prose
              arriving over gossip, and React escapes it by construction. */}
          <p className="whitespace-pre-wrap px-4 py-3 text-sm leading-relaxed text-gray-300">
            {proposal.summary}
          </p>
          <dl className="divide-y divide-white/5 border-t border-white/10 px-4 text-sm">
            <Row label={t("rowAuthor")}>
              <PeerIdentity peer={proposal.author} isYou={proposal.author === myPeerId} />
            </Row>
            <Row label={t("rowCreated")}>{formatDateMs(proposal.created_at)}</Row>
            <Row label={closed ? t("votingClosedLabel") : t("votingClosesLabel")}>
              {formatDateMs(proposal.voting_closes_at)}
            </Row>
          </dl>
        </Panel>

        <Panel title={t("verifiedVotesTitle")}>
          <dl className="divide-y divide-white/5 px-4 text-sm">
            <Row label={t("rowApprove")}>{formatBaseUnits(BigInt(totals.approve), OPEN_DECIMALS)} OPEN</Row>
            <Row label={t("rowReject")}>{formatBaseUnits(BigInt(totals.reject), OPEN_DECIMALS)} OPEN</Row>
            <Row label={t("rowAbstain")}>{formatBaseUnits(BigInt(totals.abstain), OPEN_DECIMALS)} OPEN</Row>
            <Row label={t("rowVoters")}>{totals.voters}</Row>
          </dl>
          <p className="border-t border-white/10 px-4 py-3 text-xs leading-relaxed text-gray-500">
            {t.rich("verifiedVotesNote", { code: (c) => <code>{c}</code> })}
          </p>
        </Panel>

        <Panel title={t("castVoteTitle")}>
          <NodeVotePanel
            proposal={proposal}
            wallet={wallet}
            myPeerId={myPeerId}
            onVoted={load}
          />
        </Panel>

        {link && (
          <Panel title={t("onChainTitle")}>
            <ChainLinkPanel link={link} />
          </Panel>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-gray-500">{label}</dt>
      <dd className="min-w-0 text-right text-gray-200">{children}</dd>
    </div>
  );
}
