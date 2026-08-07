"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { DataTable, Td, Th, Tr } from "@/components/data-table";
import { MetricStrip } from "@/components/metrics";
import { Panel } from "@/components/panel";
import { formatNumber, sinceLabel } from "@/lib/format";
import { exchangeRecord, fetchPeers, type PeerView } from "@/lib/live-peers";
import {
  fetchSnapshotState,
  formatBytes,
  replayGap,
  type SnapshotState,
} from "@/lib/live-snapshots";
import { NODE_CHANGED_EVENT, readNodeSelection } from "@/lib/node-preference";
import { shortPeerId } from "@/lib/peer-id";

/**
 * What one node is connected to and what it holds — the operator's half of
 * the network view.
 *
 * # Why this is about the selected node and not the cluster
 *
 * `LiveNetwork` above answers "which nodes exist and can I reach them",
 * which is a question about the network. This answers "what is the node I
 * am actually talking to doing", which is a question about one node, and
 * the two must not be merged: a peer table is the answering node's own
 * discovery cache, and presenting it as the network's peer list would be
 * this app promoting one node's local view into a census.
 *
 * That is also why every figure here is attributed on screen, and why
 * switching the access node re-asks rather than merging.
 *
 * # The caveat this retires
 *
 * `LiveNetwork` ends with "Peer count and version are still absent because
 * no method this app calls reports them." `getPeers` has reported both the
 * whole time. It also reports what a node announces itself as reachable at,
 * which is the thing an operator checking whether `--external-addr` took
 * effect has nowhere else to look for.
 */
