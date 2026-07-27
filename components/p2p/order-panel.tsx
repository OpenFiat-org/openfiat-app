"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AssetIcon } from "@/components/asset-icon";
import { CopyButton } from "@/components/copy-button";
import { QrCode } from "@/components/qr-code";
import { CURRENT_USER } from "@/lib/data/merchants";
import { WALLET_BALANCES } from "@/lib/data/wallet";
import {
  type SavedPaymentAccount,
  accountsFor,
  isComplete,
  readAccounts,
} from "@/lib/payment-accounts";
import { compositeScore } from "@/lib/reputation";
import type { Advertisement, Merchant, TradeDirection } from "@/lib/types";
import { formatCrypto, formatFiat, formatNumber, pseudoAddress } from "@/lib/format";

/** How long a quoted price stands before it refreshes. */
const QUOTE_SECONDS = 40;

/**
 * The order form, opened in place under its advertisement.
 *
 * Modelled on the flow people already know from Bybit and Binance P2P, because
 * this is the one screen where unfamiliarity costs money. The properties that
 * matter, in order:
 *
 *  - Both amount fields are live and each drives the other, so you can think in
 *    the currency you actually hold rather than doing arithmetic.
 *  - The limits are the placeholder, not a footnote — the field tells you what
 *    it will accept before you type.
 *  - The price carries a countdown, so a quote is visibly a quote.
 *  - The button is disabled with a stated reason, never enabled into a failure.
 *  - The merchant's own terms are on screen before you commit, not discovered
 *    in chat after your money has moved.
 */
