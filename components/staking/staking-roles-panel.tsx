"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";

import { StatusPill } from "@/components/status-pill";
import { formatNumber } from "@/lib/format";
import { fetchStakeAccount, fetchStakingConfig } from "@/lib/live-staking";
import type { DecodedStakingConfig } from "@/lib/onchain-decode";
import { STAKING_ROLES, toOpen } from "@/lib/staking-roles";
import { WALLET_CHANGED_EVENT, readWalletConnection } from "@/lib/wallet-connection";

/**
 * Every bonded role, with its requirement read off the chain.
 *
 * # No fallback minimums
 *
 * This used to fall back to `lib/data/staking.ts`'s hardcoded `minBond` when
 * the config could not be read, under a banner saying "showing default
 * requirements only". Those defaults were wrong — 1,000 and 10,000 against a
 * live config holding 500 and 500 — so the failure mode was not a stale
 * number but a confidently wrong one, on the screen a merchant uses to
 * decide what to bond. A requirement that cannot be read now renders as "—".
 *
 * # Rewards say nothing
 *
 * The fixture gave each role a rewards line: "Fee share per settled trade",
 * "Share of protocol revenue; the formula is not published", "Arbitration
 * fees per resolved case". Only the second was honest, and it was honest by
 * admitting the other two were guesses. `StakeAccount.pending_rewards` is a
 * real field and `distribute_reward` is a real instruction, but the schedule
 * behind them is an off-chain cranker's, published nowhere this app can
 * read. So that column is gone rather than filled with a description of a
 * policy nobody has stated; the unbonding period, which the config really
 * does carry per role, takes its place.
 */
export function StakingRolesPanel() {
  const t = useTranslations("staking");
  /** A lock period in words, localized. The config holds 24h, 3d and 7d. */
  const unbondLabel = (seconds: bigint): string => {
    const hours = Number(seconds) / 3600;
    if (hours < 48) return t("unbondHours", { count: Math.round(hours) });
    const days = hours / 24;
    return t("unbondDays", { count: Number.isInteger(days) ? days : Number(days.toFixed(1)) });
  };
  const [config, setConfig] = useState<DecodedStakingConfig | null>(null);
  const [positions, setPositions] = useState<Record<string, number>>({});
  const [wallet, setWallet] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setWallet(readWalletConnection()?.address ?? null);
    update();
    window.addEventListener(WALLET_CHANGED_EVENT, update);
    return () => window.removeEventListener(WALLET_CHANGED_EVENT, update);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const live = await fetchStakingConfig();
        if (cancelled) return;
        setConfig(live);
        if (!live) {
          setError(t("noConfig"));
        }

        if (wallet) {
          const owner = new PublicKey(wallet);
          const entries = await Promise.all(
            STAKING_ROLES.map(async (role) => {
              const account = await fetchStakeAccount(owner, role.onchain);
              return [role.key, account ? toOpen(account.amount) : 0] as const;
            }),
          );
          if (!cancelled) setPositions(Object.fromEntries(entries));
        } else {
          setPositions({});
        }
      } catch (err) {
        if (!cancelled) {
          setConfig(null);
          setError(
            err instanceof Error
              ? t("readErrorMsg", { message: err.message })
              : t("readErrorGeneric"),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [wallet, t]);

  return (
    <div>
      {error && <p className="mb-3 text-xs text-amber-300">{error}</p>}
      {!wallet && (
        <p className="mb-3 text-xs text-gray-500">
          {t("connectPromptRoles")}
        </p>
      )}
      <div className="divide-y divide-white/5 border-y border-white/5">
        {STAKING_ROLES.map((role) => {
          const minStake = config?.minStakeByRole[role.onchain];
          const unbonding = config?.unbondingPeriodSecsByRole[role.onchain];
          const staked = wallet ? (positions[role.key] ?? null) : null;
          const active = staked !== null && staked > 0;
          return (
            <div key={role.key} className="flex flex-wrap items-center gap-x-8 gap-y-3 py-6">
              <div className="min-w-64 flex-1">
                <div className="flex items-center gap-3">
                  <h3 className="font-medium text-white">{t(`role.${role.key}.title`)}</h3>
                  <StatusPill
                    status={active ? "Online" : "Not started"}
                    label={active ? t("statusActive") : t("statusNotStarted")}
                  />
                </div>
                <p className="mt-1 max-w-xl text-sm text-gray-400">{t(`role.${role.key}.requirement`)}</p>
              </div>
              <div className="text-sm">
                <p className="text-xs text-gray-500">{t("minimum")}</p>
                <p className="mt-0.5 tabular-nums text-gray-200">
                  {loading
                    ? "…"
                    : minStake === undefined
                      ? "—"
                      : `${formatNumber(toOpen(minStake), 0)} OPEN`}
                </p>
              </div>
              <div className="text-sm">
                <p className="text-xs text-gray-500">{t("youStaked")}</p>
                <p
                  className={`mt-0.5 tabular-nums ${active ? "text-emerald-300" : "text-gray-500"}`}
                >
                  {staked === null ? "—" : `${formatNumber(staked, 0)} OPEN`}
                </p>
              </div>
              <div className="text-sm">
                <p className="text-xs text-gray-500">{t("unbonding")}</p>
                <p className="mt-0.5 text-gray-300">
                  {loading ? "…" : unbonding === undefined ? "—" : unbondLabel(unbonding)}
                </p>
              </div>
              <Link
                href={`/staking/stake?role=${role.key}`}
                className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
              >
                {t("stakeBtn")}
              </Link>
            </div>
          );
        })}
      </div>
      <p className="mt-4 max-w-3xl text-xs leading-relaxed text-gray-500">
        {t.rich("rolesFootnote", {
          code: (chunks) => <code className="text-gray-400">{chunks}</code>,
        })}
      </p>
    </div>
  );
}
