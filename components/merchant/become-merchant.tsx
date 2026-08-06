"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";

import { fetchStakeAccount, fetchStakingConfig } from "@/lib/live-staking";
import { roleByKey, toOpen } from "@/lib/staking-roles";
import { formatNumber } from "@/lib/format";
import { isComplete, readAccounts, type SavedPaymentAccount } from "@/lib/payment-accounts";
import { fetchAdvertisements } from "@/lib/live-advertisements";
import { peerIdForPublicKey } from "@/lib/arbitration";
import bs58 from "bs58";
import {
  WALLET_CHANGED_EVENT,
  readWalletConnection,
  type WalletConnection,
} from "@/lib/wallet-connection";

/**
 * Becoming a merchant, with every claim on the screen read from somewhere.
 *
 * # There was no such flow
 *
 * `/guide/merchant` is documentation — it explains what a merchant is and
 * links away. The order book's own empty state said "Become a merchant" and
 * pointed at it, so the answer to "how do I start" was an article. Every
 * other P2P desk has a real one: Bybit gates advertiser status behind a
 * security deposit that stays frozen while the status is held, and shows you
 * exactly where you stand against it.
 *
 * That maps onto something this protocol already has — the OPEN merchant
 * bond in `openfiat-staking` — so this screen reads the bond rather than
 * describing it.
 *
 * # Nothing here is a number this app chose
 *
 * The minimum comes from `StakingConfig.min_stake_by_role[Merchant]` on
 * chain, and the unbonding period from the same account. Both are
 * governance-updatable and both have moved: an earlier build of this app
 * hardcoded 1,000 and 10,000 OPEN and refused the real 500 OPEN minimum as
 * "below the minimum". There is deliberately no fallback figure here — when
 * the config cannot be read, this says so and states no requirement at all.
 *
 * # And nothing is a tier, a rating or a completion rate
 *
 * Binance shows merchant levels and 30-day completion rates on this screen.
 * The protocol defines none of those: `getReputation` serializes no tier,
 * and there is no completion-rate figure on any record this app can read.
 * They are absent rather than approximated — a fabricated gate is worse than
 * no gate, because a merchant cannot tell it from a real one.
 */

/** One prerequisite, and what is known about it. The detail is a message
 *  key plus any values — the component resolves it to the merchant's
 *  language. */
type StandingState = "unknown" | "todo" | "done";
interface Standing {
  state: StandingState;
  key: string;
  values?: Record<string, string | number>;
}

interface BondStanding {
  standing: Standing;
  /** Minimum in whole OPEN, or `null` when the chain could not be read. */
  minimum: number | null;
  staked: number | null;
  /** Unbonding period in seconds, or `null` when the chain could not be read. */
  unbondingSecs: bigint | null;
}

const MERCHANT_ROLE = roleByKey("merchant")!;

