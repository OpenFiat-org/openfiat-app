import type { Metadata } from "next";
import Link from "next/link";
import { NETWORK_LABEL, SOLANA_CLUSTER, TOKENS_ARE_WORTHLESS } from "@/lib/node-endpoint";
import { BalancesPanel } from "@/components/wallet/balances-panel";
import { PageHero } from "@/components/page-hero";
import { VaultsPanel } from "@/components/wallet/vaults-panel";

export const metadata: Metadata = {
  title: "Wallet",
  description: "Your real liquidity vaults and token balances on Solana devnet.",
};

/**
 * Everything on this page is read from Solana devnet for the connected
 * wallet. Nothing renders without one, which is the point: the version
 * this replaced showed four funded vaults and $9,428 of balances to every
 * visitor, wallet or no wallet, working cluster or not.
 *
 * The "Recent vault events" feed is gone rather than ported. It was six
 * hardcoded lines with wall-clock timestamps, and a real one needs the
 * program's emitted events indexed over time — which nothing in this app
 * does yet. A feed that invents its own history is worse than no feed.
 */
export default function WalletPage() {
  return (
    <section>
      <PageHero
        variant="bloom"
        title="Wallet"
        description={`Liquidity vaults and token balances read live from ${SOLANA_CLUSTER}.${
          TOKENS_ARE_WORTHLESS ? ` ${NETWORK_LABEL} only — these tokens have no value.` : ""
        }`}
      >
        <div className="flex gap-2.5">
          <Link
            href="/wallet/deposit"
            className="rounded-md bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            Deposit
          </Link>
          <Link
            href="/wallet/withdraw"
            className="rounded-md border border-white/15 px-5 py-2 text-sm font-medium text-gray-200 hover:bg-white/5"
          >
            Withdraw
          </Link>
        </div>
      </PageHero>

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-gray-400">Liquidity vaults</h2>
      <p className="mt-1 max-w-3xl text-sm text-gray-500">
        One vault per token mint, holding the inventory that backs your sell advertisements. Deposits raise
        what you can offer; a reservation moves balance out of Available and into Reserved.
      </p>
      <div className="mt-4">
        <VaultsPanel />
      </div>

      <h2 className="mt-12 text-sm font-semibold uppercase tracking-wider text-gray-400">Wallet balances</h2>
      <p className="mt-1 max-w-3xl text-sm text-gray-500">
        Tokens held by your wallet directly — separate from vault balances, which are held by the escrow
        program on your behalf.
      </p>
      <div className="mt-4">
        <BalancesPanel />
      </div>
    </section>
  );
}
