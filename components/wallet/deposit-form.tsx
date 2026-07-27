"use client";

import Link from "next/link";
import { useState } from "react";
import type { Asset } from "@/lib/types";
import { pseudoAddress, shortAddress } from "@/lib/format";
import { AssetIcon } from "@/components/asset-icon";
import { CopyButton } from "@/components/copy-button";
import { Panel } from "@/components/panel";

const ASSETS: Asset[] = ["USDT", "USDC", "USD1", "SOL", "OPEN"];

/** Full-page deposit flow (simulated — no real address or funds). */
export function DepositForm({ initialAsset }: { initialAsset?: string }) {
  const [asset, setAsset] = useState<Asset>(
    ASSETS.includes(initialAsset as Asset) ? (initialAsset as Asset) : "USDT",
  );
  const [confirmed, setConfirmed] = useState(false);

  const address = pseudoAddress(`openfiat-deposit-${asset}`);

  if (confirmed) {
    return (
      <Panel>
        <div className="px-4 py-14 text-center">
          <p className="text-2xl text-emerald-400">✓</p>
          <h2 className="mt-3 text-lg font-semibold text-white">Deposit detected (simulated)</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-400">
            Your {asset} deposit will credit after 1 Solana confirmation. Balances and vaults update automatically.
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

  return (
    <Panel title="Deposit details">
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
                <AssetIcon asset={a} size={16} />
                {a}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 py-6">
          <p className="text-xs text-gray-500">Your {asset} deposit address (Solana)</p>
          <div className="mt-2.5 flex items-center gap-3 rounded-md border border-white/10 bg-white/[0.03] px-4 py-3">
            <span className="min-w-0 flex-1 truncate font-mono text-sm text-gray-200">{address}</span>
            <CopyButton value={address} />
            <span className="hidden text-xs text-gray-600 sm:block">{shortAddress(address)}</span>
          </div>
          <ul className="mt-4 space-y-1.5 text-xs text-gray-500">
            <li>· Send only {asset} on the <span className="text-gray-300">Solana network</span> — other networks lose funds.</li>
            <li>· Minimum deposit 10 {asset}. Credited after 1 confirmation.</li>
            <li>· To fund a liquidity vault, deposit here first, then allocate from the Wallet page.</li>
          </ul>
        </div>

        <div className="px-4 py-6">
          <button
            onClick={() => setConfirmed(true)}
            className="w-full rounded-md bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            I've sent the funds
          </button>
          <p className="mt-2 text-center text-[11px] text-gray-600">Simulated action — no funds move.</p>
        </div>
      </div>
    </Panel>
  );
}