export function NodeOperations() {
  const t = useTranslations("network");
  const locale = useLocale();
  const section = useRef<HTMLElement>(null);
  /**
   * Whether this section has been reached, and therefore whether it is
   * entitled to ask the node anything.
   *
   * Four calls — the peer table and three snapshot reads — for a section
   * that starts well below the fold on any phone. Firing them at mount
   * made a reader who never scrolled here pay for them anyway, and worse,
   * they competed with the cluster view above for the browser's handful of
   * connections to the same host: on a WebKit phone under load the nodes
   * table above took five seconds to appear instead of half a one.
   *
   * So the reads wait until the section is near the viewport. Nothing is
   * hidden by this — the panel says it is asking, and then says what it
   * got.
   */
  const [reached, setReached] = useState(false);
  const [nodeLabel, setNodeLabel] = useState("");
  const [peers, setPeers] = useState<PeerView | null>(null);
  const [snapshots, setSnapshots] = useState<SnapshotState | null>(null);
  /*
   * Per read, not one flag for the pair. A node with a healthy peer table
   * can still fail the snapshot calls, and reporting both as unreachable
   * because one was would be a claim about a surface that answered.
   */
  const [peersFailed, setPeersFailed] = useState(false);
  const [snapshotsFailed, setSnapshotsFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const selection = readNodeSelection();
    setNodeLabel(selection.label);
    setLoading(true);
    setPeersFailed(false);
    setSnapshotsFailed(false);
    const [peerResult, snapshotResult] = await Promise.allSettled([
      fetchPeers(selection.url),
      fetchSnapshotState(selection.url),
    ]);
    if (peerResult.status === "fulfilled") setPeers(peerResult.value);
    else {
      setPeers(null);
      setPeersFailed(true);
    }
    if (snapshotResult.status === "fulfilled") setSnapshots(snapshotResult.value);
    else {
      setSnapshots(null);
      setSnapshotsFailed(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const element = section.current;
    // No observer — an old browser, or a test environment — means load it
    // rather than never load it. Degrading to eager is the safe direction:
    // the cost is a request, and the alternative is a section that stays
    // empty forever with nothing to say why.
    if (!element || typeof IntersectionObserver === "undefined") {
      setReached(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setReached(true);
        // One-way: once asked, the node-changed listener below keeps this
        // fresh, and re-arming on every scroll past would re-ask for
        // nothing.
        observer.disconnect();
      },
      /*
       * No margin, deliberately. Pre-fetching a screen early is the usual
       * instinct and it is wrong here: the node this app talks to handles
       * its RPCs on one thread, so four speculative calls do not overlap
       * the cluster view's registry read above — they queue in front of
       * it. Starting them a screen early made the nodes table take five
       * seconds to appear on a phone instead of half of one, which is a
       * worse trade than any amount of scroll latency on a section the
       * reader may never open.
       */
      { rootMargin: "0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!reached) return;
    void load();
    window.addEventListener(NODE_CHANGED_EVENT, load);
    return () => window.removeEventListener(NODE_CHANGED_EVENT, load);
  }, [load, reached]);

  const latestSlot = snapshots?.latest?.slot ?? null;
  const gap = replayGap(snapshots?.checkpointSlot ?? null, latestSlot);

  return (
    <section className="mt-14" ref={section}>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
        {t("yourAccessNodeHeading")}
      </h2>
      <p className="mt-2 max-w-3xl text-xs leading-relaxed text-gray-500">
        {t("accessNodeIntro", { node: nodeLabel || t("yourAccessNode") })}
      </p>

      <div className="mt-5">
        <MetricStrip
          items={[
            {
              label: t("metricPeers"),
              value: loading ? "…" : peersFailed ? "—" : String(peers?.peers.length ?? 0),
              sub: peersFailed ? t("nodeDidNotAnswer") : t("peersSub"),
            },
            {
              label: t("metricNewestSnapshot"),
              value:
                loading || snapshotsFailed
                  ? loading
                    ? "…"
                    : "—"
                  : latestSlot === null
                    ? t("none")
                    : formatNumber(latestSlot, 0),
              sub: snapshotsFailed ? t("nodeDidNotAnswer") : t("newestSnapshotSub"),
            },
            {
              label: t("metricCheckpoint"),
              value:
                loading || snapshotsFailed
                  ? loading
                    ? "…"
                    : "—"
                  : snapshots?.checkpointSlot == null
                    ? t("none")
                    : formatNumber(snapshots.checkpointSlot, 0),
              sub:
                snapshots?.checkpointSlot == null && !loading && !snapshotsFailed
                  ? t("checkpointNoneSub")
                  : t("checkpointSub"),
            },
          ]}
        />
      </div>

      {peers && (
        <p className="mt-5 break-all font-mono text-[11px] leading-relaxed text-gray-600">
          <span className="font-sans text-gray-500">{t("ownPeerId")} </span>
          {peers.selfPeerId}
          <br />
          <span className="font-sans text-gray-500">{t("announcesAt")} </span>
          {peers.announcedAddresses.length > 0
            ? peers.announcedAddresses.join("  ·  ")
            : t("announcesNothing")}
        </p>
      )}

      <h3 className="mt-10 text-sm font-semibold uppercase tracking-wider text-gray-400">{t("peersHeading")}</h3>
      <div className="mt-3">
        {loading ? (
          <p className="text-sm text-gray-500">{t("askingNode")}</p>
        ) : peersFailed ? (
          <p className="text-sm text-amber-300">
            {t.rich("peersFailed", {
              node: nodeLabel || t("thisNode"),
              code: (chunks) => <code className="font-mono">{chunks}</code>,
            })}
          </p>
        ) : peers && peers.peers.length === 0 ? (
          <p className="max-w-3xl text-sm leading-relaxed text-gray-400">
            {t("peersEmpty")}
          </p>
        ) : (
          <DataTable
            minWidth={860}
            head={
              <tr>
                <Th>{t("colPeer")}</Th>
                <Th className="w-32">{t("colVersion")}</Th>
                <Th className="w-56">{t("colDeclaredRoles")}</Th>
                <Th right className="w-28">{t("colLastSeen")}</Th>
                <Th right className="w-24">{t("colLatency")}</Th>
                <Th right className="w-32">{t("colExchanges")}</Th>
              </tr>
            }
          >
            {peers?.peers.map((peer) => (
              <Tr key={peer.peerId}>
                <Td py="py-4">
                  <span className="font-mono text-gray-200">{shortPeerId(peer.peerId)}</span>
                  <span
                    className="mt-1 block truncate font-mono text-[11px] text-gray-600"
                    title={peer.peerId}
                  >
                    {peer.peerId}
                  </span>
                </Td>
                {/* The peer's own word, from its handshake. So are the roles
                    and the OFS list beside them — none of it is checked by
                    the node reporting it, and none of it is ticked here. */}
                <Td py="py-4" className="w-32 font-mono text-xs text-gray-400">
                  {peer.nodeVersion || "—"}
                </Td>
                <Td py="py-4" className="w-56">
                  {peer.roles.length === 0 ? (
                    <span className="text-xs text-gray-600">{t("noneDeclared")}</span>
                  ) : (
                    <span className="flex flex-wrap gap-1 max-lg:justify-end">
                      {peer.roles.map((role) => (
                        <span
                          key={role}
                          className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-gray-400"
                        >
                          {role}
                        </span>
                      ))}
                    </span>
                  )}
                </Td>
                <Td py="py-4" right className="w-28 text-xs text-gray-400">
                  {sinceLabel(peer.lastSeen, locale)}
                </Td>
                {/* Never zero for "never measured": a peer this node has not
                    timed and one that answers instantly are different facts. */}
                <Td py="py-4" right num className="w-24 text-gray-400">
                  {peer.latencyMs === null ? "—" : t("latencyMs", { ms: peer.latencyMs })}
                </Td>
                <Td py="py-4" right className="w-32 text-xs text-gray-400">
                  {(() => {
                    const rec = exchangeRecord(peer);
                    return rec ? (
                      t("exchangeRecord", { ok: rec.successes, failed: rec.failures })
                    ) : (
                      <span className="text-gray-600">{t("notYetTried")}</span>
                    );
                  })()}
                </Td>
              </Tr>
            ))}
          </DataTable>
        )}
      </div>

      <h3 className="mt-10 text-sm font-semibold uppercase tracking-wider text-gray-400">
        {t("snapshotsHeading")}
      </h3>
      <p className="mt-2 max-w-3xl text-xs leading-relaxed text-gray-500">
        {t("snapshotsIntro")}
        {gap !== null && gap > 0 && (
          <> {t("checkpointBehind", { gap: formatNumber(gap, 0) })}</>
        )}
      </p>
      <div className="mt-3">
        {loading ? (
          <p className="text-sm text-gray-500">{t("askingNode")}</p>
        ) : snapshotsFailed ? (
          <p className="text-sm text-amber-300">
            {t("snapshotsFailed", { node: nodeLabel || t("thisNode") })}
          </p>
        ) : snapshots && snapshots.snapshots.length === 0 ? (
          <p className="max-w-3xl text-sm leading-relaxed text-gray-400">
            {t("snapshotsEmpty")}
          </p>
        ) : (
          <DataTable
            minWidth={860}
            head={
              <tr>
                <Th>{t("colSnapshot")}</Th>
                <Th right className="w-32">{t("colSlot")}</Th>
                <Th className="w-44">{t("colProducedBy")}</Th>
                <Th right className="w-24">{t("colSize")}</Th>
                <Th right className="w-28">{t("colAge")}</Th>
                <Th className="w-24">{t("colDownload")}</Th>
              </tr>
            }
          >
            {snapshots?.snapshots.map((snapshot) => (
              <Tr
                key={snapshot.id}
                className={snapshot.id === snapshots.latest?.id ? "bg-white/[0.02]" : ""}
              >
                <Td py="py-4">
                  <span className="font-mono text-xs break-all text-gray-300">{snapshot.id}</span>
                  {snapshot.id === snapshots.latest?.id && (
                    <span className="mt-1 block text-[11px] text-brand-teal">
                      {t("wouldHandJoiner")}
                    </span>
                  )}
                </Td>
                <Td py="py-4" right num className="w-32 text-gray-200">
                  {formatNumber(snapshot.slot, 0)}
                </Td>
                <Td py="py-4" className="w-44">
                  <span className="font-mono text-xs text-gray-400" title={snapshot.producer}>
                    {shortPeerId(snapshot.producer)}
                  </span>
                </Td>
                <Td py="py-4" right num className="w-24 text-gray-400">
                  {formatBytes(snapshot.sizeBytes)}
                </Td>
                <Td py="py-4" right className="w-28 text-xs text-gray-400">
                  {sinceLabel(snapshot.createdAt, locale)}
                </Td>
                <Td py="py-4" className="w-24">
                  {snapshot.locations.length === 0 ? (
                    <span className="text-xs text-gray-600">{t("noLocation")}</span>
                  ) : (
                    <span className="flex flex-col gap-1 max-lg:items-end">
                      {snapshot.locations.map((location) => (
                        <a
                          key={location}
                          href={location}
                          // The producer's own server, named in their signed
                          // announcement. `noreferrer` so following it does
                          // not tell them which page you came from.
                          rel="noopener noreferrer nofollow"
                          className="text-xs text-brand-hover hover:underline"
                        >
                          {hostOf(location)}
                        </a>
                      ))}
                    </span>
                  )}
                </Td>
              </Tr>
            ))}
          </DataTable>
        )}
      </div>

      <Panel className="mt-6">
        <p className="px-4 py-3 text-xs leading-relaxed text-gray-500">
          {t.rich("snapshotRootNote", {
            em: (chunks) => <em>{chunks}</em>,
            sr: (chunks) => (
              <a href="/providers" className="text-brand-hover hover:underline">
                {chunks}
              </a>
            ),
          })}
        </p>
      </Panel>
    </section>
  );
}

/** The host of a download URL — the part that says whose server it is. */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
