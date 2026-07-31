"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { TradeDirection } from "@/lib/types";
import { assetLabel, fetchAdvertisements, type LiveAd } from "@/lib/live-advertisements";
import { fetchNamedAssets } from "@/lib/pairs";
import { nodeUrl } from "@/lib/node-endpoint";
import { WalletAvatar } from "@/components/wallet-avatar";
import { COUNTRIES_BY_SLUG, countriesByCurrency } from "@/lib/data/countries";
import { formatNumber } from "@/lib/format";
import { AssetIcon } from "@/components/asset-icon";
import { AssetLabel, TradeLimits } from "@/components/asset-label";
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

/*
 * The asset pills used to be `["USDT", "USDC", "USD1", "SOL"]`, four tickers
 * declared here, and the book is filtered by comparing a pill to the symbol
 * the *node* resolved for each advertisement's mint. Two of the four could
 * therefore never match anything: the node calls the wrapped-SOL mint `wSOL`,
 * so the `SOL` pill was a filter for a name nothing answers to, and `USD1`
 * names no mint on this deployment at all. Meanwhile `wSOL` and `tUSDC` — the
 * latter being the Token-2022 mint the running devnet deployment denominates
 * its fee treasuries in — had no pill, so their books were unreachable from
 * the app's own landing page.
 *
 * The list comes from the node now (`fetchNamedAssets`), for the reason
 * `lib/pairs.ts` sets out at length: the settlement-mint allowlist is on
 * chain and governance-updatable, so any list here is a snapshot that starts
 * going stale the moment governance touches it. Hand-correcting the four
 * strings would have rebuilt the same fault one release later.
 *
 * OPEN is still absent and still linked to its own page. That is not a
 * naming decision this file is making — OPEN is deliberately not on the
 * escrow settlement allowlist until the public sale, so the node does not
 * name it either and it cannot appear in the answer.
 */