export function BecomeMerchant() {
  const t = useTranslations("becomeMerchant");
  const St = useTranslations("staking");
  /** A lock period in words, localized (reuses the staking plural keys). */
  const unbondLabel = (seconds: bigint): string => {
    const hours = Number(seconds) / 3600;
    if (hours < 48) return St("unbondHours", { count: Math.round(hours) });
    const days = hours / 24;
    return St("unbondDays", { count: Number.isInteger(days) ? days : Number(days.toFixed(1)) });
  };
  const [wallet, setWallet] = useState<WalletConnection | null>(null);
  const [bond, setBond] = useState<BondStanding | null>(null);
  const [accounts, setAccounts] = useState<SavedPaymentAccount[] | null>(null);
  const [ads, setAds] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    const update = () => setWallet(readWalletConnection());
    update();
    window.addEventListener(WALLET_CHANGED_EVENT, update);
    return () => window.removeEventListener(WALLET_CHANGED_EVENT, update);
  }, []);

  useEffect(() => {
    setAccounts(readAccounts());
    const onStorage = () => setAccounts(readAccounts());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const loadBond = useCallback(async (address: string | null) => {
    setBond(null);
    try {
      const config = await fetchStakingConfig();
      if (!config) {
        setBond({
          standing: { state: "unknown", key: "bondNoConfig" },
          minimum: null,
          staked: null,
          unbondingSecs: null,
        });
        return;
      }
      const minimum = toOpen(config.minStakeByRole[MERCHANT_ROLE.onchain]!);
      const unbondingSecs = config.unbondingPeriodSecsByRole[MERCHANT_ROLE.onchain]!;
      if (!address) {
        setBond({
          standing: { state: "todo", key: "bondConnect" },
          minimum,
          staked: null,
          unbondingSecs,
        });
        return;
      }
      const account = await fetchStakeAccount(new PublicKey(address), MERCHANT_ROLE.onchain);
      const staked = account ? toOpen(account.amount) : 0;
      setBond({
        standing:
          staked >= minimum
            ? {
                state: "done",
                key: "bondDone",
                values: { staked: formatNumber(staked, 0), minimum: formatNumber(minimum, 0) },
              }
            : staked > 0
              ? {
                  state: "todo",
                  key: "bondShort",
                  values: { staked: formatNumber(staked, 0), short: formatNumber(minimum - staked, 0) },
                }
              : { state: "todo", key: "bondNothing" },
        minimum,
        staked,
        unbondingSecs,
      });
    } catch (err) {
      setBond({
        standing:
          err instanceof Error
            ? { state: "unknown", key: "bondReadError", values: { message: err.message } }
            : { state: "unknown", key: "bondReadErrorGeneric" },
        minimum: null,
        staked: null,
        unbondingSecs: null,
      });
    }
  }, []);

  useEffect(() => {
    void loadBond(wallet?.address ?? null);
  }, [wallet, loadBond]);

  // How many advertisements this wallet already has. `undefined` while
  // asking, `null` when the node could not be reached — never rendered as
  // zero, which would read as "you have posted none".
  useEffect(() => {
    if (!wallet) {
      setAds(undefined);
      return;
    }
    let live = true;
    setAds(undefined);
    void (async () => {
      try {
        const merchant = peerIdForPublicKey(bs58.decode(wallet.address));
        const mine = await fetchAdvertisements({ merchant });
        if (live) setAds(mine.filter((ad) => ad.status !== "Deleted").length);
      } catch {
        if (live) setAds(null);
      }
    })();
    return () => {
      live = false;
    };
  }, [wallet]);

  const usableAccounts = (accounts ?? []).filter(isComplete);

  const walletStanding: Standing = wallet
    ? { state: "done", key: "walletDone", values: { address: wallet.address } }
    : { state: "todo", key: "walletTodo" };

  const accountStanding: Standing =
    accounts === null
      ? { state: "unknown", key: "accountReading" }
      : usableAccounts.length > 0
        ? { state: "done", key: "accountDone", values: { count: usableAccounts.length } }
        : (accounts ?? []).length > 0
          ? { state: "todo", key: "accountIncomplete" }
          : { state: "todo", key: "accountNone" };

  return (
    <div className="space-y-10">
      <ol className="divide-y divide-white/5 border-y border-white/5">
        <Requirement
          n={1}
          title={t("req1Title")}
          standing={walletStanding}
          body={t("req1Body")}
          action={
            wallet ? null : (
              <span className="text-xs text-gray-500">{t("useConnect")}</span>
            )
          }
        />
        <Requirement
          n={2}
          title={t("req2Title")}
          standing={bond?.standing ?? { state: "unknown", key: "bondReading" }}
          body={
            bond?.minimum === null || bond === null || bond.unbondingSecs === null
              ? t("req2BodyNoConfig")
              : t("req2Body", { minimum: formatNumber(bond.minimum, 0), unbonding: unbondLabel(bond.unbondingSecs) })
          }
          action={
            <div className="space-y-2">
              <Link
                href="/staking/stake?role=merchant"
                className="inline-block rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
              >
                {t("bondOpen")}
              </Link>
              <p className="max-w-md text-[11px] leading-relaxed text-amber-300/90">
                {t("devnetBondNote")}
              </p>
            </div>
          }
        />
        <Requirement
          n={3}
          title={t("req3Title")}
          standing={accountStanding}
          body={t("req3Body")}
          action={
            <div className="space-y-2">
              <Link
                href="/settings"
                className="inline-block rounded-md border border-white/15 px-4 py-2 text-sm text-gray-200 hover:border-white/30"
              >
                {t("addPaymentAccount")}
              </Link>
              <p className="max-w-md text-[11px] leading-relaxed text-gray-600">
                {t("savedHereNote")}
              </p>
            </div>
          }
        />
      </ol>

      <div className="border-t border-white/5 pt-6">
        <h2 className="text-sm font-medium text-white">{t("whereTitle")}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-400">
          {ads === undefined
            ? wallet
              ? t("adsReading")
              : t("adsConnectPrompt")
            : ads === null
              ? t("adsNodeError")
              : ads === 0
                ? t("adsNone")
                : t("adsCount", { count: ads })}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/ads/new"
            className="rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-hover"
          >
            {t("postAd")}
          </Link>
          <Link
            href="/ads"
            className="rounded-md border border-white/15 px-5 py-2.5 text-sm text-gray-200 hover:border-white/30"
          >
            {t("myAds")}
          </Link>
          <Link
            href="/guide/merchant"
            className="rounded-md border border-white/15 px-5 py-2.5 text-sm text-gray-200 hover:border-white/30"
          >
            {t("howMerchanting")}
          </Link>
        </div>
        <p className="mt-5 max-w-2xl border-l-2 border-white/10 pl-3 text-xs leading-relaxed text-gray-500">
          {t("notEnforcedNote")}
        </p>
      </div>
    </div>
  );
}

/** One step, its live status, and what to do about it. */
function Requirement({
  n,
  title,
  body,
  standing,
  action,
}: {
  n: number;
  title: string;
  body: string;
  standing: Standing;
  action: React.ReactNode;
}) {
  const t = useTranslations("becomeMerchant");
  const mark =
    standing.state === "done" ? "✓" : standing.state === "unknown" ? "?" : String(n);
  const tone =
    standing.state === "done"
      ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-300"
      : standing.state === "unknown"
        ? "border-white/15 text-gray-500"
        : "border-brand bg-brand/20 text-brand-hover";

  return (
    <li className="flex flex-wrap items-start gap-x-8 gap-y-4 py-7">
      <span
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${tone}`}
        aria-hidden
      >
        {mark}
      </span>
      <div className="min-w-64 flex-1">
        <h2 className="font-medium text-white">{title}</h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-gray-400">{body}</p>
        <p
          className={`mt-2 break-all text-xs ${
            standing.state === "done"
              ? "text-emerald-300"
              : standing.state === "unknown"
                ? "text-gray-500"
                : "text-amber-300"
          }`}
        >
          {t(`standing.${standing.key}`, standing.values)}
        </p>
      </div>
      <div className="shrink-0">{action}</div>
    </li>
  );
}
