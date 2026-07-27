"use client";

import Link from "next/link";
import { useState } from "react";
import { PRESALE } from "@/lib/data/sale";
import { formatNumber } from "@/lib/format";
import { Panel } from "@/components/panel";

const inputCls =
  "w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm text-white outline-none focus:border-brand/50 [&>option]:bg-[#10151d]";

/** Presale purchase widget (simulated — no transaction is signed). */
export function BuyOpen() {
  const [payWith, setPayWith] = useState<"USDC" | "USDT">("USDC");
  const [raw, setRaw] = useState("");
  const [done, setDone] = useState(false);

  const amount = Number(raw) || 0;
  const receive = amount / PRESALE.priceUsdc;
  const belowMin = amount > 0 && amount < PRESALE.minContribution;
  const aboveMax = amount > PRESALE.maxContribution;
  const valid = amount >= PRESALE.minContribution && amount <= PRESALE.maxContribution;
  const pct = Math.round((PRESALE.raised / PRESALE.cap) * 100);

  if (done) {
    return (
      <Panel>
        <div className="px-4 py-14 text-center">
          <p className="text-2xl text-emerald-400">✓</p>
          <h2 className="mt-3 text-lg font-semibold text-white">Contribution recorded (simulated)</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-400">
            {formatNumber(amount, 0)} {payWith} → {formatNumber(receive, 0)} OPEN at {PRESALE.priceUsdc} {payWith}/OPEN.
            OPEN will be claimable to your wallet when the network goes live.
          </p>
          <Link
            href="/staking"
            className="mt-6 inline-block rounded-md bg-brand px-6 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
          >
            See what OPEN unlocks →
          </Link>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title={`${PRESALE.phase} — buy OPEN`}>
      <div className="divide-y divide-white/5">
        <div className="px-4 py-6">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Allocation raised</span>
            <span className="tabular-nums">
              ${formatNumber(PRESALE.raised, 0)} / ${formatNumber(PRESALE.cap, 0)} ({pct}%)
            </span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-white/10">
            <div className="h-2 rounded-full bg-gradient-to-r from-brand to-brand-teal" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Min {formatNumber(PRESALE.minContribution, 0)} {payWith} · max {formatNumber(PRESALE.maxContribution, 0)}{" "}
            {payWith} per wallet.
          </p>
        </div>

        <div className="grid gap-5 px-4 py-6 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-gray-500">Pay with</label>
            <select value={payWith} onChange={(e) => setPayWith(e.target.value as "USDC" | "USDT")} className={inputCls}>
              <option value="USDC">USDC</option>
              <option value="USDT">USDT</option>
            </select>
          </div>
          <div>
            <label htmlFor="open-amount" className="mb-1 block text-xs text-gray-500">
              Amount ({payWith})
            </label>
            <input
              id="open-amount"
              type="number"
              min="0"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={`${PRESALE.minContribution} – ${formatNumber(PRESALE.maxContribution, 0)}`}
              className={`tabular-nums ${inputCls}`}
            />
          </div>
        </div>

        <div className="px-4 py-6">
          <p className="flex items-center justify-between rounded-md border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
            <span className="text-gray-500">You receive</span>
            <span className="font-mono text-base font-semibold tabular-nums text-white">
              {formatNumber(receive, 0)} OPEN
            </span>
          </p>
          {belowMin && <p className="mt-1.5 text-xs text-amber-300">Minimum contribution is {PRESALE.minContribution} {payWith}.</p>}
          {aboveMax && <p className="mt-1.5 text-xs text-amber-300">Maximum contribution is {formatNumber(PRESALE.maxContribution, 0)} {payWith}.</p>}
          <button
            onClick={() => valid && setDone(true)}
            disabled={!valid}
            className="mt-4 w-full rounded-md bg-brand py-2.5 text-sm font-semibold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            Buy OPEN
          </button>
          <p className="mt-2 text-center text-[11px] text-gray-600">
            Simulated purchase — no funds move. OPEN P2P trading and swapping unlock when the network goes live.
          </p>
        </div>
      </div>
    </Panel>
  );
}
