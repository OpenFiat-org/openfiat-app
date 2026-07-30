"use client";

import { useCallback, useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { WALLET_CHANGED_EVENT, readWalletConnection, type WalletConnection } from "@/lib/wallet-connection";
import { fetchTokenBalances, type TokenBalance } from "@/lib/live-token-balances";
import { formatBaseUnits, shortMint } from "@/lib/live-vaults";
import { KNOWN_DEVNET_MINTS } from "@/lib/onchain-config";
import { DataTable, Td, Th, Tr } from "@/components/data-table";

/**
 * What the connected wallet actually holds, from its token accounts.
 *
 * The fixture this replaced also carried a "Value (USD)" column. It is gone
 * rather than reimplemented: this app reads no price oracle, the old column
 * was invented per asset, and a dollar figure beside a devnet test token
 * with no market is a specific false claim about what someone owns.
 */
export function BalancesPanel() {
  const [wallet, setWallet] = useState<WalletConnection | null>(null);
  const [balances, setBalances] = useState<TokenBalance[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setWallet(readWalletConnection());
    update();
    window.addEventListener(WALLET_CHANGED_EVENT, update);
    return () => window.removeEventListener(WALLET_CHANGED_EVENT, update);
  }, []);

  const load = useCallback(async (address: string) => {
    setError(null);
    try {
      setBalances(await fetchTokenBalances(new PublicKey(address)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBalances(null);
    }
  }, []);

  useEffect(() => {
    if (wallet) void load(wallet.address);
    else setBalances(null);
  }, [wallet, load]);

  if (!wallet) {
    return <p className="text-sm text-gray-500">Connect a wallet to see what it holds.</p>;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/[0.04] p-6">
        <p className="text-sm font-medium text-red-300">Could not read your token accounts</p>
        <p className="mt-1 text-sm text-gray-400">
          Nothing below is a balance of zero — the lookup itself failed.
        </p>
        <p className="mt-2 font-mono text-xs text-red-400/80">{error}</p>
        <button
          onClick={() => void load(wallet.address)}
          className="mt-4 rounded-md border border-white/15 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-white/5"
        >
          Retry
        </button>
      </div>
    );
  }

  if (balances === null) return <p className="text-sm text-gray-500">Reading token accounts…</p>;

  if (balances.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        This wallet holds no SPL token accounts on devnet. Note that devnet OPEN cannot be obtained at all —
        its mint authority is permanently unset.
      </p>
    );
  }

  return (
    <DataTable
      minWidth={680}
      head={
        <tr>
          <Th>Mint</Th>
          <Th right>Balance</Th>
          <Th right>Token program</Th>
        </tr>
      }
    >
      {balances.map((b) => {
        const known = KNOWN_DEVNET_MINTS.find((m) => m.address === b.mint.toBase58());
        return (
          <Tr key={`${b.mint.toBase58()}-${b.tokenProgram.toBase58()}`}>
            <Td>
              <span className="block font-medium text-gray-200">{known?.label ?? "Unrecognised mint"}</span>
              <span className="mt-0.5 block font-mono text-[11px] text-gray-500" title={b.mint.toBase58()}>
                {shortMint(b.mint)}
              </span>
            </Td>
            <Td right num className="text-gray-200">
              {formatBaseUnits(b.amount, b.decimals)}
            </Td>
            <Td right className="text-[11px] text-gray-500">
              {b.tokenProgram.toBase58().startsWith("Tokenz") ? "Token-2022" : "SPL Token"}
            </Td>
          </Tr>
        );
      })}
    </DataTable>
  );
}
