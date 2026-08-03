"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
        Your access node
      </h2>
      <p className="mt-2 max-w-3xl text-xs leading-relaxed text-gray-500">
        Everything below is {nodeLabel || "your access node"}&apos;s own answer about itself — its
        peer table, and the snapshots it knows about. Another node will give different figures for
        all of it, honestly: a peer list is one node&apos;s discovery cache, and latency and
        exchange counts are its own experience of each peer rather than anybody&apos;s verdict.
      </p>

      <div className="mt-5">
        <MetricStrip
          items={[
            {
              label: "Peers",
              value: loading ? "…" : peersFailed ? "—" : String(peers?.peers.length ?? 0),
              sub: peersFailed ? "node did not answer" : "in this node's discovery cache",
            },
            {
              label: "Newest snapshot",
              value:
                loading || snapshotsFailed
                  ? loading
                    ? "…"
                    : "—"
                  : latestSlot === null
                    ? "None"
                    : formatNumber(latestSlot, 0),
              sub: snapshotsFailed ? "node did not answer" : "slot it captures state at",
            },
            {
              label: "Checkpoint",
              value:
                loading || snapshotsFailed
                  ? loading
                    ? "…"
                    : "—"
                  : snapshots?.checkpointSlot == null
                    ? "None"
                    : formatNumber(snapshots.checkpointSlot, 0),
              sub:
                snapshots?.checkpointSlot == null && !loading && !snapshotsFailed
                  ? "has imported no snapshot"
                  : "slot its replay resumes from",
            },
          ]}
        />
      </div>

      {peers && (
        <p className="mt-5 break-all font-mono text-[11px] leading-relaxed text-gray-600">
          <span className="font-sans text-gray-500">Its own peer id: </span>
          {peers.selfPeerId}
          <br />
          <span className="font-sans text-gray-500">Announces itself at: </span>
          {peers.announcedAddresses.length > 0
            ? peers.announcedAddresses.join("  ·  ")
            : "— nothing. Other nodes have no address to dial it at."}
        </p>
      )}

      <h3 className="mt-10 text-sm font-semibold uppercase tracking-wider text-gray-400">Peers</h3>
      <div className="mt-3">
        {loading ? (
          <p className="text-sm text-gray-500">Asking the node…</p>
        ) : peersFailed ? (
          <p className="text-sm text-amber-300">
            {nodeLabel || "This node"} did not answer <code className="font-mono">getPeers</code>.
            That is a failure to ask, not an empty peer table — nothing here says anything about how
            connected it is.
          </p>
        ) : peers && peers.peers.length === 0 ? (
          <p className="max-w-3xl text-sm leading-relaxed text-gray-400">
            This node has no peers in its discovery cache. It answered, so this is a real state and
            a serious one: a node connected to nobody hears no events, and every off-chain answer it
            gives is as old as the last thing it heard.
          </p>
        ) : (
          <DataTable
            minWidth={860}
            head={
              <tr>
                <Th>Peer</Th>
                <Th className="w-32">Version</Th>
                <Th className="w-56">Declared roles</Th>
                <Th right className="w-28">Last seen</Th>
                <Th right className="w-24">Latency</Th>
                <Th right className="w-32">Exchanges</Th>
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
                    <span className="text-xs text-gray-600">None declared</span>
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
                  {sinceLabel(peer.lastSeen)}
                </Td>
                {/* Never zero for "never measured": a peer this node has not
                    timed and one that answers instantly are different facts. */}
                <Td py="py-4" right num className="w-24 text-gray-400">
                  {peer.latencyMs === null ? "—" : `${peer.latencyMs} ms`}
                </Td>
                <Td py="py-4" right className="w-32 text-xs text-gray-400">
                  {exchangeRecord(peer) ?? (
                    <span className="text-gray-600">Not yet tried</span>
                  )}
                </Td>
              </Tr>
            ))}
          </DataTable>
        )}
      </div>

      <h3 className="mt-10 text-sm font-semibold uppercase tracking-wider text-gray-400">
        Snapshots
      </h3>
      <p className="mt-2 max-w-3xl text-xs leading-relaxed text-gray-500">
        A snapshot is how a new node joins without replaying all of history. It matters in both
        directions: an operator bringing a node up downloads one, and anybody choosing an access
        node can read from the age of the newest one roughly how long that node has been paying
        attention.
        {gap !== null && gap > 0 && (
          <>
            {" "}
            This node&apos;s checkpoint is {formatNumber(gap, 0)} slots behind the newest snapshot
            it knows of, which is history it would replay over gossip rather than import.
          </>
        )}
      </p>
      <div className="mt-3">
        {loading ? (
          <p className="text-sm text-gray-500">Asking the node…</p>
        ) : snapshotsFailed ? (
          <p className="text-sm text-amber-300">
            {nodeLabel || "This node"} did not answer the snapshot methods. Nothing here says
            whether it has any.
          </p>
        ) : snapshots && snapshots.snapshots.length === 0 ? (
          <p className="max-w-3xl text-sm leading-relaxed text-gray-400">
            This node knows of no snapshots. It answered — so either nobody on this network produces
            them, or none has reached it yet. A new node would have to replay from genesis.
          </p>
        ) : (
          <DataTable
            minWidth={860}
            head={
              <tr>
                <Th>Snapshot</Th>
                <Th right className="w-32">Slot</Th>
                <Th className="w-44">Produced by</Th>
                <Th right className="w-24">Size</Th>
                <Th right className="w-28">Age</Th>
                <Th className="w-24">Download</Th>
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
                      The one this node would hand a joiner
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
                  {sinceLabel(snapshot.createdAt)}
                </Td>
                <Td py="py-4" className="w-24">
                  {snapshot.locations.length === 0 ? (
                    <span className="text-xs text-gray-600">No location</span>
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
          A snapshot carries a 32-byte state root, and this page deliberately does not show it.
          Rendering a digest here would read as verification, and nothing a browser does verifies
          anything about it: the signature and registration checks a node performs establish that
          the bytes are what the announcer said, not that the announcer told the truth — which is
          why a node&apos;s <em>first</em> snapshot has to come from a pinned anchor rather than
          from whoever answered. The producer is shown instead, because that is the part you can
          look up in the{" "}
          <a href="/providers" className="text-brand-hover hover:underline">
            service registry
          </a>
          .
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
