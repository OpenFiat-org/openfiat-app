import type { Metadata } from "next";
import Link from "next/link";
import { NETWORK_STATS, PROTOCOL_EVENTS } from "@/lib/data/network";
import { TRADES } from "@/lib/data/trades";
import { formatCrypto, formatDate, formatFiat, formatNumber, shortSig } from "@/lib/format";
import { DataTable, Td, Th, Tr } from "@/components/data-table";
import { MetricStrip } from "@/components/metrics";
import { PageHero } from "@/components/page-hero";
import { StatusPill } from "@/components/status-pill";
import { ExplorerSearch } from "@/components/explorer/explorer-search";

export const metadata: Metadata = {
  title: "Explorer",
  description: "Explore the OpenFiat coordination layer — protocol events, settlements, addresses, and trades.",
};

export default function ExplorerPage() {
  const settlements = TRADES.slice(0, 8);

  return (
    <section>
      <PageHero
        variant="ledger"
        title="Explorer"
        description="Every state transition on OpenFiat emits a signed protocol event — search and browse the simulated index."
        below={<ExplorerSearch />}
      >
        <MetricStrip
          items={[
            { label: "Block height", value: formatNumber(NETWORK_STATS.blockHeight, 0), sub: "Solana settlement layer" },
            { label: "Epoch", value: String(NETWORK_STATS.epoch) },
            { label: "Total events", value: "2,481,906" },
            { label: "Settled trades", value: "184,232" },
            { label: "Nodes online", value: formatNumber(NETWORK_STATS.nodesOnline, 0) },
          ]}
        />
      </PageHero>

      <div className="mt-12 grid gap-10 lg:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Latest protocol events</h2>
          <div className="mt-3">
            <DataTable
              minWidth={520}
              head={
                <tr>
                  <Th className="w-44">Event</Th>
                  <Th>Actor</Th>
                  <Th right className="w-36">Time</Th>
                </tr>
              }
            >
              {PROTOCOL_EVENTS.slice(0, 8).map((e, i) => (
                <Tr key={i}>
                  <Td className="w-44 whitespace-nowrap">
                    <span className="font-mono text-xs text-brand-hover">{e.type}</span>
                    <span className="mt-0.5 block max-w-44 truncate text-xs text-gray-500">{e.summary}</span>
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-gray-400">{e.actor}</Td>
                  <Td right num className="w-36 text-xs text-gray-500">{formatDate(e.timestamp)}</Td>
                </Tr>
              ))}
            </DataTable>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Latest settlements</h2>
          <div className="mt-3">
            <DataTable
              minWidth={520}
              head={
                <tr>
                  <Th>Transaction</Th>
                  <Th right className="w-36">Amount</Th>
                  <Th right className="w-32">Fiat</Th>
                  <Th right className="w-28">Status</Th>
                </tr>
              }
            >
              {settlements.map((t) => (
                <Tr key={t.id}>
                  <Td className="whitespace-nowrap">
                    <Link href={`/orders/${t.id}`} className="font-mono text-xs text-brand hover:text-brand-hover">
                      {shortSig(t.txSig)}
                    </Link>
                    <span className="ml-2 text-xs text-gray-500">{t.asset}/{t.fiatCurrency}</span>
                  </Td>
                  <Td right num className="w-36 text-gray-300">
                    {formatCrypto(t.cryptoAmount, "").trim()}{" "}
                    <span className="text-gray-500">{t.asset}</span>
                  </Td>
                  <Td right num className="w-32 text-gray-400">
                    {formatFiat(t.fiatAmount, "").trim()}{" "}
                    <span className="text-gray-600">{t.fiatCurrency}</span>
                  </Td>
                  <Td right className="w-28 whitespace-nowrap"><StatusPill status={t.status} /></Td>
                </Tr>
              ))}
            </DataTable>
          </div>
        </div>
      </div>
    </section>
  );
}
