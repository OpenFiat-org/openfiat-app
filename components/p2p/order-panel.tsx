"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
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
import { tradingSymbol } from "@/lib/asset-display";
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
  const t = useTranslations("orderPanel");
  const buy = userDirection === "Buy";
  // The token's name as this panel prints it — `assetLabel` falls back to
  // the address, this stays `null` when the node named nothing, which is
  // what decides whether there is a coin mark to draw.
  const assetSymbol = tradingSymbol(ad.assetMint, ad.assetSymbol);
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
      return t("noPriceBlocker");
    }
    if (needsAccount) {
      return accounts.length === 0
        ? t("needAccountNone")
        : t("needAccountWrongMethod");
    }
    // Quoted in the asset, because that is the unit the merchant set the
    // bound in. The fiat equivalent follows in brackets so a taker filling
    // in the fiat box still knows what to type — a conversion this app
    // performed, not a figure on the record.
    const band = t("band", {
      min: formatCrypto(minAsset, assetLabel(ad)),
      max: formatCrypto(maxAsset, assetLabel(ad)),
    });
    if (fiatAmount <= 0) {
      return t("enterAmount", {
        band,
        minFiat: formatFiat(minFiat, fiat, 0),
        maxFiat: formatFiat(maxFiat, fiat, 0),
      });
    }
    if (tooLow) return t("belowMin", { min: formatCrypto(minAsset, assetLabel(ad)) });
    if (tooHigh) return t("aboveMax", { max: formatCrypto(maxAsset, assetLabel(ad)) });
    if (overLiquidity) return t("onlyAvailable", { amount: formatCrypto(ad.availableLiquidity, assetLabel(ad)) });
    if (backing.kind === "none" && cryptoAmount > 0) {
      return t("noVaultBlocker");
    }
    if (cover !== null && !cover.covered) {
      return t("vaultHoldsOnly", {
        amount: formatBaseUnits(cover.available, backing.kind === "found" ? backing.vault.decimals : 0),
        asset: assetLabel(ad),
      });
    }
    if (!method) return t("chooseMethod");
    return null;
  }, [noPrice, fiatAmount, tooLow, tooHigh, overLiquidity, needsAccount, accounts.length, ad, method, minAsset, maxAsset, minFiat, maxFiat, fiat, backing, cover, cryptoAmount, t]);

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
      label={buy ? t("iWillReceive") : t("iWillSell")}
      value={receiveText}
      onChange={onReceive}
      placeholder={buy ? "0.00" : `${formatNumber(minCrypto, 2)} ~ ${formatNumber(maxCrypto, 2)}`}
      unit={assetLabel(ad)}
      // No coin art for a mint the node has no name for; see AssetLabel.
      // Named through `tradingSymbol` so the native mint gets `sol.png`
      // rather than going unmarked under a name this repo ships art for.
      icon={assetSymbol ? <AssetIcon asset={assetSymbol} size={18} /> : null}
      invalid={overLiquidity || (!buy && (tooLow || tooHigh))}
    />
  );

  const fiatField = (
    <Field
      label={buy ? t("iWillPay") : t("iWillReceive")}
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
            <h3 className="text-sm font-semibold text-gray-200">{t("advertisement")}</h3>
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-gray-500 hover:text-gray-300"
            >
              {t("close")}
            </button>
          </div>

          <dl className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            <Fact label={t("merchant")} value={`…${ad.merchantShort}`} mono />
            <Fact label={t("declaredOnAd")} value={formatCrypto(ad.availableLiquidity, assetLabel(ad))} />
            {/*
              * Shown next to the declared figure, never instead of it. A
              * taker comparing the two is the whole point: the left number
              * is a claim, the right one is the vault behind it.
              */}
            <Fact
              label={t("backedByVault")}
              value={
                backing.kind === "found" ? (
                  <span
                    className={vaultCoversDeclared === false ? "text-amber-300" : "text-gray-200"}
                    title={t("vaultTitle", { address: backing.vault.address.toBase58() })}
                  >
                    {t("vaultAvailable", {
                      amount: formatBaseUnits(backing.vault.available, backing.vault.decimals),
                      asset: assetLabel(ad),
                    })}
                  </span>
                ) : backing.kind === "none" ? (
                  <span className="text-red-300">{t("noVaultForMint")}</span>
                ) : backing.kind === "loading" ? (
                  <span className="text-gray-500">{t("readingChain")}</span>
                ) : backing.kind === "error" ? (
                  <span className="text-amber-300/80" title={backing.message}>
                    {t("clusterUnreachable")}
                  </span>
                ) : (
                  // The merchant field is not an Ed25519 identity PeerId, so
                  // there is no wallet in it to key a vault read on.
                  <span className="text-gray-500">{t("merchantNoAddress")}</span>
                )
              }
            />
            <Fact label={t("limits")} value={<TradeLimits ad={ad} />} />
            <Fact
              label={t("pricing")}
              value={
                ad.pricingKind === "Floating"
                  ? t("floatingPricing", {
                      sign: (ad.premiumBps ?? 0) >= 0 ? "+" : "",
                      pct: ((ad.premiumBps ?? 0) / 100).toFixed(2),
                    })
                  : t("fixed")
              }
            />
          </dl>

          <p className="mt-6 max-w-prose text-xs leading-relaxed text-gray-500">
            {t("escrow", { buying: String(buy), asset: assetLabel(ad), fiat })}
          </p>

          {/*
            * The reservation is what expires, so the window is stated here
            * rather than only on the page that signs it — a taker choosing an
            * amount is already deciding whether they can pay in time.
            */}
          <p className="mt-4 text-xs leading-relaxed text-gray-500">
            {t("reservationNote")}
          </p>
        </div>

        {/* Order form */}
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-sm text-gray-400">{t("price")}</span>
            <span className="font-mono text-lg font-semibold tabular-nums text-brand-teal">
              {noPrice ? "—" : `${formatNumber(price)} ${fiat}`}
            </span>
            {!noPrice && (
              <span
                className="ml-auto text-xs tabular-nums text-gray-500"
                title={t("quoteTitle")}
              >
                {t("countdown", { seconds })}
              </span>
            )}
          </div>

          {buy ? fiatField : cryptoField}
          {buy ? cryptoField : fiatField}

          {!buy && usable.length > 0 && (
            <label className="mt-3 block">
              <span className="block text-xs text-gray-500">{t("receiveInto")}</span>
              <select
                value={accountId || usable[0].id}
                onChange={(e) => setAccountId(e.target.value)}
                className="mt-1 w-full rounded-md border border-white/10 bg-[#0a0e14]/70 px-3 py-2.5 text-sm text-white outline-none focus:border-brand/50"
              >
                {usable.map((a) => (
                  <option key={a.id} value={a.id}>
                    {t("accountOption", { method: a.method, detail: a.fields[1]?.value ?? a.fields[0]?.value ?? "" })}
                  </option>
                ))}
              </select>
              <span className="mt-1.5 block text-xs text-gray-500">
                {t("receiveIntoHelp")}
              </span>
            </label>
          )}

          <label className="mt-3 block">
            <span className="sr-only">{t("paymentMethod")}</span>
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
              // In the asset. The reservation's `amount` is denominated in the
              // asset and so are this advertisement's limits, so handing the
              // fiat total on and dividing it back out on the next page would
              // sign a quantity a few base units off the one on screen.
              href={`/orders/new?ad=${ad.id}&asset=${cryptoAmount}${method ? `&method=${encodeURIComponent(method)}` : ""}`}
              className={`mt-5 block rounded-md py-3 text-center text-sm font-semibold text-white transition-colors ${
                buy ? "bg-emerald-600 hover:bg-emerald-500" : "bg-orange-600 hover:bg-orange-500"
              }`}
            >
              {t("reviewOrder", { buying: String(buy) })}
            </Link>
          ) : (
            <>
              <span
                aria-disabled
                className={`mt-5 block cursor-not-allowed rounded-md py-3 text-center text-sm font-semibold text-white/70 ${
                  buy ? "bg-emerald-600/35" : "bg-orange-600/35"
                }`}
              >
                {t("disabledAction", { buying: String(buy), asset: assetLabel(ad) })}
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
