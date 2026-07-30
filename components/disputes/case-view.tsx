"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { WALLET_CHANGED_EVENT, readWalletConnection } from "@/lib/wallet-connection";
import { peerIdBytesForAddress } from "@/lib/peer-id";
import type { Dispute } from "@/lib/live-disputes";
import { formatDateMs, shortSig } from "@/lib/format";
import { CopyButton } from "@/components/copy-button";
import { Panel } from "@/components/panel";
import { TradeAttachments } from "@/components/orders/trade-attachments";
import { StatusPill } from "@/components/status-pill";

const STATUS_LABEL: Record<Dispute["status"], string> = {
  Open: "Open",
  CaseLocked: "Case Locked",
  RevealPhase: "Reveal Phase",
  Resolved: "Resolved",
};

const RESOLUTION_LABEL: Record<NonNullable<Dispute["resolution"]>, string> = {
  BuyerWins: "Buyer wins",
  MerchantWins: "Merchant wins",
  MutualSettlement: "Mutual settlement",
  Invalid: "Invalid dispute",
};

const toHex = (bytes: number[]) => bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
const shortPeer = (bytes: number[]) => `…${toHex(bytes).slice(-6)}`;
const sameBytes = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * One real dispute, read from `getDispute` (OFS-2400).
 *
 * # What this replaced
 *
 * A mock case view with a "Publish commitment" / "Reveal vote" flow labelled
 * "Simulated — nothing is signed or broadcast", a sealed-evidence list of
 * invented entries, an invented buyer/merchant Solana wallet pair, and an
 * arbitrator roster with invented reputation/stake/reward figures. None of
 * that has a live counterpart: `openfiat_disputes::Dispute` carries no
 * evidence list, no fiat leg, no filing fee, and no per-arbitrator
 * reputation/stake — see `lib/live-disputes.ts`'s own doc.
 *
 * Actually joining a case, committing a vote, and revealing it is the
 * arbitrator console's job (`components/arbitrate/arbitration-console.tsx`,
 * already live against this same RPC surface via `lib/arbitration.ts`) —
 * this page is the disputant-facing read view and does not duplicate that
 * write flow.
 */
export function DisputeCaseView({ dispute }: { dispute: Dispute }) {
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

  const label = (peer: number[], meFlag: boolean) => (meFlag ? "You" : shortPeer(peer));
  const iAmBuyer = myPeerId ? sameBytes(dispute.buyer, myPeerId) : false;
  const iAmSeller = myPeerId ? sameBytes(dispute.seller, myPeerId) : false;
  const iAmOpener = myPeerId ? sameBytes(dispute.opener, myPeerId) : false;

  const resolved = dispute.status === "Resolved";

  return (
    <div className="space-y-6">
      {!resolved && (
        <p className="border-l-2 border-red-400 bg-red-400/5 px-4 py-2.5 text-sm text-red-200">
          Escrow for settlement {dispute.settlement_id} is frozen while this case is open.
        </p>
      )}

      <Panel title="Case record" action={<StatusPill status={STATUS_LABEL[dispute.status]} />}>
        <div className="divide-y divide-white/5 px-4">
          <Row label="Dispute ID" value={dispute.id} mono />
          <Row label="Settlement" value={dispute.settlement_id} mono />
          <Row label="Buyer" value={label(dispute.buyer, iAmBuyer)} />
          <Row label="Seller" value={label(dispute.seller, iAmSeller)} />
          <Row label="Opened by" value={label(dispute.opener, iAmOpener)} />
          <Row label="Reason" value={dispute.reason} />
          <Row label="Arbitrators required" value={String(dispute.required_arbitrators)} />
          <Row label="Filed" value={formatDateMs(dispute.opened_at)} />
          <Row label="Updated" value={formatDateMs(dispute.updated_at)} />
        </div>
      </Panel>

      {/* Evidence, above the arbitrator list because it is what an
          arbitrator has come to read. The panel resolves the settlement's
          own parties on the node, so only the buyer's and seller's
          attachments appear — anyone can publish a record naming this
          settlement. */}
      <Panel title="Evidence">
        <div className="px-4 py-4">
          <TradeAttachments settlementId={dispute.settlement_id} />
        </div>
      </Panel>

      <Panel title={`Arbitrators — ${dispute.arbitrators.length} of ${dispute.required_arbitrators}`}>
        {dispute.arbitrators.length === 0 ? (
          <p className="px-4 py-4 text-sm text-gray-500">No arbitrator has joined this case yet.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {dispute.arbitrators.map((a) => {
              const hex = toHex(a);
              const committed = dispute.commitments.some((c) => sameBytes(c.arbitrator, a));
              const reveal = dispute.reveals.find((r) => sameBytes(r.arbitrator, a));
              return (
                <li key={hex} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="font-mono text-xs text-gray-400">…{hex.slice(-6)}</span>
                  <span className="ml-auto text-xs text-gray-500">
                    {reveal ? (
                      <span className="text-brand-teal">{reveal.vote}</span>
                    ) : committed ? (
                      <span title="Commitment published; vote not yet revealed">committed</span>
                    ) : (
                      <span className="text-gray-600">joined</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {dispute.status === "Resolved" && dispute.resolution && (
        <Panel title={`Outcome — ${RESOLUTION_LABEL[dispute.resolution]}`} className="border-emerald-400/25">
          <div className="px-4 py-4">
            <p className="text-sm leading-relaxed text-gray-200">
              {dispute.reveals.length} of {dispute.arbitrators.length} seated arbitrators revealed a vote.
            </p>
            <div className="mt-4 flex items-start justify-between gap-4 text-sm">
              <span className="shrink-0 text-gray-500">On-chain execution tx</span>
              {dispute.onchain_execution_signature ? (
                <span className="flex min-w-0 items-center gap-2 text-right text-gray-200">
                  <span className="truncate font-mono text-xs">{shortSig(dispute.onchain_execution_signature)}</span>
                  <CopyButton value={dispute.onchain_execution_signature} />
                </span>
              ) : (
                <span className="text-xs text-gray-500">Not yet confirmed on-chain</span>
              )}
            </div>
          </div>
        </Panel>
      )}

      {(dispute.buyer_agreed_mutual_settlement || dispute.seller_agreed_mutual_settlement) && (
        <Panel title="Mutual settlement">
          <div className="divide-y divide-white/5 px-4">
            <Row label="Buyer agreed" value={dispute.buyer_agreed_mutual_settlement ? "Yes" : "No"} />
            <Row label="Seller agreed" value={dispute.seller_agreed_mutual_settlement ? "Yes" : "No"} />
          </div>
        </Panel>
      )}

      <Panel title="How this is decided">
        <p className="px-4 py-3 text-xs leading-relaxed text-gray-500">
          There is no assigned judge. Independent arbitrators stake OPEN to join a case they choose and vote by
          commit-and-reveal, so no one can see how others voted first. Consensus is computed by deterministic rules
          every implementation reaches identically, and the escrow program executes the result without human
          approval. Joining a case, committing, and revealing a vote is the arbitrator console&apos;s job — see{" "}
          <Link href="/arbitrate" className="text-brand hover:text-brand-hover">
            Arbitrate
          </Link>
          .
        </p>
      </Panel>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <span className="shrink-0 text-gray-500">{label}</span>
      <span className={`truncate text-right text-gray-200 ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}