/** No pill selected: every asset in the book, unfiltered. */
const ALL_ASSETS = null;

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
  /*
   * `null` is "all assets", and it is the default.
   *
   * This used to open on `"USDT"` — one of the four tickers the file also
   * declared existed. With the list coming from the node, picking a
   * favourite out of it on the visitor's behalf is the same app-side
   * assertion one step smaller, and there is no honest basis for choosing
   * one: "first in the node's table" is an implementation detail of a
   * display table, and "the one with the most ads" moves the book under a
   * reader between renders. Unfiltered shows strictly more of the real book,
   * and every row names its own token through `AssetLabel` regardless.
   */
  const [asset, setAsset] = useState<string | null>(ALL_ASSETS);
  const [fiat, setFiat] = useState(initialFiat);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [sort, setSort] = useState<SortKey>("price");
  const [openAd, setOpenAd] = useState<string | null>(null);

  const [ads, setAds] = useState<LiveAd[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Which tickers this node names a mint — `undefined` while asking, `null`
   * if it could not be asked, `[]` if it answered that it names none.
   *
   * All three are kept apart because they mean different things to a reader.
   * See the pill row below for what each one renders.
   */
  const [named, setNamed] = useState<string[] | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    // `nodeUrl()`, not the build's default: `fetchAdvertisements` reads the
    // node the user selected, and pills sourced from a different node would
    // offer filters for a table the book below was never resolved against.
    void fetchNamedAssets(nodeUrl()).then((symbols) => {
      if (!cancelled) setNamed(symbols);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
      if (ad.direction !== wantDirection) continue;
      // Matched against the symbol the NODE resolved for the ad's mint, not
      // against a mint this app mapped `asset` to. The pill says "USDC", so
      // the question is "which advertisements does the node call USDC" — and
      // an ad naming a mint nothing has a name for belongs to no ticker
      // market, because nothing names it. See `assetLabel`.
      //
      // Both sides of this comparison now come out of the node's mint table:
      // the pill was built from it, and `assetSymbol` was resolved through
      // it. Nothing case-folds, because there is no longer a spelling
      // mismatch to paper over.
      if (asset !== ALL_ASSETS && ad.assetSymbol !== asset) continue;
      if (ad.fiatCurrency !== fiat) continue;
      if (ad.price === null) continue; // no oracle read yet — nothing to quote
      if (method !== "" && !ad.paymentMethods.includes(method)) continue;
      // The box asks for a fiat amount; the bounds are in the asset (see
      // `LiveAd.minTrade`), so the comparison needs a conversion and it has
      // to happen per advertisement, at that advertisement's own price.
      // Comparing the typed figure directly, as this did, filtered the book
      // by a number roughly 129x off on a KES pair — hiding every ad that
      // would take the trade and keeping ones that would not.
      if (fiatAmount > 0) {
        const assetAmount = fiatAmount / ad.price;
        if (assetAmount < ad.minTrade || assetAmount > ad.maxTrade) continue;
      }
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
          title={`${tab} ${asset ?? "crypto"} with ${fiat} via P2P`}
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
        {/* Wraps. The asset buttons do not fit across 390px, and without
            this the row pushed the whole page into a horizontal scroll —
            on the landing page, at the width most visitors arrive at. */}
        <div className="flex flex-wrap gap-1">
          <AssetPill label="All assets" selected={asset === ALL_ASSETS} onSelect={() => setAsset(ALL_ASSETS)} />
          {/* Nothing while the node is being asked. A pill row assembled from
              a guess and then rearranged under the pointer is worse than one
              that arrives a moment late. */}
          {(named ?? []).map((symbol) => (
            <AssetPill
              key={symbol}
              label={symbol}
              icon
              selected={asset === symbol}
              onSelect={() => setAsset(symbol)}
            />
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

        {/*
          Why the two empty answers are not one message.

          `null` is silence — the node could not be asked, or is a build from
          before it published its mint table. That is a fact about this app's
          connection, not about the network, and saying "there are no assets"
          on the strength of it would be inventing a finding out of a failed
          request. `[]` is an answer: the node names no mints, so no ticker
          filter exists to offer.

          Both leave the book unfiltered rather than empty. Every row still
          names its own token through `AssetLabel`, which reads the mint the
          advertisement actually carries — so the reader loses a filter here,
          never the ability to see what a row is denominated in.
        */}
        {named === null && (
          <p className="basis-full text-xs text-gray-500">
            Could not ask this node which assets it names, so the book below is unfiltered. This says
            nothing about which assets are traded — only that we could not ask.
          </p>
        )}
        {named?.length === 0 && (
          <p className="basis-full text-xs text-gray-500">
            This node names no assets, so there is nothing to filter the book by. Advertisements are
            still shown, each against the mint address it carries.
          </p>
        )}
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
                      Nobody is advertising {asset ? `${asset}/${fiat}` : `anything in ${fiat}`} yet.
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

      {/* The walkthrough is about the mechanics of a trade, which do not
          depend on the token — so with no asset selected it says "crypto"
          rather than naming one the reader did not pick. */}
      {showExplainer && (
        <HomeExplainer asset={asset ?? "crypto"} fiat={fiat} buying={tab === "Buy"} />
      )}
    </div>
  );
}

/**
 * One asset filter.
 *
 * `icon` is off for "All assets", which is a filter rather than a token and
 * has no mark to draw. For the rest `AssetIcon` decides for itself: it draws
 * only names this repo ships art for, and the node answers names it does not
 * — `wSOL` and `tUSDC` among them. A pill with no mark is the correct
 * rendering of a token whose logo we do not have, and the name is right
 * beside it.
 */
function AssetPill({
  label,
  icon = false,
  selected,
  onSelect,
}: {
  label: string;
  icon?: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex items-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-medium transition-colors ${
        selected ? "bg-white/10 text-white" : "text-gray-400 hover:bg-white/5 hover:text-white"
      }`}
    >
      {icon && <AssetIcon asset={label} size={16} />}
      {label}
    </button>
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
        {/* A merchant is a PeerId and nothing else — `LiveAd` carries no
            name, and there is none to show unless they published a
            MerchantName claim. The robot is drawn from that same id, so it
            adds no information the row did not already state, but it makes
            the same counterparty recognisable across the book. */}
        <span className="flex items-center gap-2.5" title={ad.merchantPeerId}>
          <WalletAvatar seed={ad.merchantPeerId} label={`Merchant …${ad.merchantShort}`} size={32} />
          <span className="font-mono text-sm text-gray-300">Merchant …{ad.merchantShort}</span>
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
        <p className="inline-flex items-baseline gap-1.5 text-gray-200">
          {formatNumber(ad.availableLiquidity)} <AssetLabel ad={ad} />
        </p>
        <p className="mt-1 text-xs text-gray-500">
          <TradeLimits ad={ad} />
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
          {open ? "Hide" : `${userDirection} ${assetLabel(ad)}`}
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
