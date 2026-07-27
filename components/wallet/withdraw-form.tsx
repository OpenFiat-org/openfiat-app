"use client";

import Link from "next/link";
import { useState } from "react";
import type { Asset } from "@/lib/types";
import { WALLET_BALANCES } from "@/lib/data/wallet";
import { formatNumber } from "@/lib/format";
import { AssetIcon } from "@/components/asset-icon";
import { Panel } from "@/components/panel";

const ASSETS: Asset[] = ["USDT", "USDC", "USD1", "SOL", "OPEN"];
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Full-page withdraw flow (simulated — no real transaction). */
export function WithdrawForm({ initialAsset }: { initialAsset?: string }) {
  const [asset, setAsset] = useState<Asset>(
    ASSETS.includes(initialAsset as Asset) ? (initialAsset as Asset) : "USDT",
  );
  const [address, setAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [done, setDone] = useState(false);

  const balance = WALLET_BALANCES.find((b) => b.asset === asset)?.balance ?? 0;
  const value = Number(amount) || 0;
  const fee = Math.max(0.1, value * 0.0005);
  const addressValid = BASE58_RE.test(address.trim());
  const valid = addressValid && value > 0 && value <= balance;

  if (done) {
    return (
      <Panel>
        <div className="px-4 py-14 text-center">
          <p className="text-2xl text-emerald-400">✓</p>
          <h2 className="mt-3 text-lg font-semibold text-white">Withdrawal submitted (simulated)</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-400">
            {formatNumber(value)} {asset} to {address.slice(0, 6)}…{address.slice(-4)} broadcasts after the standard
            security review. Network fee {formatNumber(fee, 4)} {asset}.
          </p>
          <Link
            href="/wallet"
            className="mt-6 inline-block rounded-md bg-brand px-6 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
          >
            Back to Wallet
          </Link>
        </div>
      </Panel>
    );
  }

  const inputCls =
    "w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm text-white outline-none focus:border-brand/50";

  return (
    <Panel title="Withdrawal details">
      <div className="divide-y divide-white/5">
        <div className="px-4 py-6">
          <p className="text-xs text-gray-500">Asset</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {ASSETS.map((a) => (
              <button
                key={a}
                onClick={() => setAsset(a)}
                className={`flex items-center gap-1.5 rounded-md border px-3.5 py-2 text-sm transition-colors ${
                  asset === a ? "border-brand/50 bg-brand/10 text-white" : "border-white/10 text-gray-400 hover:text-white"
                }`}
              >
                {a !== "OPEN" && <AssetIcon asset={a} size={16} />}
                {a}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-5 px-4 py-6">
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="address" className="text-xs text-gray-500">Destination address (Solana)</label>
              {address && !addressValid && <span className="text-xs text-amber-300">Invalid Solana address</span>}
            </div>
            <input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 7xKmVd8hN3pQrS4tUvWxYz2AbCdEfGhJkLmNoPqR9fQ2"
              className={`mt-1.5 font-mono ${inputCls}`}
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="amount" className="text-xs text-gray-500">Amount</label>
              <span className="text-xs tabular-nums text-gray-500">
                Available {formatNumber(balance, asset === "OPEN" ? 0 : 2)} {asset}
                <button onClick={() => setAmount(String(balance))} className="ml-2 text-brand hover:text-brand-hover">
                  Max
                </button>
              </span>
            </div>
            <input
              id="amount"
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={`mt-1.5 tabular-nums ${inputCls}`}
            />
            {value > balance && <p className="mt-1 text-xs text-amber-300">Insufficient balance.</p>}
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>Fee (network + 0.05% protocol)</span>
            <span className="tabular-nums text-gray-300">{formatNumber(fee, 4)} {asset}</span>
          </div>
        </div>

        <div className="px-4 py-6">
          <button
            onClick={() => valid && setDone(true)}
            disabled={!valid}
            className="w-full rounded-md bg-brand py-2.5 text-sm font-semibold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            Submit Withdrawal
          </button>
          <p className="mt-2 text-center text-[11px] text-gray-600">Simulated action — no transaction is signed.</p>
        </div>
      </div>
    </Panel>
  );
}
