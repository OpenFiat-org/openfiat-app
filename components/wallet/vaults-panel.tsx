"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
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
import { tradingSymbol } from "@/lib/asset-display";
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
  const t = useTranslations("wallet");
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
        {t("vaultsConnectPrompt")}
      </p>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/[0.04] p-6">
        <p className="text-sm font-medium text-red-300">{t("vaultsReadError")}</p>
        <p className="mt-1 text-sm text-gray-400">
          {t("vaultsReadErrorSub")}
        </p>
        <p className="mt-2 font-mono text-xs text-red-400/80">{error}</p>
        <button
          onClick={() => void load(wallet.address)}
          className="mt-4 rounded-md border border-white/15 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-white/5"
        >
          {t("retry")}
        </button>
      </div>
    );
  }

  if (vaults === null) {
    return <p className="p-6 text-sm text-gray-500">{t("vaultsReading")}</p>;
  }

  if (vaults.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-6">
        <p className="text-sm text-gray-300">{t("noVaults")}</p>
        <p className="mt-1.5 text-sm text-gray-500">
          {t("noVaultsSub")}
        </p>
        <Link
          href="/wallet/deposit"
          className="mt-4 inline-block rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
        >
          {t("openVault")}
        </Link>
      </div>
    );
  }

  return (
    <div>
      <MetricStrip
        items={[
          { label: t("metricVaults"), value: String(vaults.length), sub: t("metricVaultsSub") },
          {
            label: t("metricMints"),
            value: String(new Set(vaults.map((v) => v.mint.toBase58())).size),
            sub: t("metricMintsSub"),
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
              <Th>{t("colMint")}</Th>
              <Th right>{t("colAvailable")}</Th>
              <Th right>{t("colReserved")}</Th>
              <Th right>{t("colPendingSettlement")}</Th>
              <Th right>{t("colSettled")}</Th>
              <Th right>{t("colDepositedWithdrawn")}</Th>
              <Th right>{t("colActions")}</Th>
            </tr>
          }
        >
          {vaults.map((v) => {
            const naming = nameForMint(v.mint, mints);
            return (
              <Tr key={v.address.toBase58()}>
                <Td py="py-5">
                  {/* `SOL` for the native mint, because a vault denominated
                      in it is funded and emptied in plain SOL — the wrapping
                      happens inside the deposit and the withdrawal. The line
                      below says what it is actually held as, which is why
                      that line exists. See `lib/asset-display.ts`. */}
                  {naming.kind === "named" && (
                    <span className="block font-medium text-gray-200">
                      {tradingSymbol(v.mint.toBase58(), naming.symbol)}
                    </span>
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
                      {t("heldAsWrapped")}
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
                      {t("noNameForMint")}
                    </span>
                  )}
                  {naming.kind === "unasked" && (
                    <span className="mt-0.5 block text-[11px] text-gray-600">
                      {t("namesUnavailable")}
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
                    {t("deposit")}
                  </Link>
                  <span className="mx-1.5 text-gray-700">·</span>
                  <Link
                    href={`/wallet/withdraw?mint=${v.mint.toBase58()}`}
                    className={
                      v.available > 0n ? "text-gray-400 hover:text-white" : "cursor-not-allowed text-gray-700"
                    }
                    aria-disabled={v.available === 0n}
                    title={v.available === 0n ? t("nothingToWithdraw") : undefined}
                  >
                    {t("withdraw")}
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
          <dt className="font-medium text-emerald-300">{t("colAvailable")}</dt>
          <dd className="mt-0.5 text-gray-500">
            {t("defAvailableDesc")}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-amber-300">{t("colReserved")}</dt>
          <dd className="mt-0.5 text-gray-500">
            {t("defReservedDesc")}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-gray-300">{t("colPendingSettlement")}</dt>
          <dd className="mt-0.5 text-gray-500">
            {t("defPendingDesc")}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-gray-400">{t("colSettled")}</dt>
          <dd className="mt-0.5 text-gray-500">
            {t("defSettledDesc")}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-medium text-gray-400">{t("colDepositedWithdrawn")}</dt>
          <dd className="mt-0.5 text-gray-500">
            {t.rich("defTotalDesc", {
              code: (chunks) => <code className="text-gray-400">{chunks}</code>,
            })}
          </dd>
        </div>
      </dl>
    </div>
  );
}
