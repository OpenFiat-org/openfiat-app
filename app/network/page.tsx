import type { Metadata } from "next";
import Link from "next/link";
import { NETWORK_NODES, NETWORK_STATS, PROTOCOL_EVENTS } from "@/lib/data/network";
import { formatDate, formatNumber } from "@/lib/format";
import { DataTable, Td, Th, Tr } from "@/components/data-table";
import { MetricStrip } from "@/components/metrics";
import { PageHero } from "@/components/page-hero";
import { Panel } from "@/components/panel";
import { StatusPill } from "@/components/status-pill";
import { NodeUseButton } from "@/components/network/node-use-button";

export const metadata: Metadata = {
  title: "Network",
  description: "OpenFiat network view — nodes, roles, and the signed protocol event stream.",
};

export default function NetworkPage() {
  return (
    <section>
      <PageHero
        variant="mesh"
        title="Network"
        description="The coordination layer is event-sourced: every state transition emits a signed protocol event."
      >
        <MetricStrip
          items={[
            { label: "Nodes online", value: formatNumber(NETWORK_STATS.nodesOnline, 0) },
            { label: "Peers", value: formatNumber(NETWORK_STATS.peers, 0) },
            { label: "Block height", value: formatNumber(NETWORK_STATS.blockHeight, 0), sub: "Solana settlement layer" },
            { label: "Epoch", value: String(NETWORK_STATS.epoch) },
            { label: "Protocol version", value: NETWORK_STATS.protocolVersion },
          ]}
        />
      </PageHero>

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-gray-400">Nodes</h2>
      <div className="mt-3">
        <DataTable
          minWidth={920}
          head={
            <tr>
              <Th>Node</Th>
              <Th className="w-48">Role</Th>
              <Th className="w-36">Region</Th>
              <Th right className="w-20">Version</Th>
              <Th right className="w-20">Peers</Th>
              <Th right className="w-24">Latency</Th>
              <Th right className="w-24">Status</Th>
              <Th right className="w-24">Access</Th>
            </tr>
          }
        >
          {NETWORK_NODES.map((n) => (
            <Tr key={n.id}>
              <Td py="py-5" className="font-mono text-gray-200">{n.id}</Td>
              <Td py="py-5" className="w-48 text-gray-300">
                {n.role === "Full Node" || n.role === "Bootstrap Node" ? (
                  n.role
                ) : (
                  <Link href="/providers" className="hover:text-brand-hover" title="Browse this service type in the registry">
                    {n.role}
                  </Link>
                )}
              </Td>
              <Td py="py-5" className="w-36 text-gray-400">{n.region}</Td>
              <Td py="py-5" right num className="w-20 text-gray-400">{n.version}</Td>
              <Td py="py-5" right num className="w-20 text-gray-300">{n.peers}</Td>
              <Td py="py-5" right num className="w-24 text-gray-400">{n.status === "Offline" ? "—" : `${n.latencyMs} ms`}</Td>
              <Td py="py-5" right className="w-24"><StatusPill status={n.status} /></Td>
              <Td py="py-5" right className="w-24">{n.status === "Online" && <NodeUseButton nodeId={n.id} />}</Td>
            </Tr>
          ))}
        </DataTable>
      </div>

      <div className="mt-10">
        <Panel title="Protocol event stream">
          <ol className="divide-y divide-white/5">
            {PROTOCOL_EVENTS.map((e, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-4 gap-y-0.5 px-4 py-2.5 text-sm">
                <span className="w-36 shrink-0 text-xs tabular-nums text-gray-600">{formatDate(e.timestamp)}</span>
                <span className="w-44 shrink-0 font-mono text-xs text-brand-hover">{e.type}</span>
                <span className="w-28 shrink-0 truncate text-xs text-gray-500">{e.actor}</span>
                <span className="min-w-0 flex-1 text-gray-300">{e.summary}</span>
              </li>
            ))}
          </ol>
          <p className="border-t border-white/10 px-4 py-2.5 text-[11px] text-gray-600">
            Static snapshot of recent events — a live node would stream these in real time.
          </p>
        </Panel>
      </div>
    </section>
  );
}
