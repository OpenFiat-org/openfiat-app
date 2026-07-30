"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useMyDisputes } from "@/components/disputes/use-my-disputes";
import { fetchDisputes, type Dispute, type PublicDispute } from "@/lib/live-disputes";
import { peerIdBytesForAddress } from "@/lib/peer-id";
import { readWalletConnection, WALLET_CHANGED_EVENT } from "@/lib/wallet-connection";
import { formatDateShortMs } from "@/lib/format";
import { DataTable, Td, Th, Tr } from "@/components/data-table";
import { StatusPill } from "@/components/status-pill";

const STATUS_LABEL: Record<PublicDispute["status"], string> = {
  Open: "Open",
  CaseLocked: "Case Locked",
  RevealPhase: "Reveal Phase",
  Resolved: "Resolved",
};

const sameBytes = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** How this wallet is involved, from a case it is entitled to read. */
function roleIn(dispute: Dispute, peerId: number[]): string {
  if (sameBytes(dispute.buyer, peerId)) return "Buyer";
  if (sameBytes(dispute.seller, peerId)) return "Seller";
  if (dispute.arbitrators.some((a) => sameBytes(a, peerId))) return "Arbitrator";
  // `getMyDisputes` answers for buyer, seller and seated arbitrators, so
  // there is no fourth case — but a record that reaches here anyway is the
  // node telling us something this app has not understood, and inventing a
  // role for it would be the wrong response.
  return "Party";
}

/**
 * Every dispute this node knows about (OFS-2400), and which of them are
 * yours.
 *
 * # Two reads, because a case says different things to different readers
 *
 * The docket is the public, redacted `getDisputes`: which cases exist, how
 * far each has got, how many of its arbitrator seats are filled, and how it
 * came out. That is a real public view of a public network and it is what
 * this table is built from.
 *
 * What is no longer in it is *who*. The buyer and seller are the trade graph
 * this protocol gates on physical-safety grounds (`lib/counterparties.ts`),
 * the free-text reason describes a real disagreement and names people and
 * banks as a matter of course, and which arbitrator is seated on which case
 * is the pairing that makes pressuring one worthwhile.
 *
 * So the "Reason" column is gone — there is no truthful thing to put in it
 * for a case you are not in — and the "You are" column appears only after the
 * connected wallet has signed for `getMyDisputes`. Until then the honest
 * answer is that this table does not know, and it says so instead of showing
 * an empty column or a dash that reads like "not you".
 */
export function DisputesTable() {
  const [disputes, setDisputes] = useState<PublicDispute[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [myPeerId, setMyPeerId] = useState<number[] | null>(null);
  const mine = useMyDisputes();

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

  // Only ever consulted when the signed read has succeeded, so a row is
  // labelled from a record this wallet was entitled to read — never from
  // matching public rows against each other.
  const roles = new Map<string, string>(
    myPeerId && mine.data ? mine.data.map((d) => [d.id, roleIn(d, myPeerId)]) : [],
  );
  const showRole = mine.status === "loaded";

  return (
    <div className="space-y-3">
      <YourCases state={mine} />
      <DataTable
        minWidth={720}
        head={
          <tr>
            <Th>Case</Th>
            {showRole && <Th>You are</Th>}
            <Th>Filed</Th>
            <Th right>Arbitrators</Th>
            <Th right>Stage</Th>
          </tr>
        }
      >
        {disputes.map((d) => (
          <Tr key={d.id}>
            <Td py="py-5">
              <Link href={`/disputes/${d.id}`} className="font-mono font-medium text-brand hover:text-brand-hover">
                {d.id}
              </Link>
              <span className="mt-0.5 block text-xs text-gray-500">settlement {d.settlement_id}</span>
            </Td>
            {showRole && <Td py="py-5" className="text-gray-400">{roles.get(d.id) ?? "—"}</Td>}
            <Td py="py-5" className="tabular-nums text-gray-400">{formatDateShortMs(d.opened_at)}</Td>
            <Td py="py-5" right num className="text-gray-300">
              {d.arbitrators_seated} / {d.required_arbitrators}
            </Td>
            <Td py="py-5" right><StatusPill status={STATUS_LABEL[d.status]} /></Td>
          </Tr>
        ))}
      </DataTable>
    </div>
  );
}

/** The one line above the table explaining what it does not know, and why. */
function YourCases({ state }: { state: ReturnType<typeof useMyDisputes> }) {
  if (state.status === "no-wallet") {
    return (
      <p className="text-xs text-gray-500">
        Connect your wallet to see which of these cases are yours. A node will not say who is in a
        case without a signature from someone who is.
      </p>
    );
  }
  if (state.status === "loaded") {
    const count = state.data?.length ?? 0;
    return (
      <p className="text-xs text-gray-500">
        {count === 0
          ? "None of these cases involve the connected wallet."
          : `${count === 1 ? "One case" : `${count} cases`} involve the connected wallet.`}
      </p>
    );
  }
  return (
    <p className="text-xs text-gray-500">
      {state.error && <span className="mr-2 text-amber-400">{state.error}</span>}
      <button
        type="button"
        onClick={state.read}
        disabled={state.status === "loading"}
        className="text-gray-400 underline decoration-dotted underline-offset-4 hover:text-white disabled:opacity-50"
      >
        {state.status === "loading" ? "Signing…" : "Show which of these are yours"}
      </button>{" "}
      — signs a challenge with your wallet.
    </p>
  );
}
