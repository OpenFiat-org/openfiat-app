"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Client } from "@openfiat/sdk";

import { DataTable, Td, Th, Tr } from "@/components/data-table";
import { MetricStrip } from "@/components/metrics";
import { StatusPill } from "@/components/status-pill";
import { NodeUseButton } from "@/components/network/node-use-button";
import { formatNumber } from "@/lib/format";
import { NETWORK_LABEL, SOLANA_CLUSTER } from "@/lib/node-endpoint";
import {
  claimContradicted,
  readCapabilities,
  type ChainObservation,
} from "@/lib/node-capabilities";
import { discoverNodes, type DiscoveredNode } from "@/lib/live-nodes";
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
 * # Claims and observations, kept apart
 *
 * A node's registration now describes itself: chain mode, whether it
 * serves content, its retention window, a region if the operator declared
 * one. All of it is signed by the node about itself and none of it is
 * verified by anyone, so it is labelled as claimed and never ticked.
 *
 * Where an observation is cheap it sits beside the claim rather than
 * replacing it. `chain:rpc` is the one that matters when picking an access
 * node — a gossip-only node's chain answers are second-hand and can lag —
 * and it is also the one that fails visibly, because a node that is not
 * reading Solana cannot answer `getChainStatus` with a slot. So the table
 * shows what the node said and what it did, and marks the case where they
 * disagree in the direction that misleads a reader.
 *
 * Region was absent from this table because it used to be a fixture
 * invention. It is a declaration on a real record now — still unverified,
 * and shown as declared.
 *
 * Reachability is per node and shown even when it fails. A node that is
 * down is a fact an operator needs; hiding it behind a filtered list is how
 * the previous version managed to look healthy while describing nothing.
 */

interface Probe {
  latencyMs: number | null;
  blockHeight: number | null;
  /** What asking the node established about its chain claim. */
  chain: ChainObservation;
}

async function probe(node: DiscoveredNode): Promise<Probe> {
  const started = performance.now();
  try {
    const client = new Client({ endpoint: node.url, timeoutMs: 4_000 });
    await client.call<Record<string, never>, unknown>("getHealth", {});
    const latencyMs = Math.round(performance.now() - started);
    let blockHeight: number | null = null;
    let chain: ChainObservation = { kind: "no-slot" };
    try {
      blockHeight = (await fetchLiveNetworkStats(node.url)).blockHeight;
      // A slot is the observation. A gossip-only node reaching this line
      // with no slot is behaving exactly as it advertised — the difference
      // between the modes, not a failure of the node.
      chain = blockHeight !== null ? { kind: "answered", slot: blockHeight } : { kind: "no-slot" };
    } catch {
      chain = { kind: "no-slot" };
    }
    return { latencyMs, blockHeight, chain };
  } catch {
    // Nothing was observed, which is not the same as observing nothing.
    return { latencyMs: null, blockHeight: null, chain: { kind: "unreachable" } };
  }
}

