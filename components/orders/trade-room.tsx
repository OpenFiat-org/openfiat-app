"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { WALLET_CHANGED_EVENT, readWalletConnection } from "@/lib/wallet-connection";
import { peerIdBytesForAddress } from "@/lib/peer-id";
import { deriveStatus, TRADE_STATUS_LABEL, type Trade } from "@/lib/live-trades";
import type { LiveAd } from "@/lib/live-advertisements";
import type { SettlementStatus } from "@/lib/types";
import { formatCrypto, formatDateMs, shortSig } from "@/lib/format";
import { CopyButton } from "@/components/copy-button";
import { ReservationSteps } from "@/components/orders/reservation-steps";
import { SettlementSteps } from "@/components/orders/settlement-steps";
import { Panel } from "@/components/panel";
import { StatusPill } from "@/components/status-pill";

const TERMINAL = new Set<SettlementStatus>(["Completed", "Cancelled", "Rejected", "Disputed"]);

const toHex = (bytes: number[]) => bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
const shortPeer = (bytes: number[]) => `…${toHex(bytes).slice(-6)}`;
const sameBytes = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Trade room, reading one real trade (a `getTrade`-joined reservation +
 * settlement) from a node.
 *
 * # What this replaced
 *
 * Every action here — "Transferred, notify seller", "Buyer paid (simulated)",
 * "Seller confirms (simulated)", cancel, appeal — mutated local React state
 * only; nothing was ever sent to a node. Two things it showed were worse
 * than inert: `trade.paymentFields` was a fabricated bank account number, IBAN,
 * or M-Pesa number generated deterministically from the trade id and
 * presented as the counterparty's real payment details with a copy button,
 * and `trade.txSig`/`trade.escrowSig` were fabricated 88-char base58 strings
 * presented as "Settlement tx"/"Escrow creation tx" with their own copy
 * buttons. Sending real money to the fabricated account, or trusting the
 * fabricated signature as proof of an on-chain release, would have been
 * acting on values nobody ever recorded anywhere.
 *
 * This shows only what the node reports: the reservation, the settlement if
 * one exists, and — the one real transaction signature a trade can carry —
 * `settlement.escrow_release_signature`, shown when the node has one and
 * plainly marked absent when it does not. No action here submits anything;
 * that isn't wired yet, and the notice below says so instead of faking it.
 */
