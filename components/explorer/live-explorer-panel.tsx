"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { deriveStatus, TRADE_STATUS_LABEL, type Trade } from "@/lib/live-trades";

import { formatDate, formatNumber } from "@/lib/format";
import { fetchLiveNetworkStats, subscribeToLiveEvents, type LiveEvent } from "@/lib/live-explorer";
import { NODE_CHANGED_EVENT, readNodeSelection } from "@/lib/node-preference";
import { DataTable, Td, Th, Tr } from "@/components/data-table";
import { StatusPill } from "@/components/status-pill";
import { MetricStrip } from "@/components/metrics";
import { PageHero } from "@/components/page-hero";
import { ExplorerSearch } from "@/components/explorer/explorer-search";

const MAX_LIVE_EVENTS = 8;

/**
 * Reads the node the user has selected, whichever it is.
 *
 * This was previously gated on `selection.custom`, so only a hand-entered
 * node produced live data and every built-in choice fell back to fixtures.
 * That gate existed because the built-in list was itself fictional — there
 * was nothing to connect to. Now that the picker lists the real cluster,
 * the gate has no purpose and every selection is a real endpoint.
 */
function useLiveExplorer() {
  const [live, setLive] = useState(false);
  const [blockHeight, setBlockHeight] = useState<number | null>(null);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  // Bumped whenever the user changes their node selection via the
  // footer, so the connection effect below re-runs against the new one.
  const [selectionVersion, setSelectionVersion] = useState(0);

  useEffect(() => {
    const onChange = () => setSelectionVersion((v) => v + 1);
    window.addEventListener(NODE_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(NODE_CHANGED_EVENT, onChange);
  }, []);

  useEffect(() => {
    const selection = readNodeSelection();
    // `selection.url` rather than a URL rebuilt from the id: a built-in
    // node's id ("devnet-node0") is not a host, and concatenating it into
    // an address produced a request that could never resolve.
    const endpoint = selection.url;
    setLive(true);
    setEvents([]);

    let cancelled = false;
    fetchLiveNetworkStats(endpoint)
      .then((stats) => {
        if (!cancelled) setBlockHeight(stats.blockHeight);
      })
      .catch(() => {
        /* stats panel just shows "—" if this fails */
      });

    const unsubscribe = subscribeToLiveEvents(endpoint, (event) => {
      if (cancelled) return;
      setEvents((prev) => [event, ...prev].slice(0, MAX_LIVE_EVENTS));
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [selectionVersion]);

  return { live, blockHeight, events };
}

export function ExplorerLive({ settlements }: { settlements: Trade[] | null }) {
  const { live, blockHeight, events } = useLiveExplorer();

  // One set of metrics, not a live branch and a fixture branch. Anything the
  // node has not told us yet reads "—". A dash is honest on a quiet devnet;
  // the numbers that used to sit here (2,481,906 events, 184,232 settled
  // trades) described a network that does not exist and could not be
  // reconciled with anything a tester saw on screen.
  const metrics = [
    {
      label: "Block height",
      value: blockHeight !== null ? formatNumber(blockHeight, 0) : "—",
      sub: "Solana settlement layer",
    },
    { label: "Protocol events seen", value: formatNumber(events.length, 0), sub: "this session" },
    { label: "Settled trades", value: settlements ? formatNumber(settlements.length, 0) : "—" },
  ];

  return (
    <>
      <PageHero
        variant="ledger"
        title="Explorer"
        description="Every state transition on OpenFiat emits a signed protocol event. This reads them from your access node as they arrive."
        below={<ExplorerSearch />}
      >
        <MetricStrip items={metrics} />
      </PageHero>

      <div className="mt-12 grid gap-10 lg:grid-cols-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Latest protocol events</h2>
            {live && (
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Live from your access node
              </span>
            )}
          </div>
          <div className="mt-3">
            <DataTable
              minWidth={520}
              head={
                <tr>
                  <Th className="w-44">Event</Th>
                  <Th>Result</Th>
                  <Th right className="w-36">Time</Th>
                </tr>
              }
            >
              {events.map((e, i) => (
                <Tr key={i}>
                  <Td className="w-44 whitespace-nowrap">
                    <span className="font-mono text-xs text-brand-hover">{e.method}</span>
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-gray-400">{e.resultPreview}</Td>
                  <Td right num className="w-36 text-xs text-gray-500">{formatDate(e.receivedAt)}</Td>
                </Tr>
              ))}
              {live && events.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-sm text-gray-500">
                    Waiting for the next signed protocol event…
                  </td>
                </tr>
              )}
            </DataTable>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Latest trades</h2>
          <div className="mt-3">
            <DataTable
              minWidth={460}
              head={
                <tr>
                  <Th>Reservation</Th>
                  <Th right className="w-36">Amount</Th>
                  <Th right className="w-28">Status</Th>
                </tr>
              }
            >
              {(settlements ?? []).map((t) => {
                const amount = t.reservation.amount.base_units / 10 ** t.reservation.amount.decimals;
                return (
                  <Tr key={t.reservation.id}>
                    <Td className="whitespace-nowrap">
                      <Link href={`/orders/${t.reservation.id}`} className="font-mono text-xs text-brand hover:text-brand-hover">
                        {t.reservation.id}
                      </Link>
                    </Td>
                    <Td right num className="w-36 text-gray-300">
                      {formatNumber(amount)}
                    </Td>
                    <Td right className="w-28 whitespace-nowrap"><StatusPill status={TRADE_STATUS_LABEL[deriveStatus(t)]} /></Td>
                  </Tr>
                );
              })}
              {settlements === null && (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-sm text-gray-500">
                    Could not read trades from the node.
                  </td>
                </tr>
              )}
              {settlements !== null && settlements.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-sm text-gray-500">
                    No trades on this node yet.
                  </td>
                </tr>
              )}
            </DataTable>
          </div>
        </div>
      </div>
    </>
  );
}
