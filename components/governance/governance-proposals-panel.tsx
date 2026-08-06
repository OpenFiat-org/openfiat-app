"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { fetchAllProposals } from "@/lib/live-governance";
import type { DecodedProposal } from "@/lib/onchain-decode";
import { categoryLabel, hashFingerprint, statusLabel, turnoutPct, votePercentages, votingEndsLabel } from "@/lib/proposal-display";
import { DataTable, Td, Th, Tr } from "@/components/data-table";
import { CategoryBadge } from "@/components/governance/category-badge";
import { StatusPill } from "@/components/status-pill";
import { VoteStack } from "@/components/governance/vote-bar";

export function GovernanceProposalsPanel() {
  const t = useTranslations("governance");
  const [proposals, setProposals] = useState<DecodedProposal[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchAllProposals()
      .then((rows) => !cancelled && setProposals(rows))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p className="text-sm text-amber-300">{t("reachDevnetError")}</p>;
  if (proposals === null) return <p className="text-sm text-gray-500">{t("loadingDevnet")}</p>;
  if (proposals.length === 0) {
    return <p className="text-sm text-gray-500">{t("noOnchain")}</p>;
  }

  return (
    <DataTable
      minWidth={900}
      head={
        <tr>
          <Th>{t("colProposal")}</Th>
          <Th className="w-28">{t("colCategory")}</Th>
          <Th className="w-64">{t("colVotesForAgainst")}</Th>
          <Th className="w-24">{t("colTurnoutQuorum")}</Th>
          <Th className="w-32">{t("colVoting")}</Th>
          <Th right className="w-24">{t("colStatus")}</Th>
        </tr>
      }
    >
      {proposals.map((p) => {
        const { forPct, againstPct } = votePercentages(p);
        return (
          <Tr key={p.id.toString()}>
            <Td py="py-5">
              <Link href={`/governance/${p.id}`} className="group">
                <span className="mr-2 font-mono text-xs text-gray-500">#{p.id.toString()}</span>
                <span className="font-mono text-xs text-white group-hover:text-brand-hover">
                  {hashFingerprint(p.titleHash)}
                </span>
              </Link>
            </Td>
            <Td py="py-5" className="w-28">
              <CategoryBadge category={categoryLabel(p.category)} />
            </Td>
            <Td py="py-5" className="w-64">
              <VoteStack forPct={forPct} againstPct={againstPct} />
            </Td>
            <Td py="py-5" className="w-24 text-xs tabular-nums text-gray-500">
              {turnoutPct(p).toFixed(0)}%
              {p.quorumMet && <span className="text-emerald-400"> ✓</span>}
            </Td>
            <Td py="py-5" className="w-32 text-xs text-gray-500">{votingEndsLabel(p)}</Td>
            <Td py="py-5" right className="w-24"><StatusPill status={statusLabel(p)} label={t(`status.${statusLabel(p)}`)} /></Td>
          </Tr>
        );
      })}
    </DataTable>
  );
}
