"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { SettlementStatus, Trade, TradeEvent } from "@/lib/types";
import { merchantById } from "@/lib/data/merchants";
import { formatCrypto, formatDate, formatFiat, formatNumber, shortSig } from "@/lib/format";
import { CopyButton } from "@/components/copy-button";
import { MerchantCell } from "@/components/merchant-cell";
import { SettlementSteps } from "@/components/orders/settlement-steps";
import { Panel } from "@/components/panel";
import { StatusPill } from "@/components/status-pill";

const TERMINAL = new Set<SettlementStatus>(["Completed", "Cancelled", "Rejected", "Disputed"]);

interface AttachedFile {
  name: string;
  size: number;
}

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Trade room — redesigned for progressive disclosure: one calm status banner
 * with a single primary action, a compact horizontal stepper, collapsible
 * secondary info, payment-proof gating, and a persistent off-platform warning.
 * All transitions are simulated locally — a live deployment would send signed
 * actions to an OpenFiat node and await protocol events.
 */
export function TradeRoom({ trade }: { trade: Trade }) {
  const [status, setStatus] = useState<SettlementStatus>(trade.status);
  const [events, setEvents] = useState<TradeEvent[]>(trade.events);
  const [secondsLeft, setSecondsLeft] = useState(20 * 60);
  const [draft, setDraft] = useState("");
  const [proof, setProof] = useState<AttachedFile | null>(null);
  const [proofError, setProofError] = useState(false);
  const proofInputRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  // Cosmetic reservation countdown (client-only; starts after hydration).
  useEffect(() => {
    if (TERMINAL.has(status)) return;
    const timer = setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [status]);

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");
  const counterparty = merchantById(trade.counterpartyId);
  const terminal = TERMINAL.has(status);
  const buy = trade.direction === "Buy";
  const awaitingPayment = status === "Awaiting Payment";
  const confirming = status === "Payment Submitted" || status === "Merchant Reviewing";

  function append(actor: string, text: string, kind: "event" | "message" = "event") {
    setEvents((ev) => [...ev, { time: "now", kind, actor, text }]);
  }

  // ── Simulated protocol actions — no funds move, nothing is persisted ──
  function markPaid() {
    if (buy && !proof) {
      setProofError(true);
      return;
    }
    setStatus("Payment Submitted");
    append("You", `PaymentSubmitted — signed “Transferred, notify seller” action recorded for ${formatFiat(trade.fiatAmount, trade.fiatCurrency)}.`);
  }

  function confirmAndRelease() {
    setStatus("Completed");
    append(
      buy ? counterparty.name : "You",
      buy
        ? "PaymentApproved — seller verified fiat receipt off-chain."
        : "PaymentApproved — you verified the funds in your account off-chain.",
    );
    append("Protocol", `SettlementCompleted — ${formatCrypto(trade.cryptoAmount, trade.asset)} released from escrow. Order completed.`);
  }

  function buyerPaid() {
    setStatus("Payment Submitted");
    append(counterparty.name, `PaymentSubmitted — buyer marked ${formatFiat(trade.fiatAmount, trade.fiatCurrency)} as sent.`);
  }

  function cancelTrade() {
    setStatus("Cancelled");
    append("You", "ReservationCancelled — order cancelled by you; any escrow is returned.");
  }

  function openDispute() {
    setStatus("Disputed");
    append("You", "DisputeOpened — appeal filed; escrow frozen automatically pending arbitration (simulated as DSP-101).");
  }

  // ── Attachments (simulated upload — files never leave the browser) ──
  function onProofSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setProof({ name: file.name, size: file.size });
    setProofError(false);
    append("You", `📎 Payment proof attached: ${file.name} (${fmtSize(file.size)})`, "message");
  }

  function onChatFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    append("You", `📎 Attachment: ${file.name} (${fmtSize(file.size)})`, "message");
  }

  // Trade chat — messages are local-only; the counterparty ack is simulated.
  function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    append("You", text, "message");
    setTimeout(() => {
      setEvents((ev) => [...ev, { time: "now", kind: "message", actor: counterparty.name, text: "👍 Noted, thanks — on it." }]);
    }, 1200);
  }

  const bannerLabel = terminal
    ? status === "Completed"
      ? "Order completed"
      : status === "Disputed"
        ? "Appeal in arbitration"
        : "Order cancelled"
    : awaitingPayment
      ? buy
        ? "Pay the seller"
        : "Waiting for the buyer's payment"
      : confirming
        ? buy
          ? "Pending seller's confirmation"
          : "Confirm payment received"
        : "Escrow locked — order placed";

  const primaryAction = (() => {
    if (terminal) return null;
    if (buy && awaitingPayment) {
      return (
        <button
          onClick={markPaid}
          aria-disabled={!proof}
          className={`rounded-md px-4 py-2 text-sm font-semibold text-white transition-colors ${
            proof ? "bg-emerald-600 hover:bg-emerald-500" : "cursor-not-allowed bg-emerald-600/40"
          }`}
        >
          Transferred, notify seller
        </button>
      );
    }
    if (buy && confirming) {
      return (
        <button onClick={confirmAndRelease} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover">
          Seller confirms (simulated)
        </button>
      );
    }
    if (!buy && awaitingPayment) {
      return (
        <button onClick={buyerPaid} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover">
          Buyer paid (simulated)
        </button>
      );
    }
    if (!buy && confirming) {
      return (
        <button onClick={confirmAndRelease} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">
          Payment received — Release crypto
        </button>
      );
    }
    return null;
  })();

  return (
    <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
      <div className="space-y-6">
        {/* Status banner — one step, one action */}
        <div className="rounded-md border border-white/10 px-5 py-5">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <p className="text-xs text-gray-500">Current step</p>
              <p className="mt-0.5 text-lg font-semibold text-white">{bannerLabel}</p>
              {/* Under the step, not beside the action. As a sibling of the
                  button it read as a second thing to attend to; here it is a
                  property of the step you are on. */}
              {!terminal && (
                <p className="mt-1 text-xs tabular-nums text-amber-300">
                  {buy ? "Pay within" : "Buyer pays within"} {mm}:{ss}
                </p>
              )}
            </div>
            <div className="ml-auto flex items-center gap-2.5">
              {primaryAction}
              {terminal && status === "Disputed" && (
                <Link href="/disputes/DSP-101" className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover">
                  View dispute DSP-101
                </Link>
              )}
            </div>
          </div>

          <SettlementSteps
            status={status}
            counterpartyName={counterparty.name}
            buy={buy}
            terminal={terminal}
          />

          {terminal && status !== "Completed" && (
            <div className="mt-4 flex items-center gap-3 border-t border-white/5 pt-4">
              <StatusPill status={status} />
              <p className="text-sm text-gray-400">
                {status === "Disputed" ? "Escrow is frozen until an arbitrator rules." : "This trade ended without settlement."}
              </p>
            </div>
          )}
        </div>

        {/* Secondary actions */}
        {!terminal && (
          <div className="flex flex-wrap items-center gap-2.5">
            {(status === "Escrow Locked" || awaitingPayment) && (
              <button onClick={cancelTrade} className="rounded-md border border-white/15 px-4 py-1.5 text-sm text-gray-300 hover:bg-white/5">
                Cancel Order
              </button>
            )}
            {confirming && (
              <button onClick={openDispute} className="rounded-md border border-red-400/40 bg-red-400/10 px-4 py-1.5 text-sm font-medium text-red-300 hover:bg-red-400/20">
                Appeal
              </button>
            )}
            <span className="text-[11px] text-gray-600">Actions advance the trade locally — simulated.</span>
          </div>
        )}

        {/* Payment details + proof — expanded while it's the task, collapsed after */}
        <details key={status} open={awaitingPayment} className="group rounded-md border border-amber-400/25">
          <summary className="flex items-center justify-between px-4 py-3 text-xs font-semibold uppercase tracking-wider text-amber-200/90">
            Payment details {buy ? "— pay the seller" : "— buyer pays you"}
            <span className="text-gray-500 transition-transform group-open:rotate-90">▸</span>
          </summary>
          <div className="border-t border-white/10">
            <ol className="divide-y divide-white/5">
              {trade.paymentFields.map((f) => (
                <li key={f.label} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="shrink-0 text-xs text-gray-500">{f.label}</span>
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-mono text-xs text-gray-200">{f.value}</span>
                    <CopyButton value={f.value} />
                  </span>
                </li>
              ))}
            </ol>

            {buy && awaitingPayment && (
              <div className="border-t border-white/10 px-4 py-4">
                <div className="flex flex-wrap items-center gap-3">
                  <input ref={proofInputRef} type="file" className="hidden" onChange={onProofSelected} />
                  <button
                    onClick={() => proofInputRef.current?.click()}
                    className="rounded-md border border-white/15 px-3.5 py-1.5 text-sm text-gray-200 hover:bg-white/5"
                  >
                    📎 Attach payment proof
                  </button>
                  {proof ? (
                    <span className="flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-300">
                      {proof.name} · {fmtSize(proof.size)}
                      <button onClick={() => setProof(null)} className="text-emerald-300/70 hover:text-white" aria-label="Remove proof">
                        ✕
                      </button>
                    </span>
                  ) : (
                    <p className="text-xs text-gray-500">
                      Proof of payment is required before you can notify the seller — it protects you if arbitration is needed.
                    </p>
                  )}
                </div>
                {proofError && !proof && (
                  <p className="mt-2 border-l-2 border-amber-400/50 bg-amber-400/5 px-3 py-2 text-xs text-amber-200">
                    Attach your payment receipt first — “Transferred, notify seller” unlocks once proof is attached.
                  </p>
                )}
              </div>
            )}

            <p className="border-t border-white/10 px-4 py-3 text-xs text-gray-500">
              Pay only through the agreed method. Escrow releases only after the{" "}
              {buy ? "seller verifies" : "you verify"} fiat receipt off-chain.
            </p>
          </div>
        </details>

        {/* Persistent off-platform warning */}
        <p className="border-l-2 border-amber-400/60 bg-amber-400/5 px-4 py-3 text-xs leading-relaxed text-amber-200">
          Never pay or chat outside OpenFiat — merchants asking to move to WhatsApp/Telegram or to different account
          details are likely scammers. Only details shown in this order are valid. Our arbitrators can only act on
          on-platform chat and attached proof.
        </p>

        {/* Trade session log + chat */}
        <Panel title="Trade session">
          <ol className="max-h-96 divide-y divide-white/5 overflow-y-auto">
            {events.map((e, i) => {
              const own = e.kind === "message" && e.actor === "You";
              return (
                <li key={i} className={`flex gap-3 px-4 py-3 text-sm ${own ? "bg-brand/[0.04]" : ""}`}>
                  <span className="w-10 shrink-0 pt-0.5 text-right text-xs tabular-nums text-gray-600">{e.time}</span>
                  <div className="min-w-0">
                    <span
                      className={`mr-2 text-xs font-semibold ${
                        e.kind === "event" ? "font-mono text-gray-500" : own ? "text-brand-hover" : "text-gray-300"
                      }`}
                    >
                      {e.actor}
                    </span>
                    <span className={e.kind === "event" ? "text-gray-500" : own ? "text-white" : "text-gray-200"}>
                      {e.text}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
          <form onSubmit={sendMessage} className="flex gap-2.5 border-t border-white/10 px-4 py-3">
            <input ref={chatInputRef} type="file" className="hidden" onChange={onChatFileSelected} />
            <button
              type="button"
              onClick={() => chatInputRef.current?.click()}
              title="Attach a file"
              className="shrink-0 rounded-md border border-white/15 px-3 py-2 text-sm text-gray-400 hover:bg-white/5"
            >
              📎
            </button>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Message ${counterparty.name}…`}
              className="w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm text-white outline-none placeholder:text-gray-600 focus:border-brand/50"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              className="shrink-0 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-40"
            >
              Send
            </button>
          </form>
        </Panel>
      </div>

      {/* Side column — collapsible secondary info */}
      <div className="space-y-6">
        <details className="group rounded-md border border-white/10" open>
          <summary className="flex items-center justify-between px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
            Trade summary
            <span className="text-gray-500 transition-transform group-open:rotate-90">▸</span>
          </summary>
          <div className="divide-y divide-white/5 border-t border-white/10 px-4">
            <div className="py-4">
              <MerchantCell merchant={counterparty} size="md" />
            </div>
            <Row label="Trade ID" value={trade.id} />
            <Row label="Direction" value={`${trade.direction} ${trade.asset}`} />
            <Row label="Amount" value={formatCrypto(trade.cryptoAmount, trade.asset)} />
            <Row label="Fiat total" value={formatFiat(trade.fiatAmount, trade.fiatCurrency)} />
            <Row label="Price" value={`${formatNumber(trade.price)} ${trade.fiatCurrency}/${trade.asset}`} />
            <Row label="Payment method" value={trade.paymentMethod} />
            <Row label="Created" value={formatDate(trade.createdAt)} />
          </div>
        </details>

        <details className="group rounded-md border border-white/10">
          <summary className="flex items-center justify-between px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
            On-chain
            <span className="text-gray-500 transition-transform group-open:rotate-90">▸</span>
          </summary>
          <div className="divide-y divide-white/5 border-t border-white/10 px-4">
            <div className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="shrink-0 text-xs text-gray-500">Escrow creation tx</span>
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate font-mono text-xs text-gray-200">{shortSig(trade.escrowSig)}</span>
                <CopyButton value={trade.escrowSig} />
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="shrink-0 text-xs text-gray-500">Settlement tx</span>
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate font-mono text-xs text-gray-200">{shortSig(trade.txSig)}</span>
                <CopyButton value={trade.txSig} />
              </span>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-right font-mono text-xs tabular-nums text-gray-200">{value}</span>
    </div>
  );
}
