"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Advertisement, Merchant } from "@/lib/types";
import { adPrice } from "@/lib/data/ads";
import { formatCrypto, formatFiat, formatNumber } from "@/lib/format";
import { MerchantCell } from "@/components/merchant-cell";
import { Panel } from "@/components/panel";

// Simulated reservation ids — a real node would return the reservation id
// from the ReservationRequested event. Module counter keeps ids unique per session.
let demoCounter = 0;

/** Full-page trade creation flow (replaces the old reservation modal). */
export function NewTradeForm({
  ad,
  merchant,
  userDirection,
}: {
  ad: Advertisement;
  merchant: Merchant;
  userDirection: "Buy" | "Sell";
}) {
  const router = useRouter();
  const price = adPrice(ad);
  // International ads accept any payment method — offer the common global rails.
  const methods = ad.international
    ? ["Bank Transfer", "Wise", "Revolut", "Mobile Money", "M-Pesa", "UPI", "PIX"]
    : ad.paymentMethods;
  const [mode, setMode] = useState<"fiat" | "crypto">("fiat");
  const [raw, setRaw] = useState("");
  const [method, setMethod] = useState(methods[0]);

  const amount = Number(raw) || 0;
  const fiatAmount = mode === "fiat" ? amount : amount * price;
  const cryptoAmount = mode === "crypto" ? amount : amount / price;

  const belowMin = fiatAmount > 0 && fiatAmount < ad.minTrade;
  const aboveMax = fiatAmount > ad.maxTrade;
  const aboveLiquidity = cryptoAmount > ad.availableLiquidity;
  const valid = fiatAmount >= ad.minTrade && fiatAmount <= ad.maxTrade && cryptoAmount <= ad.availableLiquidity;

  const buy = userDirection === "Buy";

  function createReservation() {
    if (!valid) return;
    // Simulated reservation — nothing is sent to a node.
    demoCounter += 1;
    const id = `TRD-DEMO${demoCounter}`;
    const params = new URLSearchParams({
      ad: ad.id,
      fiat: fiatAmount.toFixed(2),
      crypto: cryptoAmount.toFixed(4),
      dir: userDirection,
      pm: method,
    });
    router.push(`/orders/${id}?${params.toString()}`);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Panel title="Order details">
        <div className="divide-y divide-white/5">
          <div className="px-4 py-5">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <label htmlFor="amount">Amount</label>
              <button
                onClick={() => setMode(mode === "fiat" ? "crypto" : "fiat")}
                className="text-brand hover:text-brand-hover"
              >
                Switch to {mode === "fiat" ? ad.asset : ad.fiatCurrency}
              </button>
            </div>
            <div className="mt-1.5 flex items-center gap-2 rounded-md border border-white/10 px-3 focus-within:border-brand/50">
              <input
                id="amount"
                type="number"
                min="0"
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                placeholder={
                  mode === "fiat"
                    ? `${formatNumber(ad.minTrade, 0)} – ${formatNumber(ad.maxTrade, 0)}`
                    : "0.00"
                }
                className="w-full bg-transparent py-2.5 text-sm tabular-nums text-white outline-none placeholder:text-gray-600"
              />
              <span className="text-sm font-medium text-gray-400">
                {mode === "fiat" ? ad.fiatCurrency : ad.asset}
              </span>
            </div>
            <p className="mt-1.5 text-xs tabular-nums text-gray-500">
              ≈ {mode === "fiat" ? formatCrypto(cryptoAmount, ad.asset, 4) : formatFiat(fiatAmount, ad.fiatCurrency)} at{" "}
              {formatNumber(price)} {ad.fiatCurrency}/{ad.asset}
            </p>
            <div className="mt-3 space-y-1.5 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm">
              <p className="flex justify-between">
                <span className="text-gray-500">You pay</span>
                <span className="tabular-nums font-medium text-white">
                  {buy ? formatFiat(fiatAmount, ad.fiatCurrency) : formatCrypto(cryptoAmount, ad.asset, 4)}
                </span>
              </p>
              <p className="flex justify-between">
                <span className="text-gray-500">You receive</span>
                <span className="tabular-nums font-medium text-emerald-400">
                  {buy ? formatCrypto(cryptoAmount, ad.asset, 4) : formatFiat(fiatAmount, ad.fiatCurrency)}
                </span>
              </p>
            </div>
            {belowMin && (
              <p className="mt-1 text-xs text-amber-300">Minimum trade is {formatFiat(ad.minTrade, ad.fiatCurrency, 0)}.</p>
            )}
            {aboveMax && (
              <p className="mt-1 text-xs text-amber-300">Maximum trade is {formatFiat(ad.maxTrade, ad.fiatCurrency, 0)}.</p>
            )}
            {aboveLiquidity && (
              <p className="mt-1 text-xs text-amber-300">Only {formatCrypto(ad.availableLiquidity, ad.asset)} available.</p>
            )}
          </div>

          <div className="px-4 py-5">
            <p className="text-xs text-gray-500">
              Payment method{ad.international ? " — international merchant, any method accepted" : ""}
            </p>
            <div className="mt-2 space-y-1">
              {methods.map((m) => (
                <label
                  key={m}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-sm ${
                    method === m ? "border-brand/50 bg-brand/5 text-white" : "border-white/10 text-gray-400 hover:text-white"
                  }`}
                >
                  <input
                    type="radio"
                    name="pm"
                    checked={method === m}
                    onChange={() => setMethod(m)}
                    className="accent-brand"
                  />
                  {m}
                </label>
              ))}
            </div>
          </div>

          <div className="px-4 py-5">
            <button
              onClick={createReservation}
              disabled={!valid}
              className={`w-full rounded-md py-2.5 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                buy ? "bg-emerald-600 hover:bg-emerald-500" : "bg-orange-600 hover:bg-orange-500"
              }`}
            >
              Place Order
            </button>
            <p className="mt-2 text-center text-[11px] text-gray-600">
              Simulated action — your reservation holds for ~20 minutes; no funds move.
            </p>
          </div>
        </div>
      </Panel>

      <Panel title="Advertisement">
        <div className="divide-y divide-white/5 px-4">
          <div className="py-4">
            <MerchantCell merchant={merchant} size="md" />
            <p className="mt-1.5 pl-[52px] text-xs text-gray-500">Responds {merchant.avgResponseTime}</p>
          </div>
          <SummaryRow label="Ad" value={ad.id} />
          <SummaryRow label="Direction" value={`Merchant ${ad.direction}`} />
          <SummaryRow label="Pair" value={`${ad.asset}/${ad.fiatCurrency}`} />
          <SummaryRow
            label="Price"
            value={`${formatNumber(price)} ${ad.fiatCurrency} (${
              ad.pricing.type === "Floating"
                ? `Floating ${ad.pricing.premiumPct >= 0 ? "+" : ""}${ad.pricing.premiumPct}%`
                : "Fixed"
            })`}
          />
          <SummaryRow label="Available" value={formatCrypto(ad.availableLiquidity, ad.asset)} />
          <SummaryRow
            label="Limits"
            value={`${formatFiat(ad.minTrade, ad.fiatCurrency, 0)} – ${formatFiat(ad.maxTrade, ad.fiatCurrency, 0)}`}
          />
          <div className="py-3 text-xs text-gray-500">
            <p className="font-medium text-gray-400">Advertiser terms</p>
            <p className="mt-1">Pay within 15 minutes · no third-party payments · mark as paid only after sending.</p>
          </div>
          <div className="py-3 text-xs text-gray-500">
            Your {buy ? "escrow-protected" : "vault-backed"} reservation holds for ~20 minutes. Escrow is enforced by
            audited Solana programs; OpenFiat never takes custody of fiat.
          </div>
        </div>
      </Panel>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-right tabular-nums text-gray-200">{value}</span>
    </div>
  );
}

/** Empty state when the ad id is missing or unknown. */
export function NewTradeMissingAd() {
  return (
    <Panel>
      <div className="px-4 py-10 text-center text-sm text-gray-500">
        <p>This advertisement could not be found — it may have been paused or filled.</p>
        <Link href="/" className="mt-3 inline-block text-brand hover:text-brand-hover">
          ← Back to the P2P exchange
        </Link>
      </div>
    </Panel>
  );
}
