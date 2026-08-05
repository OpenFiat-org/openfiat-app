"use client";

import { Link } from "@/i18n/navigation";
import { useEffect, useState } from "react";

import { DataTable, Td, Th, Tr } from "@/components/data-table";
import { ProposalCategoryBadge } from "@/components/governance/proposal-category-badge";
import { StatusPill } from "@/components/status-pill";
import { formatDateShortMs } from "@/lib/format";
import { fetchNodeProposals, votingClosed, type NodeProposal } from "@/lib/live-proposals";
import { NODE_CHANGED_EVENT, readNodeSelection } from "@/lib/node-preference";
import { shortPeerId } from "@/lib/peer-id";

/**
 * Proposals as the network holds them, which is the only place their text
 * exists.
 *
 * The on-chain table below this one shows hashes, because the program
 * stores hashes; this shows the titles and summaries their authors signed
 * and gossiped. Neither is "the" proposal list — a proposal may exist in
 * one register, the other, or both — so they are two panels that say which
 * register they are reading rather than one merged list that could not.
 */
export function NetworkProposalsPanel() {
  const [proposals, setProposals] = useState<NodeProposal[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      setProposals(null);
      setError(null);
      fetchNodeProposals(readNodeSelection().url)
        .then((rows) => !cancelled && setProposals(rows))
        .catch(() => !cancelled && setError("Your access node did not answer."));
    };
    load();
    window.addEventListener(NODE_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(NODE_CHANGED_EVENT, load);
    };
  }, []);

  if (error) return <p className="text-sm text-amber-300">{error}</p>;
  if (proposals === null) return <p className="text-sm text-gray-500">Reading proposals…</p>;
  if (proposals.length === 0) {
    return (
      <p className="max-w-2xl text-sm leading-relaxed text-gray-500">
        This node holds no proposals. Proposals are gossiped, so a node that has replicated less of
        the network reports fewer of them — an empty list means this node has seen none, not that
        none exist.
      </p>
    );
  }

  return (
    <DataTable
      minWidth={860}
      head={
        <tr>
          <Th>Proposal</Th>
          <Th className="w-32">Category</Th>
          <Th className="w-40">Author</Th>
          <Th className="w-40">Voting</Th>
          <Th right className="w-28">
            Status
          </Th>
        </tr>
      }
    >
      {proposals.map((proposal) => (
        <Tr key={proposal.id}>
          <Td py="py-4">
            <Link href={`/governance/proposal/${encodeURIComponent(proposal.id)}`} className="group">
              <span className="block text-sm text-white group-hover:text-brand-hover">
                {proposal.title}
              </span>
              <span className="mt-0.5 block font-mono text-[11px] text-gray-600">{proposal.id}</span>
            </Link>
          </Td>
          <Td py="py-4" className="w-32">
            <ProposalCategoryBadge category={proposal.category} />
          </Td>
          <Td py="py-4" className="w-40 font-mono text-xs text-gray-500">
            {shortPeerId(proposal.author)}
          </Td>
          <Td py="py-4" className="w-40 text-xs text-gray-500">
            {votingClosed(proposal) ? "Closed " : "Closes "}
            {formatDateShortMs(proposal.voting_closes_at)}
          </Td>
          <Td py="py-4" right className="w-28">
            <StatusPill status={proposal.status === "Voting" ? "Active" : proposal.status} />
          </Td>
        </Tr>
      ))}
    </DataTable>
  );
}
