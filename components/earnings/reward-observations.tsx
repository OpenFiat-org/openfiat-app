"use client";

import { useCallback, useEffect, useState } from "react";

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
        Node reward observations
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gray-400">
        If you run a node rather than a registered service, this is where your work is measured.
        Nothing above applies to you — a node is not billed for and has no statement to sign a
        challenge for. It is paid out of the reward pool, and these are the observations the
        schedule is computed from.
      </p>
      <p className="mt-2 max-w-3xl text-xs leading-relaxed text-gray-500">
        This is what {nodeLabel || "your access node"} saw of everyone else, and no more than that.
        Finding out what the network saw of <em>your</em> node means asking somebody else&apos;s
        node — which is the point of publishing it: two nodes that disagree here are visible, where
        two nodes each computing privately would not be.
      </p>

      <div className="mt-5">
        {loading ? (
          <p className="text-sm text-gray-500">Asking the node…</p>
        ) : failed ? (
          <p className="text-sm text-amber-300">
            {nodeLabel || "This node"} did not answer{" "}
            <code className="font-mono">getRewardObservations</code>. Nothing here says whether it
            observed anybody.
          </p>
        ) : observations ? (
          <>
            <p className="text-xs text-gray-500">
              Epoch <span className="font-mono text-gray-300">{observations.epoch}</span> ·{" "}
              {formatDateShortMs(observations.epochStartMillis)} to{" "}
              {formatDateShortMs(observations.epochEndMillis)}
            </p>
            {observations.peers.length === 0 ? (
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-gray-400">
                This node observed nobody in that epoch. It answered, so this is a real state with
                two ordinary readings: it heard from no peer at all, or the epoch has already been
                paid and its ledger pruned. Neither is a failure to ask — see the peer table on{" "}
                <a href="/network" className="text-brand-hover hover:underline">
                  Network
                </a>{" "}
                for which of the two it is.
              </p>
            ) : (
              <div className="mt-3">
                <DataTable
                  minWidth={720}
                  head={
                    <tr>
                      <Th>Peer</Th>
                      <Th right className="w-32">Availability</Th>
                      <Th right className="w-32">Connectivity</Th>
                      <Th className="w-48">Chain announcement</Th>
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
                          ? "Seen announcing a blockhash"
                          : "Not seen announcing one"}
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
          <span className="text-gray-300">Availability</span> is presence per slice of the epoch:
          in each slice, was anything at all heard signed by that peer? It saturates at one per
          slice on purpose, so flooding the network earns nothing extra and losing a propagation
          race costs nothing — counting announcements instead would have measured who announced
          first and paid a well-connected node more than an equally available one behind a slower
          link.
        </p>
        <p>
          <span className="text-gray-300">Connectivity</span> is the higher multiplier for a node
          seen originating a chain-bridge announcement, and it is{" "}
          <span className="text-gray-300">claimed rather than proven</span>. A gossip-only node can
          take a blockhash and slot it heard from somebody else and re-announce it under its own
          signature; nothing in the envelope tells the two apart. OFS-4100 §9.2 says the problem is
          not solved by that specification, and the floor for gossip-only nodes limits what the lie
          is worth rather than preventing it. So it is reported and not ticked.
        </p>
        <p>
          There is <span className="text-gray-300">no amount here</span>, and it is not an
          omission. Converting these into tokens needs every candidate&apos;s on-chain stake, which
          the node&apos;s read path cannot fetch — so it publishes no schedule rather than
          publishing an empty one that looks like a working answer. This app will not compute one
          either: a figure invented in a browser is not what anybody would be paid.
        </p>
      </div>
    </section>
  );
}
