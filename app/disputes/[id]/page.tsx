import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { disputeById } from "@/lib/data/disputes";
import { merchantByName } from "@/lib/data/merchants";
import { tradeById } from "@/lib/data/trades";
import { formatDate, shortSig } from "@/lib/format";
import { CopyButton } from "@/components/copy-button";
import { MerchantCell } from "@/components/merchant-cell";
import { Panel } from "@/components/panel";
import { StatusPill } from "@/components/status-pill";

export const metadata: Metadata = {
  title: "Dispute",
};

export default async function DisputePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dispute = disputeById(id);
  if (!dispute) notFound();

  return (
    <section>
      <Link href="/disputes" className="text-sm text-gray-500 hover:text-white">
        ← Back to Disputes
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-white">Dispute {dispute.id}</h1>
        <StatusPill status={dispute.status} />
      </div>

      {dispute.status !== "Closed" && (
        <p className="mt-4 border-l-2 border-red-400 bg-red-400/5 px-4 py-2.5 text-sm text-red-200">
          Escrow for trade {dispute.tradeId} is frozen. Funds cannot move until the arbitrator rules.
        </p>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Panel title="Evidence timeline">
          <ol className="divide-y divide-white/5">
            {dispute.evidence.map((e, i) => (
              <li key={i} className="flex gap-3 px-4 py-3 text-sm">
                <span className="w-10 shrink-0 pt-0.5 text-right text-xs tabular-nums text-gray-600">{e.time}</span>
                <div className="min-w-0">
                  <span className={`mr-2 text-xs font-semibold ${e.kind === "event" ? "text-brand-hover/80" : "text-gray-300"}`}>
                    {e.actor}
                  </span>
                  <span className={e.kind === "event" ? "text-gray-400" : "text-gray-200"}>{e.text}</span>
                </div>
              </li>
            ))}
          </ol>
        </Panel>

        <div className="space-y-6">
          <Panel title="Case details">
            <div className="divide-y divide-white/5 px-4">
              {merchantByName(dispute.counterparty) && (
                <div className="py-4">
                  <MerchantCell merchant={merchantByName(dispute.counterparty)!} size="md" />
                </div>
              )}
              <Row label="Trade" value={dispute.tradeId} href={`/orders/${dispute.tradeId}`} />
              <Row
                label="On-chain tx"
                value={shortSig(tradeById(dispute.tradeId)?.txSig ?? "")}
                copy={tradeById(dispute.tradeId)?.txSig}
              />
              <Row label="Your role" value={dispute.userRole} />
              <Row label="Opened" value={formatDate(dispute.openedAt)} />
              <Row label="Arbitrator" value={dispute.arbitrator} />
            </div>
          </Panel>

          <Panel title="Arbitration">
            <p className="px-4 py-3 text-xs text-gray-500">
              Arbitrators are bonded, OPEN-staked actors assigned from the arbitration pool. Their rulings move the frozen
              escrow PDA on Solana.
            </p>
          </Panel>

          {dispute.status === "Closed" && dispute.outcome && (
            <Panel title={`Resolution — ${dispute.outcome}`} className="border-emerald-400/25">
              <div className="px-4 py-3">
                <p className="text-sm text-gray-200">{dispute.resolutionNote}</p>
                {dispute.reputationImpact && (
                  <p className="mt-2.5 text-xs text-gray-400">Reputation impact: {dispute.reputationImpact}</p>
                )}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </section>
  );
}

function Row({ label, value, href, copy }: { label: string; value: string; href?: string; copy?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="flex min-w-0 items-center gap-2 text-right text-gray-200">
        {href ? (
          <Link href={href} className="text-brand hover:text-brand-hover">{value}</Link>
        ) : (
          <span className={`truncate ${copy ? "font-mono text-xs" : ""}`}>{value}</span>
        )}
        {copy && <CopyButton value={copy} />}
      </span>
    </div>
  );
}
