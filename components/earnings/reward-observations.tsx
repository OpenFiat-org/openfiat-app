"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { DataTable, Td, Th, Tr } from "@/components/data-table";
import { formatDateShortMs } from "@/lib/format";
import {
  fetchRewardObservations,
  formatBps,
  type EpochObservations,
} from "@/lib/live-rewards";
import { NODE_CHANGED_EVENT, readNodeSelection } from "@/lib/node-preference";
import { shortPeerId } from "@/lib/peer-id";

/**
 * What a node operator earned, and why — the part of `/earnings` that is
 * not a provider statement.
 *
 * # Why it sits under the earnings console rather than beside it
 *
 * They are two different roles that happen to share a page. The console
 * answers for a registered *service* and requires proving you control it.
 * This answers for a *node*, it is public by design (OFS-4100 §9.4 makes
 * the observations publishable precisely so a schedule can be recomputed
 * and checked), and it needs no wallet at all.
 *
 * The console's own copy explains that every service statement reads zero
 * because nothing credits the ledger. A node operator reading that could
 * reasonably conclude nothing about their work is measured anywhere. It is:
 * this is the measurement, and it has been running the whole time.
 *
 * # No amount is shown, and none can be
 *
 * There is deliberately no `getRewardSchedule` on the node — turning these
 * observations into amounts needs every candidate's on-chain stake, and the
 * node's own comment says a method that answered anyway "would return an
 * empty schedule every time while looking like a working endpoint".
 * Multiplying basis points into tokens here would be that method rebuilt in
 * a browser, with less claim to be right. So this shows the two inputs and
 * says what is missing.
 */
export function RewardObservations() {
  const t = useTranslations("earnings");
  const [nodeLabel, setNodeLabel] = useState("");
  const [observations, setObservations] = useState<EpochObservations | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const selection = readNodeSelection();
    setNodeLabel(selection.label);
    setLoading(true);
    setFailed(false);
    try {
      // No epoch: the node answers for the most recently completed one,
      // which is the only one worth asking about — the in-flight epoch's
      // answer would change under the reader mid-page.
      setObservations(await fetchRewardObservations(selection.url));
    } catch {
      setObservations(null);
      setFailed(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    window.addEventListener(NODE_CHANGED_EVENT, load);
    return () => window.removeEventListener(NODE_CHANGED_EVENT, load);
  }, [load]);

  return (
    <section className="mt-14">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
        {t("obsHeading")}
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gray-400">
        {t("obsIntro")}
      </p>
      <p className="mt-2 max-w-3xl text-xs leading-relaxed text-gray-500">
        {t.rich("obsNodeSaw", {
          node: nodeLabel || t("yourAccessNode"),
          em: (chunks) => <em>{chunks}</em>,
        })}
      </p>

      <div className="mt-5">
        {loading ? (
          <p className="text-sm text-gray-500">{t("obsAsking")}</p>
        ) : failed ? (
          <p className="text-sm text-amber-300">
            {t.rich("obsFailed", {
              node: nodeLabel || t("thisNode"),
              code: (chunks) => <code className="font-mono">{chunks}</code>,
            })}
          </p>
        ) : observations ? (
          <>
            <p className="text-xs text-gray-500">
              {t.rich("obsEpoch", {
                epoch: observations.epoch,
                start: formatDateShortMs(observations.epochStartMillis),
                end: formatDateShortMs(observations.epochEndMillis),
                e: (chunks) => <span className="font-mono text-gray-300">{chunks}</span>,
              })}
            </p>
            {observations.peers.length === 0 ? (
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-gray-400">
                {t.rich("obsObservedNobody", {
                  a: (chunks) => (
                    <a href="/network" className="text-brand-hover hover:underline">
                      {chunks}
                    </a>
                  ),
                })}
              </p>
            ) : (
              <div className="mt-3">
                <DataTable
                  minWidth={720}
                  head={
                    <tr>
                      <Th>{t("colPeer")}</Th>
                      <Th right className="w-32">{t("colAvailability")}</Th>
                      <Th right className="w-32">{t("colConnectivity")}</Th>
                      <Th className="w-48">{t("colChainAnnouncement")}</Th>
                    </tr>
                  }
                >
                  {observations.peers.map((peer) => (
                    <Tr key={peer.peer}>
                      <Td py="py-4">
                        <span className="font-mono text-gray-200">{shortPeerId(peer.peer)}</span>
                        <span
                          className="mt-1 block truncate font-mono text-[11px] text-gray-600"
                          title={peer.peer}
                        >
                          {peer.peer}
                        </span>
                      </Td>
                      <Td py="py-4" right num className="w-32 text-gray-200">
                        {formatBps(peer.availabilityBps)}
                      </Td>
                      <Td py="py-4" right num className="w-32 text-gray-200">
                        {formatBps(peer.connectivityBps)}
                      </Td>
                      {/* Deliberately not a tick. See the note below the
                          table on why this one is spoofable. */}
                      <Td py="py-4" className="w-48 text-xs text-gray-400">
                        {peer.announcedBlockhash
                          ? t("seenAnnouncing")
                          : t("notSeenAnnouncing")}
                      </Td>
                    </Tr>
                  ))}
                </DataTable>
              </div>
            )}
          </>
        ) : null}
      </div>

      <div className="mt-6 space-y-3 rounded-md border border-white/10 px-4 py-4 text-xs leading-relaxed text-gray-500">
        <p>
          {t.rich("obsAvailability", { b: (chunks) => <span className="text-gray-300">{chunks}</span> })}
        </p>
        <p>
          {t.rich("obsConnectivity", { b: (chunks) => <span className="text-gray-300">{chunks}</span> })}
        </p>
        <p>
          {t.rich("obsNoAmount", { b: (chunks) => <span className="text-gray-300">{chunks}</span> })}
        </p>
      </div>
    </section>
  );
}
