"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { INTERNATIONAL_MARKET, type Advertisement, type Merchant, type StablecoinAsset, type TradeDirection } from "@/lib/types";
import { PUBLIC_ADS, adPrice, adPriceIn, fxPerUsd } from "@/lib/data/ads";
import { PRESALE } from "@/lib/data/sale";
import { merchantById } from "@/lib/data/merchants";
import { COUNTRIES_BY_SLUG, countriesByCurrency } from "@/lib/data/countries";
import { formatCrypto, formatFiat, formatNumber } from "@/lib/format";
import { AssetIcon } from "@/components/asset-icon";
import { DataTable, Td, Th, Tr } from "@/components/data-table";
import { MerchantCell } from "@/components/merchant-cell";
import { PageHero } from "@/components/page-hero";
import { CurrencyCombobox } from "@/components/p2p/currency-combobox";
import { HomeExplainer } from "@/components/home/explainer";
import { OrderPanel } from "@/components/p2p/order-panel";
import { compositeScore } from "@/lib/reputation";

const ASSETS: Array<StablecoinAsset | "OPEN"> = ["USDT", "USDC", "USD1", "SOL", "OPEN"];

type SortKey = "price" | "limits" | "completion";

const SORT_LABELS: Record<SortKey, string> = {
  price: "Best price",
  limits: "Highest limits",
  completion: "Completion rate",
};

const selectCls =
  "rounded-md border border-white/10 px-3 py-2 text-sm text-gray-300 outline-none focus:border-brand/50 [&>option]:bg-[#10151d]";

const STORAGE_KEY = "openfiat:market";
const PRESALE_PCT = Math.round((PRESALE.raised / PRESALE.cap) * 100);

// Only online ads appear on the public exchange book.
const BOOK = PUBLIC_ADS.filter((a) => a.status === "Online");

/** Currencies with at least one online local ad — floated to the top of the picker. */
const LIQUID_CURRENCIES: ReadonlySet<string> = new Set(
  BOOK.filter((a) => !a.international).map((a) => a.fiatCurrency),
);

/** One display row: an ad with price/limits expressed in the view currency. */
interface ViewRow {
  ad: Advertisement;
  merchant: Merchant;
  price: number;
  minFiat: number;
  maxFiat: number;
  fiat: string; // display currency ("USD" in the International view)
}

/**
 * The P2P exchange book. The default view is International (borderless
 * merchants, USD-priced, any payment method); picking a country/currency
 * shows that market's local ads plus international ads FX-converted into it.
 *
 * Preference persistence (client-only, post-mount — server render is always
 * the deterministic initial view, so there is no hydration mismatch):
 * - `rememberPreference` (landing): on mount, apply localStorage["openfiat:market"].
 * - `savePreference` (country pages): on mount, write the country slug.
 * - Any combobox change writes the resolved country slug (or "international").
 */
