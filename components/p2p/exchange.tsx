"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { StablecoinAsset, TradeDirection } from "@/lib/types";
import { fetchAdvertisements, type LiveAd } from "@/lib/live-advertisements";
import { COUNTRIES_BY_SLUG, countriesByCurrency } from "@/lib/data/countries";
import { formatCrypto, formatFiat, formatNumber } from "@/lib/format";
import { AssetIcon } from "@/components/asset-icon";
import { DataTable, Td, Th, Tr } from "@/components/data-table";
import { PageHero } from "@/components/page-hero";
import { CurrencyCombobox } from "@/components/p2p/currency-combobox";
import { HomeExplainer } from "@/components/home/explainer";
import { OrderPanel } from "@/components/p2p/order-panel";

/**
 * The P2P exchange book, read live from a node's `getAdvertisements`
 * (OFS-2100) via `lib/live-advertisements.ts`.
 *
 * # What this replaced
 *
 * The book used to be computed once at module load from `PUBLIC_ADS` — a
 * fixed-seed PRNG book against a static FX table (`lib/data/ads.ts`) — so
 * every visitor saw the same "market" whether or not the protocol was
 * reachable. It also offered an "International" view: borderless merchants
 * flagged `international: true`, USD-priced, FX-converted into whatever
 * currency the visitor picked. Nothing in the protocol has that concept — a
 * real advertisement (OFS-2100 §6, see `LiveAd`'s own doc) carries a single
 * `fiatCurrency` and no cross-currency conversion — so that view is gone
 * rather than kept running on invented numbers. A currency filter over the
 * one real book remains; the borderless/FX layer does not.
 *
 * Advertiser reputation, completion rate, and terms are gone for the same
 * reason: a `LiveAd` carries a merchant PeerId and nothing else. The old
 * "advertiser reputation floor" filter and "sort by completion rate" are
 * gone with them, since there is no live reputation figure to sort or filter
 * by yet.
 */

/**
 * Assets with an order book. OPEN is deliberately absent — it has no
 * peer-to-peer market until mainnet, so it is linked to its own page rather
 * than offered as a book to browse.
 */
const TRADED_ASSETS: StablecoinAsset[] = ["USDT", "USDC", "USD1", "SOL"];

type SortKey = "price" | "limits";

const SORT_LABELS: Record<SortKey, string> = {
  price: "Best price",
  limits: "Highest limits",
};

const selectCls =
  "rounded-md border border-white/10 px-3 py-2 text-sm text-gray-300 outline-none focus:border-brand/50 [&>option]:bg-[#10151d]";

const STORAGE_KEY = "openfiat:market";

const DEFAULT_FIAT = "USD";

