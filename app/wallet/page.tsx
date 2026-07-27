import type { Metadata } from "next";
import Link from "next/link";
import { VAULTS, VAULT_EVENTS, WALLET_BALANCES } from "@/lib/data/wallet";
import { CURRENT_USER_WALLET } from "@/lib/data/merchants";
import { formatCrypto, formatNumber } from "@/lib/format";
import { AssetIcon } from "@/components/asset-icon";
import { DataTable, Td, Th, Tr } from "@/components/data-table";
import { MetricStrip } from "@/components/metrics";
import { PageHero } from "@/components/page-hero";
import { Panel } from "@/components/panel";

export const metadata: Metadata = {
  title: "Wallet",
  description: "Simulated OpenFiat wallet — balances, liquidity vaults, deposits and withdrawals.",
};

export default function WalletPage() {
  const totalUsd = WALLET_BALANCES.reduce((s, b) => s + b.fiatValue, 0);

  return (
    <section>
      <PageHero
        variant="bloom"
        title="Wallet"
        description="Simulated balances — connect a wallet and node for live data."
      >
        <div className="flex gap-2.5">
          <Link href="/wallet/deposit" className="rounded-md bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-500">
            Deposit
          </Link>
          <Link href="/wallet/withdraw" className="rounded-md border border-white/15 px-5 py-2 text-sm font-medium text-gray-200 hover:bg-white/5">
            Withdraw
          </Link>
        </div>
      </PageHero>

      <div className="mt-10">
        <MetricStrip
          items={[
            { label: "Connected wallet", value: CURRENT_USER_WALLET, sub: "Solana" },
            { label: "Total value", value: `$${formatNumber(totalUsd)}` },
          ]}
        />
      </div>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wider text-gray-400">Liquidity Vaults</h2>
      <p className="mt-1 text-sm text-gray-500">
        Per-stablecoin vaults back your sell ads. Reservations move balances Available → Reserved → Settled.
      </p>
      <div className="mt-3">
        <DataTable
          minWidth={820}
          head={
            <tr>
              <Th>Asset</Th>
              <Th right>Total</Th>
              <Th right>Available</Th>
              <Th right>Reserved</Th>
              <Th right>Settled</Th>
              <Th right>Utilization</Th>
              <Th right>Actions</Th>
            </tr>
          }
        >
          {VAULTS.map((v) => {
            const pct = Math.round((v.reserved / v.total) * 100);
            return (
              <Tr key={v.asset}>
                <Td py="py-5">
                  <span className="flex items-center gap-2 font-medium text-gray-200">
                    <AssetIcon asset={v.asset} size={16} />
                    {v.asset}
                  </span>
                </Td>
                <Td py="py-5" right num className="text-gray-200">{formatNumber(v.total)}</Td>
                <Td py="py-5" right num className="text-emerald-300">{formatNumber(v.available)}</Td>
                <Td py="py-5" right num className="text-amber-300">{formatNumber(v.reserved)}</Td>
                <Td py="py-5" right num className="text-gray-400">{formatNumber(v.settled)}</Td>
                <Td py="py-5" right num>
                  <span className="inline-flex items-center gap-2">
                    <span className="h-1 w-20 rounded-full bg-white/10">
                      <span className="block h-1 rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="text-xs text-gray-400">{pct}%</span>
                  </span>
                </Td>
                <Td py="py-5" right className="whitespace-nowrap text-xs">
                  <Link href={`/wallet/deposit?asset=${v.asset}`} className="text-emerald-400 hover:text-emerald-300">Deposit</Link>
                  <span className="mx-1.5 text-gray-700">·</span>
                  <Link href={`/wallet/withdraw?asset=${v.asset}`} className="text-gray-400 hover:text-white">Withdraw</Link>
                </Td>
              </Tr>
            );
          })}
        </DataTable>
      </div>

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-gray-400">Balances</h2>
      <div className="mt-3">
        <DataTable
          minWidth={680}
          head={
            <tr>
              <Th>Asset</Th>
              <Th right>Balance</Th>
              <Th right>Value (USD)</Th>
              <Th right>Actions</Th>
            </tr>
          }
        >
          {WALLET_BALANCES.map((b) => (
            <Tr key={b.asset}>
              <Td>
                <span className="flex items-center gap-2 font-medium text-gray-200">
                  <AssetIcon asset={b.asset} size={16} />
                  {b.asset}
                </span>
              </Td>
              <Td right num className="text-gray-200">{formatNumber(b.balance, b.asset === "OPEN" ? 0 : 2)}</Td>
              <Td right num className="text-gray-400">${formatNumber(b.fiatValue)}</Td>
              <Td right className="whitespace-nowrap text-xs">
                <Link href={`/wallet/deposit?asset=${b.asset}`} className="text-emerald-400 hover:text-emerald-300">Deposit</Link>
                <span className="mx-1.5 text-gray-700">·</span>
                <Link href={`/wallet/withdraw?asset=${b.asset}`} className="text-gray-400 hover:text-white">Withdraw</Link>
                {b.asset === "OPEN" && (
                  <>
                    <span className="mx-1.5 text-gray-700">·</span>
                    <Link href="/open" className="text-brand hover:text-brand-hover">Buy OPEN</Link>
                  </>
                )}
              </Td>
            </Tr>
          ))}
        </DataTable>
      </div>

      <div className="mt-10">
        <Panel title="Recent vault events">
          <ol className="divide-y divide-white/5">
            {VAULT_EVENTS.map((e, i) => (
              <li key={i} className="flex items-center gap-4 px-4 py-3 text-sm">
                <span className="w-12 shrink-0 text-xs tabular-nums text-gray-600">{e.time}</span>
                <span className="w-44 shrink-0 font-mono text-xs text-brand-hover">{e.type}</span>
                <span className="min-w-0 flex-1 text-gray-300">{e.summary}</span>
                <span className="tabular-nums text-gray-400">{formatCrypto(e.amount, e.asset)}</span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </section>
  );
}
