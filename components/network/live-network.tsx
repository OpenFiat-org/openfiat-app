"use client";

import { useEffect, useState } from "react";
import { Client } from "@openfiat/sdk";

import { DataTable, Td, Th, Tr } from "@/components/data-table";
import { MetricStrip } from "@/components/metrics";
import { StatusPill } from "@/components/status-pill";
import { NodeUseButton } from "@/components/network/node-use-button";
import { formatNumber } from "@/lib/format";
import { NETWORK_LABEL, SOLANA_CLUSTER, type KnownNode } from "@/lib/node-endpoint";
import { discoverNodes } from "@/lib/live-nodes";
import { fetchLiveNetworkStats } from "@/lib/live-explorer";

/**
 * The real cluster, contacted directly.
 *
 * # What this replaced
 *
 * A fixture (`lib/data/network.ts`) reporting 128 nodes online, 3,412 peers,
 * block height 312,445,902, epoch 742 and protocol v0.4.2, over a table of
 * ten invented nodes with invented regions and latencies. None of it was
 * observable and none of it was true: the cluster is three nodes.
 *
 * # What is shown now, and what is deliberately absent
 *
 * Every column here is something the app can actually observe: the node's
 * configured endpoint, its chain-bridge mode, whether it answered, and how
 * long it took. Region, peer count and version are gone rather than
 * estimated — no RPC method this app calls reports them, so any value in
 * those columns would have been invented a second time.
 *
 * Reachability is per node and shown even when it fails. A node that is
 * down is a fact an operator needs; hiding it behind a filtered list is how
 * the previous version managed to look healthy while describing nothing.
 */

interface Probe {
  latencyMs: number | null;
  blockHeight: number | null;
}

async function probe(node: KnownNode): Promise<Probe> {
  const started = performance.now();
  try {
    const client = new Client({ endpoint: node.url, timeoutMs: 4_000 });
    await client.call<Record<string, never>, unknown>("getHealth", {});
    const latencyMs = Math.round(performance.now() - started);
    let blockHeight: number | null = null;
    try {
      blockHeight = (await fetchLiveNetworkStats(node.url)).blockHeight;
    } catch {
      // A gossip-only node may not answer chain status; that is a real
      // difference between the modes, not a failure of the node.
    }
    return { latencyMs, blockHeight };
  } catch {
    return { latencyMs: null, blockHeight: null };
  }
}

export function LiveNetwork() {
  const [nodes, setNodes] = useState<KnownNode[]>([]);
  const [probes, setProbes] = useState<Record<string, Probe>>({});
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Discovered, not compiled in. The list used to be
      // `knownNodes()` — a build-time constant — so this view showed
      // exactly as many nodes as the last release happened to know
      // about, and could never show one launched since. Nodes that want
      // to be used register themselves (OFS-1500), so the real list is
      // the seed plus what the registry reports.
      const discovered = await discoverNodes();
      if (cancelled) return;
      setNodes(discovered);

      const entries = await Promise.all(
        discovered.map(async (n) => [n.id, await probe(n)] as const),
      );
      if (!cancelled) {
        setProbes(Object.fromEntries(entries));
        setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const reachable = nodes.filter((n) => probes[n.id]?.latencyMs != null).length;
  const heights = nodes
    .map((n) => probes[n.id]?.blockHeight)
    .filter((h): h is number => typeof h === "number");
  const blockHeight = heights.length > 0 ? Math.max(...heights) : null;

  return (
    <>
      <MetricStrip
        items={[
          {
            label: "Nodes reachable",
            value: checking ? "…" : `${reachable} / ${nodes.length}`,
            sub: `${NETWORK_LABEL} cluster`,
          },
          {
            label: "Block height",
            value: blockHeight !== null ? formatNumber(blockHeight, 0) : "—",
            sub: SOLANA_CLUSTER,
          },
          {
            label: "RPC-connected nodes",
            // Counted from what each node answered, not from the list's
            // own `chainMode`: a discovered node's registration says
            // nothing about whether it reads Solana, so only the probe
            // knows.
            value: checking
              ? "…"
              : String(nodes.filter((n) => probes[n.id]?.blockHeight != null).length),
            sub: "answered getChainStatus",
          },
        ]}
      />

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-gray-400">Nodes</h2>
      <div className="mt-3">
        <DataTable
          minWidth={720}
          head={
            <tr>
              <Th>Node</Th>
              <Th className="w-40">Chain mode</Th>
              <Th className="w-56">Endpoint</Th>
              <Th right className="w-24">Latency</Th>
              <Th right className="w-24">Status</Th>
              <Th right className="w-24">Access</Th>
            </tr>
          }
        >
          {nodes.map((n) => {
            const p = probes[n.id];
            const up = p?.latencyMs != null;
            return (
              <Tr key={n.id}>
                <Td py="py-5" className="font-mono text-gray-200">{n.label}</Td>
                <Td py="py-5" className="w-40 text-gray-300">{n.chainMode}</Td>
                <Td py="py-5" className="w-56 truncate font-mono text-xs text-gray-500">{n.url}</Td>
                <Td py="py-5" right num className="w-24 text-gray-400">
                  {checking ? "…" : up ? `${p!.latencyMs} ms` : "—"}
                </Td>
                <Td py="py-5" right className="w-24">
                  <StatusPill status={checking ? "Syncing" : up ? "Online" : "Offline"} />
                </Td>
                <Td py="py-5" right className="w-24">
                  <NodeUseButton nodeId={n.id} />
                </Td>
              </Tr>
            );
          })}
        </DataTable>
        <p className="mt-3 text-xs text-gray-600">
          Status and latency come from a live request to each node when this page loads. Region, peer
          count and version are not shown because no method this app calls reports them.
        </p>
      </div>
    </>
  );
}