export function P2PExchange({
  initialFiat = DEFAULT_FIAT,
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
  const [asset, setAsset] = useState<StablecoinAsset>("USDT");
  const [fiat, setFiat] = useState(initialFiat);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [sort, setSort] = useState<SortKey>("price");
  const [openAd, setOpenAd] = useState<string | null>(null);

  const [ads, setAds] = useState<LiveAd[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setAds(await fetchAdvertisements());
    } catch (err) {
      // "No advertisements" and "could not reach a node" are different
      // facts — see components/ads/merchant-console.tsx for the same call.
      setError(err instanceof Error ? err.message : String(err));
      setAds(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Apply the remembered market after mount (landing page only).
  useEffect(() => {
    if (!rememberPreference) return;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
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
      const users = countriesByCurrency(code);
      const country = users.find((c) => c.isRecognized) ?? users[0];
      if (country) localStorage.setItem(STORAGE_KEY, country.slug);
    } catch {
      /* localStorage unavailable */
    }
  }

  const BOOK = useMemo(() => (ads ?? []).filter((a) => a.status === "Active"), [ads]);

  /** Currencies with at least one active ad — floated to the top of the picker. */
  const LIQUID_CURRENCIES = useMemo(
    () => new Set(BOOK.map((a) => a.fiatCurrency)),
    [BOOK],
  );

  const methodOptions = useMemo(() => {
    const set = new Set<string>();
    for (const ad of BOOK) {
      if (ad.fiatCurrency === fiat) ad.paymentMethods.forEach((m) => set.add(m));
    }
    return [...set];
  }, [BOOK, fiat]);

  const rows = useMemo(() => {
    const wantDirection = tab === "Buy" ? "Sell" : "Buy";
    const fiatAmount = Number(amount) || 0;
    const out: LiveAd[] = [];
    for (const ad of BOOK) {
      if (ad.direction !== wantDirection || ad.asset !== asset) continue;
      if (ad.fiatCurrency !== fiat) continue;
      if (ad.price === null) continue; // no oracle read yet — nothing to quote
      if (method !== "" && !ad.paymentMethods.includes(method)) continue;
      if (fiatAmount > 0 && (fiatAmount < ad.minTrade || fiatAmount > ad.maxTrade)) continue;
      out.push(ad);
    }
    switch (sort) {
      case "price":
        out.sort((a, b) => (tab === "Buy" ? a.price! - b.price! : b.price! - a.price!));
        break;
      case "limits":
        out.sort((a, b) => b.maxTrade - a.maxTrade);
        break;
    }
    return out;
  }, [BOOK, tab, asset, fiat, amount, method, sort]);

  return (
    <div>
      {showHeading && (
        <PageHero
          compact
          variant={tab === "Sell" ? "flow-rev" : "flow"}
          title={`${tab} ${asset} with ${fiat} via P2P`}
          description="Trade stablecoins peer-to-peer. Escrow is locked on Solana before you pay; OpenFiat never holds your fiat."
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
          {TRADED_ASSETS.map((a) => (
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
          <Link
            href="/open"
            className="flex items-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-medium text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
            title="OPEN is in presale — it has no peer-to-peer market until mainnet"
          >
            <AssetIcon asset="OPEN" size={16} />
            OPEN
            <span aria-hidden className="text-gray-600">↗</span>
          </Link>
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
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-md border border-white/10 px-3">
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="Amount"
            aria-label={`Amount in ${fiat}`}
            className="w-32 bg-transparent py-2 text-sm tabular-nums text-white outline-none placeholder:text-gray-600"
          />
          <span className="text-xs text-gray-500">{fiat}</span>
        </div>
        <CurrencyCombobox value={fiat} onChange={chooseFiat} priorityCodes={LIQUID_CURRENCIES} />
        {methodOptions.length > 0 && (
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={selectCls}>
            <option value="">All payment methods</option>
            {methodOptions.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        )}
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={selectCls}>
          {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
            <option key={k} value={k}>Sort: {SORT_LABELS[k]}</option>
          ))}
        </select>
        <span className="text-xs text-gray-600">
          {ads !== null && `${rows.length} advertiser${rows.length === 1 ? "" : "s"}`}
        </span>
      </div>

      <div className="mt-6">
        {error ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/[0.04] p-6">
            <p className="text-sm font-medium text-red-300">Could not read the advertisement book from the node</p>
            <p className="mt-1 font-mono text-xs text-red-400/80">{error}</p>
            <button
              onClick={() => void load()}
              className="mt-4 rounded-md border border-white/15 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-white/5"
            >
              Retry
            </button>
          </div>
        ) : ads === null ? (
          <p className="p-6 text-sm text-gray-500">Reading the advertisement book…</p>
        ) : (
          <DataTable
            minWidth={860}
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
            {rows.map((ad) => (
              <AdRow
                key={ad.id}
                ad={ad}
                userDirection={tab}
                open={openAd === ad.id}
                onToggle={() => setOpenAd((current) => (current === ad.id ? null : ad.id))}
              />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12">
                  <div className="mx-auto max-w-xl text-center">
                    <p className="text-sm text-gray-300">
                      Nobody is advertising {asset}/{fiat} yet.
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-gray-500">
                      This market is empty rather than closed. The first merchant in a corridor sets the price and takes
                      every order in it — if you can settle {fiat}, that could be you.
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
                      Or trade a different pair — try another asset or currency above.
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </DataTable>
        )}
      </div>

      {showExplainer && <HomeExplainer asset={asset} fiat={fiat} buying={tab === "Buy"} />}
    </div>
  );
}

/**
 * One advertisement, which expands in place into the order form.
 */
function AdRow({
  ad,
  userDirection,
  open,
  onToggle,
}: {
  ad: LiveAd;
  userDirection: TradeDirection;
  open: boolean;
  onToggle: () => void;
}) {
  const buy = userDirection === "Buy";

  return (
    <>
    <Tr>
      <Td py="py-6">
        <span className="font-mono text-sm text-gray-300" title={ad.merchantPeerId}>
          Merchant …{ad.merchantShort}
        </span>
      </Td>
      <Td right num py="py-6">
        <p className="font-mono text-xl font-semibold tabular-nums text-white">
          {formatNumber(ad.price!)} <span className="text-sm font-normal text-gray-400">{ad.fiatCurrency}</span>
        </p>
        <p className="mt-1 text-[11px] text-gray-600">
          {ad.pricingKind === "Floating"
            ? `Floating ${(ad.premiumBps ?? 0) >= 0 ? "+" : ""}${((ad.premiumBps ?? 0) / 100).toFixed(2)}%`
            : "Fixed"}
        </p>
      </Td>
      <Td right num py="py-6">
        <p className="text-gray-200">{formatCrypto(ad.availableLiquidity, ad.asset)}</p>
        <p className="mt-1 text-xs text-gray-500">
          {formatFiat(ad.minTrade, ad.fiatCurrency, 0)} – {formatFiat(ad.maxTrade, ad.fiatCurrency, 0)}
        </p>
      </Td>
      <Td py="py-6">
        <div className="flex max-w-60 flex-wrap gap-x-3 gap-y-1.5">
          {ad.paymentMethods.map((m) => (
            <span key={m} className="border-l-2 border-amber-400/60 pl-1.5 text-xs text-gray-400">
              {m}
            </span>
          ))}
        </div>
      </Td>
      <Td right py="py-6">
        <button
          type="button"
          onClick={onToggle}
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
          <OrderPanel ad={ad} userDirection={userDirection} onClose={onToggle} />
        </td>
      </tr>
    )}
    </>
  );
}
