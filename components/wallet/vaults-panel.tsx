"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { WALLET_CHANGED_EVENT, readWalletConnection, type WalletConnection } from "@/lib/wallet-connection";
import {
  fetchVaultsByMerchant,
  formatBaseUnits,
  nameForMint,
  shortMint,
  type LiveVault,
} from "@/lib/live-vaults";
import { useMintNames } from "@/components/wallet/use-mint-names";
import { isWrappedSol } from "@/lib/vault-instructions";
import { DataTable, Td, Th, Tr } from "@/components/data-table";
import { MetricStrip } from "@/components/metrics";

/**
 * The connected wallet's real `LiquidityVault` accounts.
 *
 * # The counters are not interchangeable, and the table says so
 *
 * The fixture this replaced listed Total first and Available third, in the
 * same weight, as though they were two views of one number. They are not.
 * `available` is the only figure the escrow program will let a reservation
 * or a withdrawal draw against; `total` is deposits minus withdrawals and
 * is never reduced by settlement, so a vault that has traded away
 * everything it held still reports its full historical deposit.
 *
 * The one vault currently live on devnet has exactly that shape — total
 * 2,000, available 0 — so a table that led with Total would be wrong by the
 * entire balance on the only real data there is. Available leads here, and
 * Total is labelled as the lifetime figure it is.
 */
