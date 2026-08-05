"use client";

import { Link } from "@/i18n/navigation";
import { useCallback, useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";

import { fetchStakeAccount, fetchStakingConfig } from "@/lib/live-staking";
import { roleByKey, toOpen, unbondingLabel } from "@/lib/staking-roles";
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

/** One prerequisite, and what is known about it. */
type Standing =
  | { state: "unknown"; detail: string }
  | { state: "todo"; detail: string }
  | { state: "done"; detail: string };

interface BondStanding {
  standing: Standing;
  /** Minimum in whole OPEN, or `null` when the chain could not be read. */
  minimum: number | null;
  staked: number | null;
  unbonding: string | null;
}

const MERCHANT_ROLE = roleByKey("merchant")!;

export function BecomeMerchant() {
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
          standing: {
            state: "unknown",
            detail:
              "No staking config exists on this cluster, so nothing has set a merchant minimum yet.",
          },
          minimum: null,
          staked: null,
          unbonding: null,
        });
        return;
      }
      const minimum = toOpen(config.minStakeByRole[MERCHANT_ROLE.onchain]!);
      const unbonding = unbondingLabel(
        config.unbondingPeriodSecsByRole[MERCHANT_ROLE.onchain]!,
      );
      if (!address) {
        setBond({
          standing: { state: "todo", detail: "Connect a wallet to see what it has bonded." },
          minimum,
          staked: null,
          unbonding,
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
                detail: `${formatNumber(staked, 0)} OPEN bonded — at or above the ${formatNumber(minimum, 0)} OPEN minimum.`,
              }
            : {
                state: "todo",
                detail:
                  staked > 0
                    ? `${formatNumber(staked, 0)} OPEN bonded, ${formatNumber(minimum - staked, 0)} short of the minimum.`
                    : "Nothing bonded for the merchant role on this wallet.",
              },
        minimum,
        staked,
        unbonding,
      });
    } catch (err) {
      setBond({
        standing: {
          state: "unknown",
          detail:
            err instanceof Error
              ? `Couldn't read the staking program: ${err.message}`
              : "Couldn't read the staking program.",
        },
        minimum: null,
        staked: null,
        unbonding: null,
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
    ? { state: "done", detail: `Connected as ${wallet.address}` }
    : { state: "todo", detail: "Nothing is connected, so nothing can sign an advertisement." };

  const accountStanding: Standing =
    accounts === null
      ? { state: "unknown", detail: "Reading this browser's saved accounts…" }
      : usableAccounts.length > 0
        ? {
            state: "done",
            detail: `${usableAccounts.length} complete account${usableAccounts.length === 1 ? "" : "s"} saved in this browser.`,
          }
        : {
            state: "todo",
            detail:
              (accounts ?? []).length > 0
                ? "Every saved account is missing at least one field, so a buyer could not pay into it."
                : "No payment account saved yet.",
          };

  return (
    <div className="space-y-10">
      <ol className="divide-y divide-white/5 border-y border-white/5">
        <Requirement
          n={1}
          title="A wallet"
          standing={walletStanding}
          body="It signs every advertisement and every settlement, and it is the merchant identity the network sees. There is no account to create and no identity check."
          action={
            wallet ? null : (
              <span className="text-xs text-gray-500">Use Connect wallet in the header.</span>
            )
          }
        />
        <Requirement
          n={2}
          title="The merchant bond"
          standing={bond?.standing ?? { state: "unknown", detail: "Reading the staking program…" }}
          body={
            bond?.minimum === null || bond === null
              ? "Bonded OPEN is what a merchant has at risk if they do not settle. The requirement lives on chain, in the staking program's own config."
              : `${formatNumber(bond.minimum, 0)} OPEN, bonded for the merchant role. It stays locked while you hold the role and takes ${bond.unbonding ?? "a lock period"} to release after you unbond. Read from StakingConfig on chain — this app keeps no copy of the figure.`
          }
          action={
            <div className="space-y-2">
              <Link
                href="/staking/stake?role=merchant"
                className="inline-block rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
              >
                Bond OPEN
              </Link>
              {/*
                * The one thing on this page that cannot be completed on
                * devnet, said here rather than discovered at the signature.
                * The OPEN mint's authority was permanently unset when it was
                * created, so no wallet can be issued any — verified with
                * `spl-token display <mint> --url devnet`, and the reason
                * `tests/e2e/stake.spec.ts` proves only the account-creation
                * half of staking.
                */}
              <p className="max-w-md text-[11px] leading-relaxed text-amber-300/90">
                On devnet this step cannot actually be finished: the OPEN mint&rsquo;s authority is
                permanently unset, so no wallet can obtain any and the token transfer has nothing to
                move. Creating the stake account works; funding it does not. That is a fact about
                this cluster, not a limitation of the form.
              </p>
            </div>
          }
        />
        <Requirement
          n={3}
          title="Somewhere to be paid"
          standing={accountStanding}
          body="At least one account you receive fiat into. When a buyer takes your sell order you nominate one of these, and they see each field separately so they can copy it without retyping."
          action={
            <div className="space-y-2">
              <Link
                href="/settings"
                className="inline-block rounded-md border border-white/15 px-4 py-2 text-sm text-gray-200 hover:border-white/30"
              >
                Add a payment account
              </Link>
              <p className="max-w-md text-[11px] leading-relaxed text-gray-600">
                Saved in this browser and nowhere else. Nothing publishes them, and clearing your
                site data removes them — so this step is a fact about this device, not about the
                network.
              </p>
            </div>
          }
        />
      </ol>

      <div className="border-t border-white/5 pt-6">
        <h2 className="text-sm font-medium text-white">Where you stand</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-400">
          {ads === undefined
            ? wallet
              ? "Reading your advertisements from the node…"
              : "Connect a wallet to see your advertisements."
            : ads === null
              ? "Could not reach a node to read your advertisements. That says nothing about whether you have any."
              : ads === 0
                ? "You have no advertisements on this node yet."
                : `You have ${ads} advertisement${ads === 1 ? "" : "s"} on this node.`}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/ads/new"
            className="rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-hover"
          >
            Post an advertisement
          </Link>
          <Link
            href="/ads"
            className="rounded-md border border-white/15 px-5 py-2.5 text-sm text-gray-200 hover:border-white/30"
          >
            My Ads
          </Link>
          <Link
            href="/guide/merchant"
            className="rounded-md border border-white/15 px-5 py-2.5 text-sm text-gray-200 hover:border-white/30"
          >
            How merchanting works
          </Link>
        </div>
        {/*
          * The node does not check the bond before accepting an
          * advertisement, and saying otherwise would be the comfortable lie.
          * A merchant who posts unbonded is not blocked here; they are told
          * what they are and are not covered by.
          */}
        <p className="mt-5 max-w-2xl border-l-2 border-white/10 pl-3 text-xs leading-relaxed text-gray-500">
          Nothing above is enforced by this screen, and the node does not refuse an advertisement
          from an unbonded wallet. What the bond buys is a counterparty&rsquo;s reason to trust you:
          it is the stake that is at risk if you take payment and do not release. Posting without it
          is allowed and visibly unbacked.
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
          {standing.detail}
        </p>
      </div>
      <div className="shrink-0">{action}</div>
    </li>
  );
}
