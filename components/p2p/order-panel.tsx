"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AssetIcon } from "@/components/asset-icon";
import { TradeLimits } from "@/components/asset-label";
import {
  type SavedPaymentAccount,
  accountsFor,
  isComplete,
  readAccounts,
} from "@/lib/payment-accounts";
import { assetLabel, type LiveAd } from "@/lib/live-advertisements";
import type { TradeDirection } from "@/lib/types";
import { addressForPeerId } from "@/lib/peer-id";
import { formatBaseUnits } from "@/lib/live-vaults";
import { useVaultBacking, vaultCovers } from "@/components/wallet/use-vault-backing";
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
  /*
   * In the ASSET, not in `fiat` — see `LiveAd.minTrade`. These were named
   * `minFiat`/`maxFiat` and used as fiat throughout: shown with the
   * currency code, compared against the fiat box, and divided by the price
   * to get a crypto bound that was already one. On a KES pair every one of
   * those was out by the exchange rate.
   */
  const minAsset = ad.minTrade;
  const maxAsset = ad.maxTrade;

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

  const minCrypto = minAsset;
  const maxCrypto = Math.min(maxAsset, ad.availableLiquidity);
  // The fiat side of the same band, at this advertisement's own price —
  // derived, because the record states the bounds in the asset.
  const minFiat = minAsset * price;
  const maxFiat = maxAsset * price;

  const usable = accountsFor(accounts, ad.paymentMethods, false);
  // Only relevant when selling: a buyer pays out of their own account and has
  // nothing to nominate.
  const needsAccount = !buy && usable.length === 0;

  // Tested on the asset side, which is the side the bounds are stated on.
  // `cryptoAmount` tracks `fiatAmount` through `onPay`/`onReceive`, so a
  // taker typing into either box is measured against the same band.
  const tooLow = cryptoAmount > 0 && cryptoAmount < minAsset;
  const tooHigh = cryptoAmount > maxAsset;
  const overLiquidity = cryptoAmount > ad.availableLiquidity;
  const noPrice = ad.price === null;

  /*
   * The seller-balance check, against the advertiser's real vault.
   *
   * `ad.availableLiquidity` above is what the *advertisement declares* — a
   * number its author chose. This is what actually backs it: the
   * `LiquidityVault` for (merchant, mint), both halves taken straight off
   * the record. The merchant's wallet is not looked up anywhere; a PeerId is
   * a prefix plus the raw Ed25519 key, so it is already in the record (see
   * `addressForPeerId`), and the mint is `ad.assetMint`. No ticker is
   * involved in either half, which is what makes this checkable at all —
   * the previous version was keyed on a symbol and could verify nothing.
   *
   * Both figures are shown. When they disagree the advertisement is
   * offering more than it holds, and that is exactly the thing a taker
   * needs to see rather than have averaged away.
   */
  const merchantWallet = useMemo(() => addressForPeerId(ad.merchantPeerId), [ad.merchantPeerId]);
  const backing = useVaultBacking(merchantWallet, ad.assetMint);
  const cover = backing.kind === "found" ? vaultCovers(backing.vault, receiveText) : null;

  // Only ever true on something the chain asserted. A failed lookup is not
  // evidence that an advertiser is unfunded.
  const overVault =
    cryptoAmount > 0 && (backing.kind === "none" || (cover !== null && !cover.covered));

  /*
   * Whether the vault covers what the advertisement *claims*, independent of
   * what this taker typed. Compared in base units rather than by parsing the
   * formatted string back into a float — `formatBaseUnits` inserts thousands
   * separators and truncates past six decimals, so reading its output as a
   * number is both locale-dependent and lossy.
   */
  const vaultCoversDeclared =
    backing.kind === "found" ? vaultCovers(backing.vault, String(ad.availableLiquidity))?.covered : undefined;

  const ready =
    !noPrice &&
    fiatAmount > 0 &&
    !tooLow &&
    !tooHigh &&
    !overLiquidity &&
    !overVault &&
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
    // Quoted in the asset, because that is the unit the merchant set the
    // bound in. The fiat equivalent follows in brackets so a taker filling
    // in the fiat box still knows what to type — a conversion this app
    // performed, not a figure on the record.
    const band = `${formatCrypto(minAsset, assetLabel(ad))} and ${formatCrypto(maxAsset, assetLabel(ad))}`;
    if (fiatAmount <= 0) {
      return `Enter an amount between ${band} (about ${formatFiat(minFiat, fiat, 0)} – ${formatFiat(maxFiat, fiat, 0)})`;
    }
    if (tooLow) return `Below this advertiser's minimum of ${formatCrypto(minAsset, assetLabel(ad))}`;
    if (tooHigh) return `Above this advertiser's maximum of ${formatCrypto(maxAsset, assetLabel(ad))}`;
    if (overLiquidity) return `Only ${formatCrypto(ad.availableLiquidity, assetLabel(ad))} is available on this ad`;
    if (backing.kind === "none" && cryptoAmount > 0) {
      return "This advertiser has no liquidity vault for the token this ad settles in — nothing on chain backs it";
    }
    if (cover !== null && !cover.covered) {
      return `This advertiser's vault holds only ${formatBaseUnits(cover.available, backing.kind === "found" ? backing.vault.decimals : 0)} ${assetLabel(ad)} available`;
    }
    if (!method) return "Choose a payment method";
    return null;
  }, [noPrice, fiatAmount, tooLow, tooHigh, overLiquidity, needsAccount, accounts.length, ad, method, minAsset, maxAsset, minFiat, maxFiat, fiat, backing, cover, cryptoAmount]);

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
      unit={assetLabel(ad)}
      // No coin art for a mint the node has no name for; see AssetLabel.
      icon={ad.assetSymbol ? <AssetIcon asset={ad.assetSymbol} size={18} /> : null}
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
            <Fact label="Declared on the ad" value={formatCrypto(ad.availableLiquidity, assetLabel(ad))} />
            {/*
              * Shown next to the declared figure, never instead of it. A
              * taker comparing the two is the whole point: the left number
              * is a claim, the right one is the vault behind it.
              */}
            <Fact
              label="Backed by the merchant's vault"
              value={
                backing.kind === "found" ? (
                  <span
                    className={vaultCoversDeclared === false ? "text-amber-300" : "text-gray-200"}
                    title={`Vault ${backing.vault.address.toBase58()}`}
                  >
                    {formatBaseUnits(backing.vault.available, backing.vault.decimals)} {assetLabel(ad)} available
                  </span>
                ) : backing.kind === "none" ? (
                  <span className="text-red-300">No vault for this mint</span>
                ) : backing.kind === "loading" ? (
                  <span className="text-gray-500">Reading the chain…</span>
                ) : backing.kind === "error" ? (
                  <span className="text-amber-300/80" title={backing.message}>
                    Could not reach the cluster — unverified, not unbacked
                  </span>
                ) : (
                  // The merchant field is not an Ed25519 identity PeerId, so
                  // there is no wallet in it to key a vault read on.
                  <span className="text-gray-500">Merchant identity carries no Solana address</span>
                )
              }
            />
            <Fact label="Limits" value={<TradeLimits ad={ad} />} />
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
              ? `Your ${assetLabel(ad)} is locked in escrow on Solana the moment an order is placed — before you send any ${fiat}. It is released to you once the merchant confirms receipt, and if they do not, an arbitrator decides.`
              : `Your ${assetLabel(ad)} moves into escrow on Solana when an order is placed and is released to the buyer only after you confirm their ${fiat} arrived.`}
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
              {/* Valued by catalogue id — the thing the advertisement
                  carries and the thing a saved account is matched against —
                  and labelled with the node's name for it. */}
              {ad.paymentMethods.map((id, i) => (
                <option key={id} value={id}>
                  {ad.paymentMethodLabels[i] ?? id}
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
                {userDirection} {assetLabel(ad)}
              </span>
              <p className="mt-2 text-xs text-amber-300">{blocker}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
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
