"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { WALLET_CHANGED_EVENT, readWalletConnection, type WalletConnection } from "@/lib/wallet-connection";
import { peerIdBytesForAddress, peerIdHexForAddress } from "@/lib/peer-id";
import { fetchTrades, tradesForPeer, deriveStatus, TRADE_STATUS_LABEL, type Trade } from "@/lib/live-trades";
import { assetLabel, fetchAdvertisements, type LiveAd } from "@/lib/live-advertisements";
import { formatCrypto, formatDateMs } from "@/lib/format";
import { DataTable, Td, Th, Tr } from "@/components/data-table";
import { StatusPill } from "@/components/status-pill";

const FILTERS = ["All", "Active", "Completed", "Cancelled", "Disputed", "Rejected"] as const;
type Filter = (typeof FILTERS)[number];

function matches(trade: Trade, filter: Filter): boolean {
  const status = deriveStatus(trade);
  switch (filter) {
    case "All":
      return true;
    case "Active":
      return status === "EscrowLocked" || status === "AwaitingPayment" || status === "PaymentSubmitted";
    default:
      return TRADE_STATUS_LABEL[status] === filter;
  }
}

const toHex = (bytes: number[]) => bytes.map((b) => b.toString(16).padStart(2, "0")).join("");

/**
 * `/orders`, reading this wallet's real trades from a node.
 *
 * Replaces a table driven by `TRADES` — a fixture where every "settlement
 * transaction" and "escrow creation transaction" shown in the trade room was
 * a deterministic fake, and every "bank account"/"M-Pesa number" a merchant
 * supposedly gave you was invented too (see `components/orders/trade-room.tsx`
 * and `lib/data/trades.ts`, both deleted). This reads `getTrades` (OFS-2000)
 * and scopes it to whichever trades this wallet's PeerId is a party to,
 * following the same client-side-scoping pattern the merchant console
 * established for advertisements — there is no per-wallet RPC filter.
 */
export function OrdersTable() {
  const [wallet, setWallet] = useState<WalletConnection | null>(null);
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [ads, setAds] = useState<LiveAd[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("All");

  useEffect(() => {
    const update = () => setWallet(readWalletConnection());
    update();
    window.addEventListener(WALLET_CHANGED_EVENT, update);
    return () => window.removeEventListener(WALLET_CHANGED_EVENT, update);
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [allTrades, allAds] = await Promise.all([fetchTrades(), fetchAdvertisements()]);
      setAds(allAds);
      setTrades(allTrades);
    } catch (err) {
      // "No trades" and "could not reach a node" are different facts.
      setError(err instanceof Error ? err.message : String(err));
      setTrades(null);
    }
  }, []);

  useEffect(() => {
    if (wallet) void load();
    else setTrades(null);
  }, [wallet, load]);

  const adById = useMemo(() => new Map(ads.map((a) => [a.id, a])), [ads]);

  if (!wallet) {
    return (
      <p className="rounded-lg border border-white/10 bg-white/[0.02] p-6 text-sm text-gray-400">
        Connect a wallet to see the reservations and settlements it is a party to. Your wallet key
        <em> is </em> your protocol identity — there is no separate account to create.
      </p>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/[0.04] p-6">
        <p className="text-sm font-medium text-red-300">Could not read trades from the node</p>
        <p className="mt-1 font-mono text-xs text-red-400/80">{error}</p>
        <button
          onClick={() => void load()}
          className="mt-4 rounded-md border border-white/15 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-white/5"
        >
          Retry
        </button>
      </div>
    );
  }

  if (trades === null) {
    return <p className="p-6 text-sm text-gray-500">Reading trades…</p>;
  }

  const myPeerId = peerIdBytesForAddress(wallet.address);
  const mine = tradesForPeer(trades, myPeerId);
  const visible = mine.filter((t) => matches(t, filter));

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              filter === f
                ? "border-brand/50 bg-brand/10 text-brand-hover"
                : "border-white/10 text-gray-400 hover:text-white"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {mine.length === 0 ? (
        <p className="mt-6 py-8 text-sm text-gray-500">
          This wallet is not a party to any reservation or trade this node knows about yet.
        </p>
      ) : (
        <div className="mt-4">
          <DataTable
            minWidth={860}
            head={
              <tr>
                <Th>Trade</Th>
                <Th>Pair</Th>
                <Th right>Amount</Th>
                <Th>Your role</Th>
                <Th>Status</Th>
                <Th right>Updated</Th>
              </tr>
            }
          >
            {visible.map((t) => {
              const ad = adById.get(t.reservation.advertisement_id);
              const amount = t.reservation.amount.base_units / 10 ** t.reservation.amount.decimals;
              const status = deriveStatus(t);
              const requesterHex = toHex(t.reservation.requester);
              const myHex = peerIdHexForAddress(wallet.address);
              const role = requesterHex === myHex ? "Requester" : "Counterparty";
              return (
                <Tr key={t.reservation.id}>
                  <Td py="py-5">
                    <Link href={`/orders/${t.reservation.id}`} className="font-mono font-medium text-brand hover:text-brand-hover">
                      {t.reservation.id}
                    </Link>
                  </Td>
                  <Td py="py-5" className="text-gray-300">
                    {ad ? `${assetLabel(ad)}/${ad.fiatCurrency}` : "—"}
                  </Td>
                  <Td py="py-5" right num className="text-gray-300">
                    {ad ? formatCrypto(amount, assetLabel(ad)) : amount}
                  </Td>
                  <Td py="py-5" className="text-gray-400">{role}</Td>
                  <Td py="py-5"><StatusPill status={TRADE_STATUS_LABEL[status]} /></Td>
                  <Td py="py-5" right className="text-xs text-gray-500">{formatDateMs(t.reservation.updated_at)}</Td>
                </Tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                  No trades in this state.
                </td>
              </tr>
            )}
          </DataTable>
        </div>
      )}
    </div>
  );
}