export function P2PExchange({
  initialFiat = INTERNATIONAL_MARKET,
  showHeading = true,
  showExplainer = false,
  rememberPreference = false,
  savePreference,
}: {
  initialFiat?: string;
  showHeading?: boolean;
  /** Landing page only: the three-step walkthrough and benefits below the book. */
  showExplainer?: boolean;
  rememberPreference?: boolean;
  savePreference?: string;
}) {
  const [tab, setTab] = useState<TradeDirection>("Buy");
  const [asset, setAsset] = useState<StablecoinAsset | "OPEN">("USDT");
  const isOpenAsset = asset === "OPEN";
  const [fiat, setFiat] = useState(initialFiat);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [sort, setSort] = useState<SortKey>("price");
  const [minRep, setMinRep] = useState(0);

  // Apply the remembered market after mount (landing page only).
  useEffect(() => {
    if (!rememberPreference) return;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved || saved === "international") return;
      const country = COUNTRIES_BY_SLUG.get(saved);
      if (country) setFiat(country.currencyCode);
    } catch {
      /* localStorage unavailable */
    }
  }, [rememberPreference]);

  // Remember the last-browsed country page as the preferred market.
  useEffect(() => {
    if (!savePreference) return;
    try {
      localStorage.setItem(STORAGE_KEY, savePreference);
    } catch {
      /* localStorage unavailable */
    }
  }, [savePreference]);

  function chooseFiat(code: string) {
    setFiat(code);
    setMethod("");
    try {
      if (code === INTERNATIONAL_MARKET) {
        localStorage.setItem(STORAGE_KEY, "international");
      } else {
        const users = countriesByCurrency(code);
        const country = users.find((c) => c.isRecognized) ?? users[0];
        if (country) localStorage.setItem(STORAGE_KEY, country.slug);
      }
    } catch {
      /* localStorage unavailable */
    }
  }

  const isInternational = fiat === INTERNATIONAL_MARKET;
  const viewFiat = isInternational ? "USD" : fiat;

  const methodOptions = useMemo(() => {
    const set = new Set<string>();
    for (const ad of BOOK) {
      if (!ad.international && ad.fiatCurrency === fiat) ad.paymentMethods.forEach((m) => set.add(m));
    }
    return [...set];
  }, [fiat]);

  const rows = useMemo(() => {
    const wantDirection = tab === "Buy" ? "Sell" : "Buy";
    const fiatAmount = Number(amount) || 0;
    const out: ViewRow[] = [];
    for (const ad of BOOK) {
      if (ad.direction !== wantDirection || ad.asset !== asset) continue;
      if (method !== "" && !ad.international && !ad.paymentMethods.includes(method)) continue;

      let price: number | undefined;
      let fx = 1;
      if (isInternational) {
        if (!ad.international) continue;
        price = adPrice(ad);
      } else if (ad.international) {
        fx = fxPerUsd(fiat) ?? 0;
        if (!fx) continue; // no FX rate for this currency
        price = adPriceIn(ad, fiat);
      } else {
        if (ad.fiatCurrency !== fiat) continue;
        price = adPrice(ad);
      }
      if (price === undefined) continue;

      const minFiat = ad.minTrade * fx;
      const maxFiat = ad.maxTrade * fx;
      if (fiatAmount > 0 && (fiatAmount < minFiat || fiatAmount > maxFiat)) continue;
      const merchant = merchantById(ad.merchantId);
      // OFS-3000 §22 leaves marketplace ranking and filtering to the
      // application and names reputation as a dimension to consider.
      if (minRep > 0 && compositeScore(merchant) < minRep) continue;
      out.push({ ad, merchant, price, minFiat, maxFiat, fiat: viewFiat });
    }
    switch (sort) {
      case "price":
        out.sort((a, b) => (tab === "Buy" ? a.price - b.price : b.price - a.price));
        break;
      case "limits":
        out.sort((a, b) => b.maxFiat - a.maxFiat);
        break;
      case "completion":
        out.sort((a, b) => b.merchant.completionRate - a.merchant.completionRate);
        break;
    }
    return out;
  }, [tab, asset, fiat, isInternational, viewFiat, amount, method, sort]);

  return (
    <div>
      {showHeading && (
        <PageHero
          compact
          variant={tab === "Sell" ? "flow-rev" : "flow"}
          title={isInternational ? `${tab} ${asset} with Any Currency via P2P` : `${tab} ${asset} with ${fiat} via P2P`}
          description={
            isInternational
              ? "International merchants accept every currency and any payment method — prices shown in USD. Escrow is locked on Solana before you pay; OpenFiat never holds your fiat."
              : "Trade stablecoins peer-to-peer. Escrow is locked on Solana before you pay; OpenFiat never holds your fiat."
          }
        />
      )}

      {/* Buy/Sell segmented toggle + asset tabs */}
      <div className={`flex flex-wrap items-center gap-5 ${showHeading ? "mt-6" : ""}`}>
        <div className="flex rounded-md border border-white/10 p-0.5">
          {(["Buy", "Sell"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setTab(d)}
              className={`rounded px-7 py-2 text-sm font-semibold transition-colors ${
                tab === d
                  ? d === "Buy"
                    ? "bg-emerald-600 text-white"
                    : "bg-orange-600 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {ASSETS.map((a) => (
            <button
              key={a}
              onClick={() => setAsset(a)}
              className={`flex items-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-medium transition-colors ${
                asset === a ? "bg-white/10 text-white" : "text-gray-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <AssetIcon asset={a} size={16} />
              {a}
            </button>
          ))}
        </div>
        <p className="ml-auto text-xs text-gray-500">
          Buying crypto with fiat?{" "}
          <Link href="/guide/buy" className="text-brand hover:text-brand-hover">How to buy →</Link>
          <span className="mx-2 text-gray-700">·</span>
          Cashing out to fiat?{" "}
          <Link href="/guide/sell" className="text-brand hover:text-brand-hover">How to sell →</Link>
        </p>
      </div>

      {/* Filter row */}
      {!isOpenAsset && (
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-md border border-white/10 px-3">
          {/*
           * Text with a decimal keypad, not type="number". The number input
           * paints its own stepper, which the browser draws on a light
           * background regardless of the field's colours — that was the white
           * block beside the currency code. It also changes value on scroll,
           * which is a hazard on a filter row. Non-numeric input is filtered
           * on the way in instead.
           */}
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="Amount"
            aria-label={`Amount in ${viewFiat}`}
            className="w-32 bg-transparent py-2 text-sm tabular-nums text-white outline-none placeholder:text-gray-600"
          />
          <span className="text-xs text-gray-500">{viewFiat}</span>
        </div>
        <CurrencyCombobox value={fiat} onChange={chooseFiat} priorityCodes={LIQUID_CURRENCIES} allowInternational />
        {!isInternational && methodOptions.length > 0 && (
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={selectCls}>
            <option value="">All payment methods</option>
            {methodOptions.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        )}
        {/* Advertiser reputation floor. The counterpart to a merchant's own
            minimum: both sides get to decline. */}
        <select
          value={minRep}
          onChange={(e) => setMinRep(Number(e.target.value))}
          className={selectCls}
          title="Hide advertisers below this reputation"
        >
          <option value={0}>Any reputation</option>
          <option value={70}>70+ reputation</option>
          <option value={80}>80+ reputation</option>
          <option value={90}>90+ reputation</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={selectCls}>
          {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
            <option key={k} value={k}>Sort: {SORT_LABELS[k]}</option>
          ))}
        </select>
        <span className="text-xs text-gray-600">
          {rows.length} advertiser{rows.length === 1 ? "" : "s"}
        </span>
      </div>
      )}

      {/* OPEN is not P2P-traded yet — presale info instead of the book */}
      {isOpenAsset && (
        <div className="mt-6 max-w-2xl border-y border-white/5 py-8">
          <p className="text-lg font-semibold text-white">OPEN is in presale</p>
          <p className="mt-2 text-sm text-gray-400">
            OPEN P2P trading and swapping unlock when the network goes live — until then, OPEN is only available
            through the official sale.
          </p>
          <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
            <span>Presale allocation</span>
            <span className="tabular-nums">{PRESALE_PCT}% raised</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-white/10">
            <div className="h-2 rounded-full bg-gradient-to-r from-brand to-brand-teal" style={{ width: `${PRESALE_PCT}%` }} />
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <Link
              href="/open"
              className="inline-block rounded-md bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
            >
              Buy OPEN in the presale →
            </Link>
            {/*
              * A way out. Selecting OPEN replaces the order book, and the only
              * exits were the asset tabs above — which is a dead end if you
              * arrived here and expected a market. Clicking the nav link for the
              * page you are already on does not remount the view, so "go home"
              * did not clear it either.
              */}
            <button
              type="button"
              onClick={() => setAsset("USDT")}
              className="text-sm text-gray-400 underline decoration-white/20 underline-offset-4 hover:text-white"
            >
              Back to the {viewFiat} order book
            </button>
          </div>
        </div>
      )}

      {/* Advertiser list — flat rows, no containing box (Bybit-style) */}
      {!isOpenAsset && (
      <div className="mt-6">
        <DataTable
          minWidth={920}
          head={
            <tr>
              <Th>Advertiser</Th>
              <Th right>Price</Th>
              <Th right>Available / Limits</Th>
              <Th>Payment methods</Th>
              <Th right>Trade</Th>
            </tr>
          }
        >
          {rows.map((row) => (
            <AdRow key={row.ad.id} row={row} userDirection={tab} />
          ))}
          {rows.length === 0 && (
            <tr>
              {/*
                * An empty book is the best moment to recruit a merchant: this
                * visitor wanted to trade this pair and found nobody. Telling
                * them to go elsewhere answers the wrong question — the market
                * is empty because it needs someone, and it could be them.
                */}
              <td colSpan={5} className="px-4 py-12">
                <div className="mx-auto max-w-xl text-center">
                  <p className="text-sm text-gray-300">
                    Nobody is advertising {asset}/{viewFiat} yet.
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-gray-500">
                    This market is empty rather than closed. The first merchant in a corridor sets the price and takes
                    every order in it — if you can settle {viewFiat}, that could be you.
                  </p>
                  <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                    <Link
                      href="/guide/merchant"
                      className="rounded-md bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-hover"
                    >
                      Become a merchant
                    </Link>
                    <Link
                      href="/ads/new"
                      className="rounded-md border border-white/15 px-4 py-2.5 text-sm text-gray-200 hover:border-white/30"
                    >
                      Post the first advertisement
                    </Link>
                  </div>
                  <p className="mt-4 text-xs text-gray-600">
                    Or trade a different pair — try another asset above, or the 🌐 International market, where
                    advertisers accept any currency.
                  </p>
                </div>
              </td>
            </tr>
          )}
        </DataTable>
      </div>
      )}

      {/* Only on the landing view. On a country page the copy above already
          explains that market, and repeating it under every book would be
          noise rather than help. */}
      {showExplainer && <HomeExplainer asset={asset} fiat={viewFiat} buying={tab === "Buy"} />}
    </div>
  );
}