export function OrderPanel({
  ad,
  merchant,
  price,
  fiat,
  minFiat,
  maxFiat,
  userDirection,
  onClose,
}: {
  ad: Advertisement;
  merchant: Merchant;
  price: number;
  fiat: string;
  minFiat: number;
  maxFiat: number;
  userDirection: TradeDirection;
  onClose: () => void;
}) {
  const buy = userDirection === "Buy";
  const [payText, setPayText] = useState("");
  const [receiveText, setReceiveText] = useState("");
  const [method, setMethod] = useState(ad.paymentMethods[0] ?? "");
  const [termsOpen, setTermsOpen] = useState(false);
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

  /* The merchant's own floor on who they will trade with. Advisory — see the
     field's note in lib/types.ts — so this client refuses and explains rather
     than pretending something on chain stopped it. */
  /* Limits are published in fiat, but a seller is typing crypto, so the same
     bounds have to be expressed in the unit the field accepts. */
  const minCrypto = minFiat / price;
  const maxCrypto = Math.min(maxFiat / price, ad.availableLiquidity);

  /* What the seller actually holds of this asset. Zero is the interesting case:
     the panel offers a deposit instead of a dead button. */
  const balance =
    WALLET_BALANCES.find((b) => b.asset === ad.asset)?.balance ?? 0;

  const usable = accountsFor(accounts, ad.paymentMethods, ad.international);
  // Only relevant when selling: a buyer pays out of their own account and has
  // nothing to nominate.
  const needsAccount = !buy && usable.length === 0;

  const myReputation = compositeScore(CURRENT_USER);
  const belowFloor =
    ad.minCounterpartyReputation !== undefined &&
    myReputation < ad.minCounterpartyReputation;

  const tooLow = fiatAmount > 0 && fiatAmount < minFiat;
  const tooHigh = fiatAmount > maxFiat;
  const overLiquidity = cryptoAmount > ad.availableLiquidity;
  const ready =
    fiatAmount > 0 &&
    !tooLow &&
    !tooHigh &&
    !overLiquidity &&
    !belowFloor &&
    !needsAccount &&
    (buy || (balance > 0 && cryptoAmount <= balance)) &&
    (ad.international || method !== "");

  const blocker = useMemo(() => {
    if (!buy && balance <= 0) {
      return `You hold no ${ad.asset} to sell. Deposit some first — the address is below.`;
    }
    if (!buy && cryptoAmount > balance) {
      return `You hold ${formatCrypto(balance, ad.asset)}, less than the ${formatCrypto(cryptoAmount, ad.asset)} this order needs.`;
    }
    if (needsAccount) {
      return accounts.length === 0
        ? "You have no saved payment account yet — add one in Settings so the buyer knows where to send the money."
        : "None of your saved accounts uses a method this advertiser accepts. Add one that does in Settings.";
    }
    if (belowFloor) {
      return `This advertiser trades with counterparties at ${ad.minCounterpartyReputation}/100 or above. Yours is ${myReputation}/100 — complete more trades without disputes to raise it.`;
    }
    if (fiatAmount <= 0) return `Enter an amount between ${formatFiat(minFiat, fiat, 0)} and ${formatFiat(maxFiat, fiat, 0)}`;
    if (tooLow) return `Below this advertiser's minimum of ${formatFiat(minFiat, fiat, 0)}`;
    if (tooHigh) return `Above this advertiser's maximum of ${formatFiat(maxFiat, fiat, 0)}`;
    if (overLiquidity) return `Only ${formatCrypto(ad.availableLiquidity, ad.asset)} is available on this ad`;
    if (!ad.international && !method) return "Choose a payment method";
    return null;
  }, [fiatAmount, cryptoAmount, balance, buy, tooLow, tooHigh, overLiquidity, belowFloor, needsAccount, accounts.length, myReputation, ad, method, minFiat, maxFiat, fiat]);

  /* Each field recomputes the other. Kept as strings so a half-typed "1." is
     not rewritten under the cursor. */
  function onPay(next: string) {
    const clean = next.replace(/[^\d.]/g, "");
    setPayText(clean);
    const n = Number(clean);
    setReceiveText(n > 0 ? (n / price).toFixed(Math.min(6, 4)) : "");
  }

  function onReceive(next: string) {
    const clean = next.replace(/[^\d.]/g, "");
    setReceiveText(clean);
    const n = Number(clean);
    setPayText(n > 0 ? (n * price).toFixed(2) : "");
  }

  /*
   * The primary field is whichever amount the user actually decides.
   *
   * Buying, that is the fiat they are willing to spend. Selling, it is the
   * crypto they hold — a seller thinks "sell 500 USDT", not "receive 35,330
   * AFN", and asking for the receive amount first made them work the exchange
   * rate backwards before they could enter anything. Both fields still drive
   * each other; this is about which one leads.
   */
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
      {/* minmax(0,…) on both tracks, and min-w-0 on the children. The panel
          lives in a table cell, so a fixed second column plus a 1fr first one
          cannot shrink and instead widens the whole table past the viewport,
          which puts the order form behind a horizontal scroll. */}
      <div className="grid gap-8 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:px-6">
        {/* Advertiser terms */}
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-4">
            <h3 className="text-sm font-semibold text-gray-200">Advertiser terms</h3>
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-gray-500 hover:text-gray-300"
            >
              Close
            </button>
          </div>

          <button
            type="button"
            onClick={() => setTermsOpen((o) => !o)}
            className="mt-3 flex w-full items-center justify-between gap-3 rounded-md border border-white/10 px-3 py-2.5 text-left text-sm text-gray-300 hover:border-white/25"
          >
            <span className="truncate">
              {ad.terms
                ? termsOpen
                  ? "Advertiser terms"
                  : ad.terms
                : "This advertiser has set no additional terms."}
            </span>
            <span aria-hidden className="shrink-0 text-gray-600">
              {termsOpen ? "▴" : "▾"}
            </span>
          </button>
          {termsOpen && ad.terms && (
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-gray-400">{ad.terms}</p>
          )}

          <dl className="mt-6 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            <Fact label="Available" value={formatCrypto(ad.availableLiquidity, ad.asset)} />
            <Fact
              label="Limits"
              value={`${formatFiat(minFiat, fiat, 0)} – ${formatFiat(maxFiat, fiat, 0)}`}
            />
            <Fact
              label="Pricing"
              value={
                ad.pricing.type === "Floating"
                  ? `Floating ${ad.pricing.premiumPct >= 0 ? "+" : ""}${ad.pricing.premiumPct}% of the oracle mid`
                  : "Fixed"
              }
            />
            <Fact label="Settles in" value={merchant.settlementSpeed} />
            {ad.minCounterpartyReputation !== undefined && (
              <Fact
                label="Requires reputation"
                value={`${ad.minCounterpartyReputation}/100 · you have ${myReputation}`}
              />
            )}
          </dl>

          <p className="mt-6 max-w-prose text-xs leading-relaxed text-gray-500">
            {buy
              ? `Your ${ad.asset} is locked in escrow on Solana the moment you open this order — before you send any ${fiat}. It is released to you once the merchant confirms receipt, and if they do not, an arbitrator decides. Keep every message and receipt in the trade chat; it is the evidence a dispute is judged on.`
              : `Your ${ad.asset} moves into escrow on Solana when you open this order and is released to the buyer only after you confirm their ${fiat} arrived. Do not release before you have checked your own account.`}
          </p>
        </div>

        {/* Order form */}
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-sm text-gray-400">Price</span>
            <span className="font-mono text-lg font-semibold tabular-nums text-brand-teal">
              {formatNumber(price)} {fiat}
            </span>
            <span
              className="ml-auto text-xs tabular-nums text-gray-500"
              title="The quote refreshes on this countdown; a floating ad reprices against the oracle mid."
            >
              {seconds}s
            </span>
          </div>

          {buy ? fiatField : cryptoField}
          {!buy && <QuickAmounts balance={balance} asset={ad.asset} onPick={onReceive} />}
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

          {ad.international ? (
            <p className="mt-3 border-l-2 border-brand-teal pl-2.5 text-xs text-gray-400">
              Any payment method — this advertiser trades borderless.
            </p>
          ) : (
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
          )}

          {ready ? (
            <Link
              href={`/orders/new?ad=${ad.id}&amount=${fiatAmount}${method ? `&method=${encodeURIComponent(method)}` : ""}`}
              className={`mt-5 block rounded-md py-3 text-center text-sm font-semibold text-white transition-colors ${
                buy ? "bg-emerald-600 hover:bg-emerald-500" : "bg-orange-600 hover:bg-orange-500"
              }`}
            >
              {userDirection} {ad.asset}
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
              {/* The reason, always. A disabled button with no explanation is
                  the single most common way these flows lose people. */}
              <p className="mt-2 text-xs text-amber-300">{blocker}</p>
              {!buy && balance <= 0 && <DepositPrompt asset={ad.asset} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Quick amounts off the seller's own balance.
 *
 * A seller usually wants to move a round share of what they hold, not a figure
 * they arrived at through the exchange rate. 100% is the one that matters and
 * the one people reach for, so it is labelled as such rather than as a
 * percentage.
 */
function QuickAmounts({
  balance,
  asset,
  onPick,
}: {
  balance: number;
  asset: string;
  onPick: (next: string) => void;
}) {
  if (balance <= 0) return null;
  const fractions: Array<[string, number]> = [
    ["25%", 0.25],
    ["50%", 0.5],
    ["75%", 0.75],
    ["All", 1],
  ];
  return (
    <div className="mt-2 flex items-center gap-1.5">
      {fractions.map(([label, f]) => (
        <button
          key={label}
          type="button"
          onClick={() => onPick(String(Number((balance * f).toFixed(6))))}
          className="flex-1 rounded-pill border border-white/10 py-1.5 text-xs text-gray-400 transition-colors hover:border-white/25 hover:text-white"
        >
          {label}
        </button>
      ))}
      <span className="shrink-0 pl-1 text-xs tabular-nums text-gray-600">
        {formatCrypto(balance, asset)}
      </span>
    </div>
  );
}

/**
 * Where to get some, when you have none.
 *
 * Reached only from the sell side with a zero balance — the case where the form
 * can never be completed, so offering the deposit address is the only useful
 * thing left on screen. Deliberately inline rather than a link away: sending
 * someone to another page to fetch an address and back again loses the order
 * they had picked.
 */
function DepositPrompt({ asset }: { asset: string }) {
  const address = pseudoAddress(`openfiat-deposit-${asset}`);
  return (
    <div className="mt-5 rounded-md border border-white/10 bg-white/[0.02] p-4">
      <p className="text-sm font-medium text-white">Deposit {asset} to sell it</p>
      <p className="mt-1 text-xs leading-relaxed text-gray-500">
        Send {asset} on Solana to this address. It arrives in your wallet, and
        from there you can fund a vault or sell it directly.
      </p>
      <div className="mt-3 flex items-start gap-3">
        <QrCode value={address} />
        <div className="min-w-0 flex-1">
          <p className="break-all font-mono text-xs text-gray-300">{address}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <CopyButton value={address} />
            <Link
              href={`/wallet/deposit?asset=${asset}`}
              className="text-xs text-brand hover:text-brand-hover"
            >
              Full deposit page →
            </Link>
          </div>
        </div>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-gray-600">
        Solana only. Sending {asset} over another network loses it, and nobody
        can reverse that.
      </p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-t border-white/5 pt-2">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right tabular-nums text-gray-200">{value}</dd>
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
