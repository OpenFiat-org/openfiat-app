import type { Metadata } from "next";
import Link from "next/link";
import type { Trade } from "@/lib/types";
import { adById, adPrice } from "@/lib/data/ads";
import { buildPaymentFields, tradeById } from "@/lib/data/trades";
import { pseudoSignature, shortSig } from "@/lib/format";
import { CopyButton } from "@/components/copy-button";
import { TradeRoom } from "@/components/orders/trade-room";

export const metadata: Metadata = {
  title: "Trade Room",
};

/**
 * Trade room for a single trade. Known ids render from the simulated trade
 * book; unknown ids (e.g. TRD-DEMO1 created from the exchange modal) render a
 * generic new-trade view synthesized from the query string.
 */
export default async function TradePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const trade = tradeById(id) ?? synthesizeTrade(id, query);

  return (
    <section>
      <Link href="/orders" className="text-sm text-gray-500 hover:text-white">
        ← Back to My Trades
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-white">Trade {trade.id}</h1>
        <span className="flex items-center gap-1.5 font-mono text-xs text-gray-500" title="On-chain settlement transaction">
          ⛓ {shortSig(trade.txSig)}
          <CopyButton value={trade.txSig} />
        </span>
        {trade.id.startsWith("TRD-DEMO") && (
          <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-0.5 text-xs font-medium text-amber-300">
            Simulated new trade
          </span>
        )}
      </div>
      <div className="mt-8">
        <TradeRoom trade={trade} />
      </div>
    </section>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Generic view for client-created reservations not present in the static book. */
function synthesizeTrade(id: string, query: Record<string, string | string[] | undefined>): Trade {
  const ad = adById(first(query.ad) ?? "");
  const price = ad ? adPrice(ad) : 0;
  const fiatAmount = Number(first(query.fiat)) || 0;
  const cryptoAmount = Number(first(query.crypto)) || 0;
  const direction: "Buy" | "Sell" = first(query.dir) === "Sell" ? "Sell" : "Buy";
  const base = {
    id,
    adId: ad?.id ?? "AD-1001",
    counterpartyId: ad?.merchantId ?? "m-kenyastar",
    direction,
    asset: ad?.asset ?? ("USDT" as const),
    cryptoAmount,
    fiatAmount,
    price,
    fiatCurrency: ad?.fiatCurrency ?? "KES",
    paymentMethod: first(query.pm) ?? ad?.paymentMethods[0] ?? "M-Pesa Kenya (Safaricom)",
    paymentInstructions:
      "Payment instructions will appear here once the merchant validates your reservation. (Simulated trade.)",
    status: "Awaiting Payment" as const,
    createdAt: "2026-07-27T14:00:00Z",
    updatedAt: "just now",
    events: [
      { time: "now", kind: "event" as const, actor: "Protocol", text: "ReservationRequested — reservation created (first-come-first-served, 20 min timeout)." },
      { time: "now", kind: "event" as const, actor: "Protocol", text: "ReservationValidated — merchant availability and limits verified." },
      { time: "now", kind: "event" as const, actor: "Protocol", text: "EscrowLocked — crypto locked in escrow PDA on Solana (simulated)." },
    ],
  };
  return {
    ...base,
    paymentFields: buildPaymentFields(base),
    txSig: pseudoSignature(`settlement-${id}`),
    escrowSig: pseudoSignature(`escrow-${id}`),
  };
}
