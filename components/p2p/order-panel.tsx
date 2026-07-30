"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AssetIcon } from "@/components/asset-icon";
import {
  type SavedPaymentAccount,
  accountsFor,
  isComplete,
  readAccounts,
} from "@/lib/payment-accounts";
import type { LiveAd } from "@/lib/live-advertisements";
import type { TradeDirection } from "@/lib/types";
import { formatCrypto, formatFiat, formatNumber } from "@/lib/format";

/** How long a quoted price stands before it refreshes. */
const QUOTE_SECONDS = 40;

/**
 * The order form, opened in place under its advertisement.
 *
 * Reads a `LiveAd` now, not the old mock `Advertisement`/`Merchant` pair —
 * see `lib/live-advertisements.ts` for why that type is narrower. Two things
 * this panel used to show are gone because there is nothing live behind
 * them: the advertiser's free-text `terms`, and a "requires reputation"
 * floor gated on `compositeScore(CURRENT_USER)` — a real advertisement
 * carries neither a terms field nor a reputation floor.
 */
export function OrderPanel({
  ad,
  userDirection,
  onClose,
}: {
  ad: LiveAd;
  userDirection: TradeDirection;
  onClose: () => void;
}) {
  const buy = userDirection === "Buy";
  const price = ad.price ?? 0;
  const fiat = ad.fiatCurrency;
  const minFiat = ad.minTrade;
  const maxFiat = ad.maxTrade;

  const [payText, setPayText] = useState("");
  const [receiveText, setReceiveText] = useState("");
  const [method, setMethod] = useState(ad.paymentMethods[0] ?? "");
  const [seconds, setSeconds] = useState(QUOTE_SECONDS);
  /* Selling means nominating an account for the buyer to pay. Read post-mount,
     so the server render is not guessing at localStorage. */
  const [accounts, setAccounts] = useState<SavedPaymentAccount[]>([]);
  const [accountId, setAccountId] = useState("");

  useEffect(() => {
    setAccounts(readAccounts().filter(isComplete));
  }, []);

  // The quote countdown. Restarts rather than changing the price: a moving
  // number under the cursor would be worse than a visibly stale one.
  useEffect(() => {
    const id = setInterval(() => {
      setSeconds((s) => (s <= 1 ? QUOTE_SECONDS : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const fiatAmount = Number(payText) || 0;
  const cryptoAmount = Number(receiveText) || 0;

  const minCrypto = minFiat / price;
  const maxCrypto = Math.min(maxFiat / price, ad.availableLiquidity);

  const usable = accountsFor(accounts, ad.paymentMethods, false);
  // Only relevant when selling: a buyer pays out of their own account and has
  // nothing to nominate.
  const needsAccount = !buy && usable.length === 0;

  const tooLow = fiatAmount > 0 && fiatAmount < minFiat;
  const tooHigh = fiatAmount > maxFiat;
  const overLiquidity = cryptoAmount > ad.availableLiquidity;
  const noPrice = ad.price === null;
  const ready =
    !noPrice &&
    fiatAmount > 0 &&
    !tooLow &&
    !tooHigh &&
    !overLiquidity &&
    !needsAccount &&
    method !== "";

  const blocker = useMemo(() => {
    if (noPrice) {
      return "This advertiser prices against an oracle read that hasn't happened yet — there is nothing to quote.";
    }
    if (needsAccount) {
      return accounts.length === 0
        ? "You have no saved payment account yet — add one in Settings so the buyer knows where to send the money."
        : "None of your saved accounts uses a method this advertiser accepts. Add one that does in Settings.";
    }
    if (fiatAmount <= 0) return `Enter an amount between ${formatFiat(minFiat, fiat, 0)} and ${formatFiat(maxFiat, fiat, 0)}`;
    if (tooLow) return `Below this advertiser's minimum of ${formatFiat(minFiat, fiat, 0)}`;
    if (tooHigh) return `Above this advertiser's maximum of ${formatFiat(maxFiat, fiat, 0)}`;
    if (overLiquidity) return `Only ${formatCrypto(ad.availableLiquidity, ad.asset)} is available on this ad`;
    if (!method) return "Choose a payment method";
    return null;
  }, [noPrice, fiatAmount, tooLow, tooHigh, overLiquidity, needsAccount, accounts.length, ad, method, minFiat, maxFiat, fiat]);

  /* Each field recomputes the other. Kept as strings so a half-typed "1." is
     not rewritten under the cursor. */
  function onPay(next: string) {
    const clean = next.replace(/[^\d.]/g, "");
    setPayText(clean);
    const n = Number(clean);
    setReceiveText(n > 0 && price > 0 ? (n / price).toFixed(Math.min(6, 4)) : "");
  }

  function onReceive(next: string) {
    const clean = next.replace(/[^\d.]/g, "");
    setReceiveText(clean);
    const n = Number(clean);
    setPayText(n > 0 ? (n * price).toFixed(2) : "");
  }

  const cryptoField = (
    <Field
      label={buy ? "I will receive" : "I will sell"}
      value={receiveText}
      onChange={onReceive}
      placeholder={buy ? "0.00" : `${formatNumber(minCrypto, 2)} ~ ${formatNumber(maxCrypto, 2)}`}
      unit={ad.asset}
      icon={<AssetIcon asset={ad.asset} size={18} />}
      invalid={overLiquidity || (!buy && (tooLow || tooHigh))}
    />
  );

  const fiatField = (
    <Field
      label={buy ? "I will pay" : "I will receive"}
      value={payText}
      onChange={onPay}
      placeholder={buy ? `${formatNumber(minFiat, 0)} ~ ${formatNumber(maxFiat, 0)}` : "0.00"}
      unit={fiat}
      invalid={buy && (tooLow || tooHigh)}
    />
  );

  return (
    <div className="border-t border-white/5 bg-white/[0.015]">
      <div className="grid gap-8 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:px-6">
        {/* Advertisement facts */}
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-4">
            <h3 className="text-sm font-semibold text-gray-200">Advertisement</h3>
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-gray-500 hover:text-gray-300"
            >
              Close
            </button>
          </div>

          <dl className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            <Fact label="Merchant" value={`…${ad.merchantShort}`} mono />
            <Fact label="Available" value={formatCrypto(ad.availableLiquidity, ad.asset)} />
            <Fact
              label="Limits"
              value={`${formatFiat(minFiat, fiat, 0)} – ${formatFiat(maxFiat, fiat, 0)}`}
            />
            <Fact
              label="Pricing"
              value={
                ad.pricingKind === "Floating"
                  ? `Floating ${(ad.premiumBps ?? 0) >= 0 ? "+" : ""}${((ad.premiumBps ?? 0) / 100).toFixed(2)}% of the oracle mid`
                  : "Fixed"
              }
            />
          </dl>

          <p className="mt-6 max-w-prose text-xs leading-relaxed text-gray-500">
            {buy
              ? `Your ${ad.asset} is locked in escrow on Solana the moment an order is placed — before you send any ${fiat}. It is released to you once the merchant confirms receipt, and if they do not, an arbitrator decides.`
              : `Your ${ad.asset} moves into escrow on Solana when an order is placed and is released to the buyer only after you confirm their ${fiat} arrived.`}
          </p>

          {/*
            * Placing an order isn't wired to the protocol yet — see
            * app/orders/new/page.tsx. Saying so here, not just on the next
            * page, means the limits below aren't read as a promise this
            * button keeps.
            */}
          <p className="mt-4 border-l-2 border-amber-400/50 bg-amber-400/5 px-3 py-2 text-xs leading-relaxed text-amber-200">
            This interface can review an order against this advertisement, but does not yet submit a reservation to
            the node — see the review page for what that means.
          </p>
        </div>

        {/* Order form */}
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-sm text-gray-400">Price</span>
            <span className="font-mono text-lg font-semibold tabular-nums text-brand-teal">
              {noPrice ? "—" : `${formatNumber(price)} ${fiat}`}
            </span>
            {!noPrice && (
              <span
                className="ml-auto text-xs tabular-nums text-gray-500"
                title="The quote refreshes on this countdown; a floating ad reprices against the oracle mid."
              >
                {seconds}s
              </span>
            )}
          </div>

          {buy ? fiatField : cryptoField}
          {buy ? cryptoField : fiatField}

          {!buy && usable.length > 0 && (
            <label className="mt-3 block">
              <span className="block text-xs text-gray-500">Receive into</span>
              <select
                value={accountId || usable[0].id}
                onChange={(e) => setAccountId(e.target.value)}
                className="mt-1 w-full rounded-md border border-white/10 bg-[#0a0e14]/70 px-3 py-2.5 text-sm text-white outline-none focus:border-brand/50"
              >
                {usable.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.method} · {a.fields[1]?.value ?? a.fields[0]?.value}
                  </option>
                ))}
              </select>
              <span className="mt-1.5 block text-xs text-gray-500">
                The buyer sees these details field by field, so they can copy each
                one rather than retyping it.
              </span>
            </label>
          )}

          <label className="mt-3 block">
            <span className="sr-only">Payment method</span>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full rounded-md border border-white/10 bg-[#0a0e14]/70 px-3 py-2.5 text-sm text-white outline-none focus:border-brand/50"
            >
              {ad.paymentMethods.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>

          {ready ? (
            <Link
              href={`/orders/new?ad=${ad.id}&amount=${fiatAmount}${method ? `&method=${encodeURIComponent(method)}` : ""}`}
              className={`mt-5 block rounded-md py-3 text-center text-sm font-semibold text-white transition-colors ${
                buy ? "bg-emerald-600 hover:bg-emerald-500" : "bg-orange-600 hover:bg-orange-500"
              }`}
            >
              Review {userDirection.toLowerCase()} order
            </Link>
          ) : (
            <>
              <span
                aria-disabled
                className={`mt-5 block cursor-not-allowed rounded-md py-3 text-center text-sm font-semibold text-white/70 ${
                  buy ? "bg-emerald-600/35" : "bg-orange-600/35"
                }`}
              >
                {userDirection} {ad.asset}
              </span>
              <p className="mt-2 text-xs text-amber-300">{blocker}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-t border-white/5 pt-2">
      <dt className="text-gray-500">{label}</dt>
      <dd className={`text-right tabular-nums text-gray-200 ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  unit,
  icon,
  invalid,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  unit: string;
  icon?: React.ReactNode;
  invalid?: boolean;
}) {
  return (
    <label
      className={`mt-3 block rounded-md border px-3 py-2.5 transition-colors focus-within:border-brand/50 ${
        invalid ? "border-amber-400/50" : "border-white/10"
      }`}
    >
      <span className="block text-xs text-gray-500">{label}</span>
      <span className="mt-1 flex items-center gap-2">
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-lg tabular-nums text-white outline-none placeholder:text-gray-600"
        />
        {icon}
        <span className="shrink-0 text-sm font-medium text-gray-300">{unit}</span>
      </span>
    </label>
  );
}