/**
 * One advertisement, which expands in place into the order form.
 *
 * Expanding beats navigating away: the price, limits and the advertiser you are
 * comparing against stay on screen while you decide the amount, which is the
 * whole reason the order book is a list.
 */
function AdRow({ row, userDirection }: { row: ViewRow; userDirection: TradeDirection }) {
  const { ad, merchant, price, minFiat, maxFiat, fiat } = row;
  const buy = userDirection === "Buy";
  const [open, setOpen] = useState(false);

  return (
    <>
    <Tr>
      <Td py="py-6">
        <MerchantCell merchant={merchant} size="md" />
        {ad.international && (
          <p className="mt-1.5 pl-[52px] text-[11px] text-gray-500">🌐 International — trades in any currency</p>
        )}
      </Td>
      <Td right num py="py-6">
        <p className="font-mono text-xl font-semibold tabular-nums text-white">
          {formatNumber(price)} <span className="text-sm font-normal text-gray-400">{fiat}</span>
        </p>
        <p className="mt-1 text-[11px] text-gray-600">
          {ad.pricing.type === "Floating"
            ? `Floating ${ad.pricing.premiumPct >= 0 ? "+" : ""}${ad.pricing.premiumPct}%`
            : "Fixed"}
        </p>
      </Td>
      <Td right num py="py-6">
        <p className="text-gray-200">{formatCrypto(ad.availableLiquidity, ad.asset)}</p>
        <p className="mt-1 text-xs text-gray-500">
          {formatFiat(minFiat, fiat, 0)} – {formatFiat(maxFiat, fiat, 0)}
        </p>
      </Td>
      <Td py="py-6">
        {ad.international ? (
          <span className="border-l-2 border-brand-teal pl-1.5 text-xs text-gray-300">🌐 Any payment method</span>
        ) : (
          <div className="flex max-w-60 flex-wrap gap-x-3 gap-y-1.5">
            {ad.paymentMethods.map((m) => (
              <span key={m} className="border-l-2 border-amber-400/60 pl-1.5 text-xs text-gray-400">
                {m}
              </span>
            ))}
          </div>
        )}
      </Td>
      <Td right py="py-6">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          /* Fixed floor and no wrapping, so "Sell USDT" and "Buy SOL" are the
             same size and every row is the same height. */
          className={`inline-block min-w-[8rem] whitespace-nowrap rounded-md px-6 py-2.5 text-center text-sm font-semibold text-white transition-colors ${
            buy ? "bg-emerald-600 hover:bg-emerald-500" : "bg-orange-600 hover:bg-orange-500"
          }`}
        >
          {open ? "Hide" : `${userDirection} ${ad.asset}`}
        </button>
      </Td>
    </Tr>
    {open && (
      <tr>
        <td colSpan={5} className="p-0">
          <OrderPanel
            ad={ad}
            merchant={merchant}
            price={price}
            fiat={fiat}
            minFiat={minFiat}
            maxFiat={maxFiat}
            userDirection={userDirection}
            onClose={() => setOpen(false)}
          />
        </td>
      </tr>
    )}
    </>
  );
}