export function TradeRoom({ trade, ad }: { trade: Trade; ad: LiveAd | null }) {
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

  const { reservation, settlement } = trade;
  const status = deriveStatus(trade);
  const statusLabel = TRADE_STATUS_LABEL[status];
  const terminal = TERMINAL.has(statusLabel);
  const escrowLocked = reservation.state === "EscrowLocked";

  const amount = reservation.amount.base_units / 10 ** reservation.amount.decimals;
  const amountLabel = ad ? formatCrypto(amount, ad.asset) : String(amount);

  const iAmRequester = myPeerId ? sameBytes(reservation.requester, myPeerId) : false;
  const iAmBuyer = myPeerId && settlement ? sameBytes(settlement.buyer, myPeerId) : false;
  const iAmSeller = myPeerId && settlement ? sameBytes(settlement.seller, myPeerId) : false;

  // Best-effort only: a settlement's own buyer/seller is authoritative; before
  // one exists, the advertisement's direction is the next best signal, and
  // failing that this just picks a side for the stepper's copy to read.
  const buy = settlement ? iAmBuyer : ad ? ad.direction === "Sell" : true;

  const label = (peer: number[], meFlag: boolean) => (meFlag ? "You" : shortPeer(peer));

  return (
    <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
      <div className="space-y-6">
        <div className="rounded-md border border-white/10 px-5 py-5">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <p className="text-xs text-gray-500">Status</p>
              <p className="mt-0.5 text-lg font-semibold text-white">{statusLabel}</p>
            </div>
            <div className="ml-auto">
              <StatusPill status={statusLabel} />
            </div>
          </div>

          {escrowLocked ? (
            <>
              <ReservationSteps />
              <SettlementSteps
                status={settlement ? statusLabel : "Escrow Locked"}
                counterpartyName={
                  settlement ? shortPeer(iAmBuyer ? settlement.seller : settlement.buyer) : "the merchant"
                }
                buy={buy}
                terminal={terminal}
              />
            </>
          ) : (
            <p className="mt-4 border-t border-white/5 pt-4 text-sm text-gray-400">
              This reservation ended as <span className="font-medium text-gray-200">{reservation.state}</span> before
              escrow ever locked — no settlement exists for it.
            </p>
          )}
        </div>

        <p className="border-l-2 border-amber-400/60 bg-amber-400/5 px-4 py-3 text-xs leading-relaxed text-amber-200">
          This interface only displays what the node reports for this trade — it does not yet submit payment
          confirmations, approvals, cancellations, or dispute filings. Those are signed protocol events
          (<code className="font-mono">sendPaymentSubmitted</code>, <code className="font-mono">sendSettlementApproved</code>,{" "}
          <code className="font-mono">sendDisputeOpen</code>, …) this build doesn&apos;t construct and send yet.
        </p>

        {status === "Disputed" && (
          <Link href="/disputes" className="inline-block rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover">
            View disputes →
          </Link>
        )}

        <Panel title="Reservation">
          <div className="divide-y divide-white/5 px-4">
            <Row label="Reservation ID" value={reservation.id} mono />
            <Row label="Advertisement" value={reservation.advertisement_id} mono copy={reservation.advertisement_id} />
            <Row label="Requester" value={label(reservation.requester, iAmRequester)} />
            <Row label="Amount" value={amountLabel} />
            <Row label="State" value={reservation.state} />
            <Row label="Requested" value={formatDateMs(reservation.requested_at)} />
            <Row label="Updated" value={formatDateMs(reservation.updated_at)} />
            <Row label="Expires" value={formatDateMs(reservation.expires_at)} />
          </div>
        </Panel>

        {settlement && (
          <Panel title="Settlement">
            <div className="divide-y divide-white/5 px-4">
              <Row label="Settlement ID" value={settlement.id} mono />
              <Row label="Buyer" value={label(settlement.buyer, iAmBuyer)} />
              <Row label="Seller" value={label(settlement.seller, iAmSeller)} />
              <Row label="State" value={settlement.state} />
              {settlement.payment_reference && <Row label="Payment reference" value={settlement.payment_reference} />}
              {settlement.payment_submitted_at !== null && (
                <Row label="Payment submitted" value={formatDateMs(settlement.payment_submitted_at)} />
              )}
              {settlement.merchant_responded_at !== null && (
                <Row label="Merchant responded" value={formatDateMs(settlement.merchant_responded_at)} />
              )}
              {settlement.payment_discrepancy && <Row label="Discrepancy" value={settlement.payment_discrepancy} />}
              <Row label="Created" value={formatDateMs(settlement.created_at)} />
              <Row label="Updated" value={formatDateMs(settlement.updated_at)} />
              <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
                <span className="shrink-0 text-gray-500">Escrow release tx</span>
                {settlement.escrow_release_signature ? (
                  <span className="flex min-w-0 items-center gap-2 text-right text-gray-200">
                    <span className="truncate font-mono text-xs">{shortSig(settlement.escrow_release_signature)}</span>
                    <CopyButton value={settlement.escrow_release_signature} />
                  </span>
                ) : (
                  <span className="text-xs text-gray-500">Not yet confirmed on-chain</span>
                )}
              </div>
            </div>
          </Panel>
        )}
      </div>

      <div className="space-y-6">
        {ad && (
          <Panel title="Advertisement">
            <div className="divide-y divide-white/5 px-4">
              <Row label="Pair" value={`${ad.asset}/${ad.fiatCurrency}`} />
              <Row label="Merchant direction" value={ad.direction} />
              <Row label="Price" value={ad.price === null ? "Floating — no oracle read yet" : `${ad.price} ${ad.fiatCurrency}`} />
              <Row label="Payment methods" value={ad.paymentMethods.join(", ") || "—"} />
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, mono, copy }: { label: string; value: string; mono?: boolean; copy?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <span className="shrink-0 text-gray-500">{label}</span>
      <span className="flex min-w-0 items-center gap-2 text-right text-gray-200">
        <span className={`truncate ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
        {copy && <CopyButton value={copy} />}
      </span>
    </div>
  );
}
