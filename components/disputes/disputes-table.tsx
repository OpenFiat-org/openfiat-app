"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { WALLET_CHANGED_EVENT, readWalletConnection } from "@/lib/wallet-connection";
import { peerIdBytesForAddress } from "@/lib/peer-id";
import { fetchDisputes, type Dispute } from "@/lib/live-disputes";
import { formatDateShortMs } from "@/lib/format";
import { DataTable, Td, Th, Tr } from "@/components/data-table";
import { StatusPill } from "@/components/status-pill";

const STATUS_LABEL: Record<Dispute["status"], string> = {
  Open: "Open",
  CaseLocked: "Case Locked",
  RevealPhase: "Reveal Phase",
  Resolved: "Resolved",
};

const sameBytes = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Every dispute this node knows about (OFS-2400) — there is no per-wallet
 * `getDisputes` filter, so this is a global case list, the same shape
 * `getAdvertisements`/`getTrades` already are. A connected wallet gets its
 * own cases labelled "You"; nothing here requires connecting one.
 *
 * Replaces a table driven by `lib/data/disputes.ts` — four cases hand-written
 * to walk through the commit-reveal lifecycle, each with a fabricated buyer
 * and merchant Solana wallet address and a fabricated arbitrator roster
 * (reputation, stake, reward/slash figures, none of it real). `getDisputes`
 * returns `[]` on this cluster right now, which this renders as "no disputes
 * yet" — a true, current fact about the system — rather than inventing rows
 * to make the screen look busier.
 */
export function DisputesTable() {
  const [disputes, setDisputes] = useState<Dispute[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [myPeerId, setMyPeerId] = useState<number[] | null>(null);

  useEffect(() => {
    const update = () => {
      const wallet = readWalletConnection();
      setMyPeerId(wallet ? peerIdBytesForAddress(wallet.address) : null);
    };
    update();
    window.addEventListener(WALLET_CHANGED_EVENT, update);
    return () => window.removeEventListener(WALLET_CHANGED_EVENT, update);
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      setDisputes(await fetchDisputes());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setDisputes(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/[0.04] p-6">
        <p className="text-sm font-medium text-red-300">Could not read disputes from the node</p>
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

  if (disputes === null) {
    return <p className="p-6 text-sm text-gray-500">Reading disputes…</p>;
  }

  if (disputes.length === 0) {
    return (
      <p className="rounded-lg border border-white/10 bg-white/[0.02] p-6 text-sm text-gray-400">
        No disputes yet on the node you are connected to. Filing one happens from a trade room once a settlement is
        under way.
      </p>
    );
  }

  return (
    <DataTable
      minWidth={780}
      head={
        <tr>
          <Th>Case</Th>
          <Th>Reason</Th>
          <Th>You are</Th>
          <Th>Filed</Th>
          <Th right>Arbitrators</Th>
          <Th right>Stage</Th>
        </tr>
      }
    >
      {disputes.map((d) => {
        const iAmBuyer = myPeerId && sameBytes(d.buyer, myPeerId);
        const iAmSeller = myPeerId && sameBytes(d.seller, myPeerId);
        const iAmOpener = myPeerId && sameBytes(d.opener, myPeerId);
        const role = iAmBuyer ? "Buyer" : iAmSeller ? "Seller" : iAmOpener ? "Opener" : "—";
        return (
          <Tr key={d.id}>
            <Td py="py-5">
              <Link href={`/disputes/${d.id}`} className="font-mono font-medium text-brand hover:text-brand-hover">
                {d.id}
              </Link>
              <span className="mt-0.5 block text-xs text-gray-500">settlement {d.settlement_id}</span>
            </Td>
            <Td py="py-5" className="max-w-xs truncate text-xs text-gray-400">{d.reason}</Td>
            <Td py="py-5" className="text-gray-400">{role}</Td>
            <Td py="py-5" className="tabular-nums text-gray-400">{formatDateShortMs(d.opened_at)}</Td>
            <Td py="py-5" right num className="text-gray-300">
              {d.arbitrators.length} / {d.required_arbitrators}
            </Td>
            <Td py="py-5" right><StatusPill status={STATUS_LABEL[d.status]} /></Td>
          </Tr>
        );
      })}
    </DataTable>
  );
}