export function VaultsPanel() {
  // Names come from the node, never from a table here — see `nameForMint`.
  const mints = useMintNames();
  const [wallet, setWallet] = useState<WalletConnection | null>(null);
  const [vaults, setVaults] = useState<LiveVault[] | null>(null);
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
      setVaults(await fetchVaultsByMerchant(new PublicKey(address)));
    } catch (err) {
      // An unreachable cluster must never render as "no vaults". A merchant
      // deciding whether to deposit needs to know whether the vault they
      // are about to fund genuinely does not exist, or merely could not be
      // looked up.
      setError(err instanceof Error ? err.message : String(err));
      setVaults(null);
    }
  }, []);

  useEffect(() => {
    if (wallet) void load(wallet.address);
    else setVaults(null);
  }, [wallet, load]);

  if (!wallet) {
    return (
      <p className="rounded-lg border border-white/10 bg-white/[0.02] p-6 text-sm text-gray-400">
        Connect a wallet to see the liquidity vaults it owns on Solana devnet. A vault is a program account
        derived from your wallet address and a token mint — there is no account to register, and nothing is
        shown here until a wallet is connected.
      </p>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/[0.04] p-6">
        <p className="text-sm font-medium text-red-300">Could not read your vaults from Solana devnet</p>
        <p className="mt-1 text-sm text-gray-400">
          This is a connection failure, not an answer. You may well have vaults — this screen simply could not
          ask. Do not treat it as an empty balance.
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

  if (vaults === null) {
    return <p className="p-6 text-sm text-gray-500">Reading your vaults from devnet…</p>;
  }

  if (vaults.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-6">
        <p className="text-sm text-gray-300">This wallet owns no liquidity vaults yet.</p>
        <p className="mt-1.5 text-sm text-gray-500">
          That is an answer from the chain, not a failed lookup. A vault is created the first time you deposit
          into one, and holds a single token mint.
        </p>
        <Link
          href="/wallet/deposit"
          className="mt-4 inline-block rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
        >
          Open a vault with a deposit
        </Link>
      </div>
    );
  }

  return (
    <div>
      <MetricStrip
        items={[
          { label: "Vaults", value: String(vaults.length), sub: "one per token mint" },
          {
            label: "Mints held",
            value: String(new Set(vaults.map((v) => v.mint.toBase58())).size),
            sub: "balances are per mint, not summed",
          },
        ]}
      />

      {/*
        * No "total value" figure. Summing balances across mints needs a
        * price for each, this app reads no oracle, and the fixture's own
        * total was the sum of invented USD values. An absent number is
        * better than a confident wrong one.
        */}

      <div className="mt-6">
        <DataTable
          minWidth={960}
          head={
            <tr>
              <Th>Mint</Th>
              <Th right>Available</Th>
              <Th right>Reserved</Th>
              <Th right>Pending settlement</Th>
              <Th right>Settled (lifetime)</Th>
              <Th right>Deposited − withdrawn</Th>
              <Th right>Actions</Th>
            </tr>
          }
        >
          {vaults.map((v) => {
            const naming = nameForMint(v.mint, mints);
            return (
              <Tr key={v.address.toBase58()}>
                <Td py="py-5">
                  {naming.kind === "named" && (
                    <span className="block font-medium text-gray-200">{naming.symbol}</span>
                  )}
                  <a
                    href={`https://explorer.solana.com/address/${v.mint.toBase58()}?cluster=devnet`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-0.5 block font-mono text-[11px] text-gray-500 hover:text-gray-300"
                    title={v.mint.toBase58()}
                  >
                    {shortMint(v.mint)}
                  </a>
                  {/*
                    * The vault genuinely holds wrapped SOL, and the mint
                    * address above is wSOL's. Saying so beside a row
                    * labelled "SOL" is the honest version of hiding the
                    * wrapping: the user never has to act on it, but the
                    * address they can see still means what it says.
                    */}
                  {isWrappedSol(v.mint) && (
                    <span className="mt-0.5 block text-[11px] text-gray-600">
                      Held as wrapped SOL; deposits and withdrawals convert in the same transaction.
                    </span>
                  )}
                  {/*
                    * Two different silences, and only one is worth an
                    * amber warning. `unnamed` means the node answered and
                    * has no name for this address — worth flagging to a
                    * merchant about to trade against it. `unasked` means we
                    * could not reach a node, which is a fact about this
                    * app's connection and says nothing about the mint, so
                    * it must not be dressed up as a finding. `asking` is a
                    * request in flight and says nothing at all.
                    */}
                  {naming.kind === "unnamed" && (
                    <span className="mt-0.5 block text-[11px] text-amber-300/80">
                      No node has a name for this mint — check the address.
                    </span>
                  )}
                  {naming.kind === "unasked" && (
                    <span className="mt-0.5 block text-[11px] text-gray-600">
                      Token names could not be read from an OpenFiat node.
                    </span>
                  )}
                </Td>
                <Td py="py-5" right num className="text-base font-semibold text-emerald-300">
                  {formatBaseUnits(v.available, v.decimals)}
                </Td>
                <Td py="py-5" right num className="text-amber-300">
                  {formatBaseUnits(v.reserved, v.decimals)}
                </Td>
                <Td py="py-5" right num className="text-gray-300">
                  {formatBaseUnits(v.pendingSettlement, v.decimals)}
                </Td>
                <Td py="py-5" right num className="text-gray-500">
                  {formatBaseUnits(v.settled, v.decimals)}
                </Td>
                <Td py="py-5" right num className="text-gray-500">
                  {formatBaseUnits(v.total, v.decimals)}
                </Td>
                <Td py="py-5" right className="whitespace-nowrap text-xs">
                  <Link
                    href={`/wallet/deposit?mint=${v.mint.toBase58()}`}
                    className="text-emerald-400 hover:text-emerald-300"
                  >
                    Deposit
                  </Link>
                  <span className="mx-1.5 text-gray-700">·</span>
                  <Link
                    href={`/wallet/withdraw?mint=${v.mint.toBase58()}`}
                    className={
                      v.available > 0n ? "text-gray-400 hover:text-white" : "cursor-not-allowed text-gray-700"
                    }
                    aria-disabled={v.available === 0n}
                    title={v.available === 0n ? "Nothing available to withdraw" : undefined}
                  >
                    Withdraw
                  </Link>
                </Td>
              </Tr>
            );
          })}
        </DataTable>
      </div>

      {/*
        * Every column above is a u64 the program stores, and four of the
        * five are easy to mistake for a spendable balance. Naming them in
        * the header is not enough, so each is defined once, here.
        */}
      <dl className="mt-5 grid gap-x-8 gap-y-3 border-t border-white/10 pt-5 text-xs sm:grid-cols-2">
        <div>
          <dt className="font-medium text-emerald-300">Available</dt>
          <dd className="mt-0.5 text-gray-500">
            The only figure a new reservation or a withdrawal can draw against. The program checks this and
            nothing else.
          </dd>
        </div>
        <div>
          <dt className="font-medium text-amber-300">Reserved</dt>
          <dd className="mt-0.5 text-gray-500">
            Committed to reservations that have not yet been funded into an escrow. Still in the vault, but
            already spoken for.
          </dd>
        </div>
        <div>
          <dt className="font-medium text-gray-300">Pending settlement</dt>
          <dd className="mt-0.5 text-gray-500">
            Funded into open trade escrows. These tokens have left the vault and may still come back if a
            trade is cancelled or expires.
          </dd>
        </div>
        <div>
          <dt className="font-medium text-gray-400">Settled (lifetime)</dt>
          <dd className="mt-0.5 text-gray-500">
            Cumulative amount that completed settlement and left for good. It only ever goes up.
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-medium text-gray-400">Deposited − withdrawn</dt>
          <dd className="mt-0.5 text-gray-500">
            The program calls this field <code className="text-gray-400">total</code>, but it is not a
            balance and it is not the sum of the other columns. Settlement never reduces it, so a vault that
            has traded away everything it held still shows its full historical deposit here while holding
            nothing. Do not size an advertisement against this number — size it against Available.
          </dd>
        </div>
      </dl>
    </div>
  );
}