export function LiveNetwork() {
  const t = useTranslations("network");
  const [nodes, setNodes] = useState<DiscoveredNode[]>([]);
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
            label: t("metricNodesReachable"),
            value: checking ? "…" : `${reachable} / ${nodes.length}`,
            sub: t("clusterSub", { label: NETWORK_LABEL }),
          },
          {
            label: t("metricBlockHeight"),
            value: blockHeight !== null ? formatNumber(blockHeight, 0) : "—",
            sub: SOLANA_CLUSTER,
          },
          {
            label: t("metricAnsweredSlot"),
            /*
             * Counted from what each node ANSWERED, never from what it
             * claims — a registration saying `chain:rpc` is the node's own
             * word for it, and this is the part anybody checked.
             *
             * It is deliberately not labelled "RPC-connected nodes", which
             * is what it used to say. A gossip-only node on this very
             * cluster answers with the same slot as the RPC-connected one,
             * because that is what gossip is for. A slot coming back
             * disproves nothing and proves less than it looks like: what it
             * establishes is that the node has a slot to give, which is
             * exactly what the column says.
             */
            value: checking
              ? "…"
              : String(nodes.filter((n) => probes[n.id]?.chain.kind === "answered").length),
            sub: t("metricAnsweredSub"),
          },
        ]}
      />

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-gray-400">{t("nodesHeading")}</h2>
      <div className="mt-3">
        {nodes.length === 0 ? (
          /*
           * A sentence rather than an empty table, and not only for looks.
           * Below `lg` the header is hidden — that is what the stacked
           * treatment does — so a table with no rows yet is a zero-height
           * element: nothing on screen, and nothing to say why. The
           * registry read that fills this runs at mount, so the window is
           * real on a phone on a slow connection, and it is the state
           * `tests/e2e/mobile.spec.ts` kept catching as a table that was
           * present and invisible.
           */
          <p className="text-sm text-gray-500">
            {checking ? t("contacting") : t("noNodeListed")}
          </p>
        ) : (
          <DataTable
            minWidth={720}
            head={
              <tr>
                <Th>{t("colNode")}</Th>
                <Th className="w-64">{t("colClaims")}</Th>
                <Th className="w-56">{t("colObserved")}</Th>
                <Th right className="w-24">{t("colLatency")}</Th>
                <Th right className="w-24">{t("colStatus")}</Th>
                <Th right className="w-24">{t("colAccess")}</Th>
              </tr>
            }
          >
            {nodes.map((n) => {
              const p = probes[n.id];
              const up = p?.latencyMs != null;
              const claims = readCapabilities(n.capabilities);
              const observation: ChainObservation = p?.chain ?? { kind: "pending" };
              const contradicted = claimContradicted(n.chainMode, observation);
              return (
                <Tr key={n.id}>
                  <Td py="py-5">
                    <span className="font-mono text-gray-200">{n.label}</span>
                    <span className="mt-1 block truncate font-mono text-[11px] text-gray-600" title={n.url}>
                      {n.url}
                    </span>
                  </Td>
                  <Td py="py-5" className="w-64">
                    {/*
                      * Deliberately inside Claims and not in the Node cell
                      * beside the host. The host is observable — it is
                      * where this page just sent a request. A name and a
                      * logo are what the operator wrote about themselves,
                      * and putting them in the identity column would let
                      * them borrow the credibility of the column they sat
                      * in.
                      */}
                    {(n.branding?.name || n.branding?.logoUrl) && (
                      <span className="mb-1.5 flex items-center gap-1.5">
                        {n.branding.logoUrl && (
                          <img
                            src={n.branding.logoUrl}
                            alt=""
                            width={16}
                            height={16}
                            className="h-4 w-4 shrink-0 rounded-full border border-white/10 bg-white/5 object-cover"
                          />
                        )}
                        <span className="truncate text-gray-300">
                          {t("callsItself", { name: n.branding.name ?? "—" })}
                        </span>
                      </span>
                    )}
                    {/* Every one of these is the node's own word. No ticks. */}
                    <span className={contradicted ? "text-amber-300" : "text-gray-300"}>
                      {t(`chainMode.${n.chainMode ?? "none"}`)}
                    </span>
                    <span className="mt-1.5 flex flex-wrap gap-1">
                      {claims.retention && <Chip>{t("chipRetention", { window: claims.retention })}</Chip>}
                      {claims.servesContent && <Chip>{t("chipServesContent")}</Chip>}
                      {claims.producesSnapshots && <Chip>{t("chipProducesSnapshots")}</Chip>}
                      {/* "declared" spelled out on the chip itself, not
                          only in the column heading: a chip is read on its
                          own. Nothing anywhere observes a node's region —
                          deriving it from the node's own addresses was
                          investigated under #173 and rejected. */}
                      {n.region && <Chip>{t("chipRegion", { region: n.region })}</Chip>}
                      {/* A capability string this build has no reading for is
                          shown as itself. Dropping it would hide the newest
                          thing a node can do and keep looking correct. */}
                      {claims.unrecognised.map((capability) => (
                        <Chip key={capability} mono>
                          {capability}
                        </Chip>
                      ))}
                    </span>
                    {n.capabilities.length === 0 && (
                      <span className="mt-1 block text-[11px] text-gray-600">
                        {t("noRegistration")}
                      </span>
                    )}
                  </Td>
                  <Td py="py-5" className="w-56 text-xs text-gray-400">
                    {checking ? t("checking") : observationLabel(t, observation)}
                    {contradicted && (
                      <span className="mt-1 block text-[11px] leading-snug text-amber-300">
                        {t("contradiction")}
                      </span>
                    )}
                  </Td>
                  <Td py="py-5" right num className="w-24 text-gray-400">
                    {checking ? "…" : up ? t("latencyMs", { ms: p!.latencyMs! }) : "—"}
                  </Td>
                  <Td py="py-5" right className="w-24">
                    <StatusPill
                      status={checking ? "Syncing" : up ? "Online" : "Offline"}
                      label={checking ? t("statusSyncing") : up ? t("statusOnline") : t("statusOffline")}
                    />
                  </Td>
                  <Td py="py-5" right className="w-24">
                    <NodeUseButton nodeId={n.id} />
                  </Td>
                </Tr>
              );
            })}
          </DataTable>
        )}
        <p className="mt-3 text-xs leading-relaxed text-gray-600">
          {t.rich("claimsFooter", { s: (chunks) => <span className="text-gray-500">{chunks}</span> })}
        </p>
      </div>
    </>
  );
}

/** Resolves the one-phrase chain observation, translated. */
function observationLabel(
  t: (key: string, values?: Record<string, string | number>) => string,
  observation: ChainObservation,
): string {
  switch (observation.kind) {
    case "answered":
      return t("obsAnswered", { slot: observation.slot.toLocaleString("en-US") });
    case "no-slot":
      return t("obsNoSlot");
    case "unreachable":
      return t("obsUnreachable");
    case "pending":
      return t("checking");
  }
}

/** A claimed capability, styled so it never reads as a verified badge. */
function Chip({ children, mono = false }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <span
      className={`rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-gray-400 ${
        mono ? "font-mono" : ""
      }`}
    >
      {children}
    </span>
  );
}
