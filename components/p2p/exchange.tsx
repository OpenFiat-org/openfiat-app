"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TradeDirection } from "@/lib/types";
import {
  assetLabel,
  fetchAdvertisementBook,
  type BookFilter,
  type LiveAd,
} from "@/lib/live-advertisements";
import { fetchMerchantNames } from "@/lib/live-merchants";
import { fetchNamedAssets, type NamedAsset } from "@/lib/pairs";
import { nodeUrl } from "@/lib/node-endpoint";
import { WalletAvatar } from "@/components/wallet-avatar";
import {
  preferredCurrency,
  writeMarketSlug,
  writePreferredCurrency,
} from "@/lib/market-preference";
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
 *
 * # Filtering used to happen here, after downloading everything
 *
 * This screen used to call `fetchAdvertisements()` — which walks every page
 * `getAdvertisements` has, up to `MAX_PAGES * PAGE_SIZE` — and then applied
 * the side, asset, currency and payment-method filters to the result with
 * `Array.prototype.filter`. That worked at devnet volume for the same reason
 * `openfiat_advertisements::query`'s module doc gives: it fails in both
 * directions at any real one. The node now does the narrowing:
 * `fetchAdvertisementBook` sends the tab's side, the chosen asset's mint,
 * the chosen currency and the chosen payment method to `getAdvertisements`'
 * `AdvertisementFilter`, and reads back one page at a time — the table below
 * shows exactly what one page holds, and "Load more" is how a reader asks
 * for the next one, rather than this screen fetching a hundred pages nobody
 * scrolled to.
 *
 * The fiat amount and the sort order stay client-side. An amount filter
 * compares a fiat figure against each advertisement's own resolved price
 * (`LiveAd.price`), which the node does not expose as a filterable field —
 * `AdvertisementFilter.amount` is denominated in the *asset*, at the
 * advertisement's own decimals, and converting a fiat figure into that scale
 * for every possible advertisement is exactly the per-row work a filter
 * exists to avoid doing on this side. Sorting has nowhere else to go either:
 * the node's own order is by id, for cursor stability (see `query::page`),
 * and "best price first" is a reading of a page already in hand, not a
 * narrowing of what is asked for.
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

const SORT_KEYS: Record<SortKey, "sortBestPrice" | "sortHighestLimits"> = {
  price: "sortBestPrice",
  limits: "sortHighestLimits",
};

const selectCls =
  "rounded-md border border-white/10 px-3 py-2 text-sm text-gray-300 outline-none focus:border-brand/50 [&>option]:bg-[#10151d]";



const DEFAULT_FIAT = "USD";

/** Rows per request. `DEFAULT_PAGE` on the node is 25; asked for explicitly
 *  so a page's size is a fact stated here, not the node's default leaking
 *  through unstated. */
const PAGE_LIMIT = 25;

/**
 * The size of the two reference reads below (the currency picker's priority
 * sample and the payment-method catalogue) — bounded at the node's own
 * `MAX_PAGE`, since both exist to populate a picker rather than to be the
 * table, and neither needs to be exhaustive to be useful.
 */
const PRIORITY_SAMPLE_LIMIT = 100;

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
  const t = useTranslations("exchange");
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
  /** The RPC's own bookmark for this filter. `null` once there is no more. */
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Which tickers this node names a mint — `undefined` while asking, `null`
   * if it could not be asked, `[]` if it answered that it names none.
   *
   * All three are kept apart because they mean different things to a reader.
   * See the pill row below for what each one renders.
   */
  const [named, setNamed] = useState<NamedAsset[] | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    // `nodeUrl()`, not the build's default: `fetchAdvertisementBook` reads
    // the node the user selected, and pills sourced from a different node
    // would offer filters for a table the book below was never resolved
    // against.
    void fetchNamedAssets(nodeUrl()).then((assets) => {
      if (!cancelled) setNamed(assets);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * Apply the remembered market after mount (landing page only).
   *
   * This used to read a country slug and invert it to a currency through a
   * 253-row table compiled into this app — the exchange's one remaining
   * reason to know the countries of the world. The preference is stored as a
   * currency now, which is the only part of it this screen ever wanted.
   */
  useEffect(() => {
    if (!rememberPreference) return;
    const saved = preferredCurrency();
    if (saved) setFiat(saved);
  }, [rememberPreference]);

  // Remember the last-browsed country page as the preferred market — both
  // halves of it, because the two are no longer derivable from each other:
  // the slug is what the country pages link by, the currency is what this
  // screen opens on.
  useEffect(() => {
    if (!savePreference) return;
    writeMarketSlug(savePreference);
    writePreferredCurrency(initialFiat);
  }, [savePreference, initialFiat]);

  function chooseFiat(code: string) {
    setFiat(code);
    setMethod("");
    // Shared with the settings screen's own currency preference, so the two
    // controls cannot disagree about which market this browser prefers.
    writePreferredCurrency(code);
  }

  // The taker's tab is the opposite of what the filter has to ask for: a
  // buyer is reading merchants who are *selling*. Naming this once means the
  // request and the heading below never risk disagreeing about which half
  // of the book "Buy" means.
  const merchantDirection: "Buy" | "Sell" = tab === "Buy" ? "Sell" : "Buy";

  // The mint the pill filters on, never the label it shows — see
  // `NamedAsset.mint`. `undefined` while `named` has not answered yet is the
  // same "no constraint" `AdvertisementFilter.asset_mint` already gives an
  // absent field, which only matters here because nothing can select a pill
  // before `named` exists to draw it.
  const assetMint = useMemo(
    () =>
      asset === ALL_ASSETS ? undefined : named?.find((entry) => entry.symbol === asset)?.assetMint,
    [asset, named],
  );

  const rowsFilter = useMemo<BookFilter>(
    () => ({
      fiatCurrency: fiat,
      direction: merchantDirection,
      assetMint,
      paymentMethod: method || undefined,
    }),
    [fiat, merchantDirection, assetMint, method],
  );

  const load = useCallback(async () => {
    setError(null);
    setAds(null);
    setCursor(null);
    try {
      const first = await fetchAdvertisementBook(rowsFilter, { limit: PAGE_LIMIT });
      setAds(first.ads);
      setCursor(first.nextCursor);
    } catch (err) {
      // "No advertisements" and "could not reach a node" are different
      // facts — see components/ads/merchant-console.tsx for the same call.
      setError(err instanceof Error ? err.message : String(err));
      setAds(null);
    }
  }, [rowsFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = useCallback(async () => {
    if (cursor === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await fetchAdvertisementBook(rowsFilter, { after: cursor, limit: PAGE_LIMIT });
      setAds((prev) => [...(prev ?? []), ...next.ads]);
      setCursor(next.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMore(false);
    }
  }, [rowsFilter, cursor, loadingMore]);

  /**
   * A currency picker cannot filter on this screen's own book, because the
   * book *is* filtered to one currency — that is the whole point of the
   * change above. So this reads one bounded, unfiltered sample instead: the
   * first `PRIORITY_SAMPLE_LIMIT` active advertisements, in the node's own
   * id order, once per mount. It floats currencies to the top of the picker
   * on a best-effort basis, exactly as `priorityCodes` is documented to —
   * never as a claim that a currency missing from it has no offers, which a
   * full walk could have supported and this sample cannot.
   */
  const [currencySample, setCurrencySample] = useState<LiveAd[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchAdvertisementBook({}, { limit: PRIORITY_SAMPLE_LIMIT })
      .then((page) => {
        if (!cancelled) setCurrencySample(page.ads);
      })
      .catch(() => {
        // A missing priority hint degrades to an alphabetical picker, not a
        // broken one — see `CurrencyCombobox`'s own handling of `undefined`.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Currencies with at least one active ad in the sample above. */
  const LIQUID_CURRENCIES = useMemo(
    () => new Set(currencySample.map((a) => a.fiatCurrency)),
    [currencySample],
  );

  /**
   * The rails on offer for this side, asset and currency — asked for
   * *without* `method`, so picking one rail never narrows the list of rails
   * there was to pick from. A bounded single page, like the currency sample
   * above and for the same reason: this is a picker's contents, not the
   * table, and does not need every matching advertisement to be useful.
   */
  const [methodCatalog, setMethodCatalog] = useState<LiveAd[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchAdvertisementBook(
      { fiatCurrency: fiat, direction: merchantDirection, assetMint },
      { limit: PRIORITY_SAMPLE_LIMIT },
    )
      .then((page) => {
        if (!cancelled) setMethodCatalog(page.ads);
      })
      .catch(() => {
        if (!cancelled) setMethodCatalog([]);
      });
    return () => {
      cancelled = true;
    };
  }, [fiat, merchantDirection, assetMint]);

  /**
   * The rails on offer in this currency, as `{ id, label }`.
   *
   * Keyed by id and labelled by name, because an advertisement carries
   * `builtin:pix` and a taker reads "PIX". Filtering on the label would fail
   * the moment two nodes phrase one rail differently; showing the id would
   * put the node's internal key in a dropdown.
   */
  const methodOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const ad of methodCatalog) {
      ad.paymentMethods.forEach((id, i) => byId.set(id, ad.paymentMethodLabels[i] ?? id));
    }
    return [...byId].map(([id, label]) => ({ id, label }));
  }, [methodCatalog]);

  /**
   * Every registered merchant's display name for the wallets on the loaded
   * page(s) — see `fetchMerchantNames`' own doc for why this can only ever
   * be asked about wallets already on screen. Grows as "Load more" adds
   * pages; never shrinks, since a name a node once answered does not stop
   * being true when the filter narrows to a different page.
   */
  const [merchantNames, setMerchantNames] = useState<ReadonlyMap<string, string>>(new Map());
  const requestedWallets = useRef<Set<string>>(new Set());
  useEffect(() => {
    const toResolve = [...new Set((ads ?? []).map((ad) => ad.merchantPublicKey))].filter(
      (wallet) => !requestedWallets.current.has(wallet),
    );
    if (toResolve.length === 0) return;
    toResolve.forEach((wallet) => requestedWallets.current.add(wallet));
    let cancelled = false;
    void fetchMerchantNames(toResolve).then((resolved) => {
      if (cancelled || resolved.size === 0) return;
      setMerchantNames((prev) => new Map([...prev, ...resolved]));
    });
    return () => {
      cancelled = true;
    };
  }, [ads]);

  /**
   * The fiat-amount box and the sort order, applied to whatever pages are
   * loaded — see the module doc above for why these two stayed client-side
   * rather than travelling to the RPC filter with the rest.
   */
  const rows = useMemo(() => {
    const fiatAmount = Number(amount) || 0;
    const out = (ads ?? []).filter((ad) => {
      if (ad.price === null) return false; // no oracle read yet — nothing to quote
      // The box asks for a fiat amount; the bounds are in the asset (see
      // `LiveAd.minTrade`), so the comparison needs a conversion and it has
      // to happen per advertisement, at that advertisement's own price.
      // Comparing the typed figure directly filtered the book by a number
      // roughly 129x off on a KES pair — hiding every ad that would take the
      // trade and keeping ones that would not.
      if (fiatAmount > 0) {
        const assetAmount = fiatAmount / ad.price;
        if (assetAmount < ad.minTrade || assetAmount > ad.maxTrade) return false;
      }
      return true;
    });
    switch (sort) {
      case "price":
        out.sort((a, b) => (tab === "Buy" ? a.price! - b.price! : b.price! - a.price!));
        break;
      case "limits":
        out.sort((a, b) => b.maxTrade - a.maxTrade);
        break;
    }
    return out;
  }, [ads, amount, sort, tab]);

  /*
   * The selected asset as a heading should say it. `asset` is the node's
   * spelling because that is what the book is matched on; a headline
   * reading "Buy wSOL with KES" is that identity leaking into prose. Falls
   * back to `asset` itself so an asset selected before the node answered is
   * still named, rather than becoming "crypto" for a moment.
   */
  const assetName = asset === ALL_ASSETS
    ? null
    : ((named ?? []).find((entry) => entry.symbol === asset)?.label ?? asset);
  const cryptoWord = t("cryptoFallback");

  return (
    <div>
      {showHeading && (
        <PageHero
          compact
          variant={tab === "Sell" ? "flow-rev" : "flow"}
          title={t("heroTitle", {
            buying: String(tab === "Buy"),
            asset: assetName ?? cryptoWord,
            fiat,
          })}
          description={t("heroDescription")}
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
              {t(d === "Buy" ? "buy" : "sell")}
            </button>
          ))}
        </div>
        {/* Wraps. The asset buttons do not fit across 390px, and without
            this the row pushed the whole page into a horizontal scroll —
            on the landing page, at the width most visitors arrive at. */}
        <div className="flex flex-wrap gap-1">
          <AssetPill label={t("allAssets")} selected={asset === ALL_ASSETS} onSelect={() => setAsset(ALL_ASSETS)} />
          {/* Nothing while the node is being asked. A pill row assembled from
              a guess and then rearranged under the pointer is worse than one
              that arrives a moment late. */}
          {/* The pill reads `label` and filters on `symbol`, and the two
              differ for exactly one mint. The book below is matched against
              `ad.assetSymbol`, which the node resolved — so selecting on the
              *displayed* name would make the SOL pill a filter for a name
              nothing answers to, which is precisely the bug the hardcoded
              `["USDT", "USDC", "USD1", "SOL"]` list used to have. */}
          {(named ?? []).map((entry) => (
            <AssetPill
              key={entry.symbol}
              label={entry.label}
              icon
              selected={asset === entry.symbol}
              onSelect={() => setAsset(entry.symbol)}
            />
          ))}
          <Link
            href="/open"
            className="flex items-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-medium text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
            title={t("openTitle")}
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
          <p className="basis-full text-xs text-gray-500">{t("namedNull")}</p>
        )}
        {named?.length === 0 && (
          <p className="basis-full text-xs text-gray-500">{t("namedEmpty")}</p>
        )}
        <p className="ml-auto text-xs text-gray-500">
          {t("buyingPrompt")}{" "}
          <Link href="/guide/buy" className="text-brand hover:text-brand-hover">{t("howToBuy")}</Link>
          <span className="mx-2 text-gray-700">·</span>
          {t("sellingPrompt")}{" "}
          <Link href="/guide/sell" className="text-brand hover:text-brand-hover">{t("howToSell")}</Link>
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
            placeholder={t("amountPlaceholder")}
            aria-label={t("amountAria", { fiat })}
            className="w-32 bg-transparent py-2 text-sm tabular-nums text-white outline-none placeholder:text-gray-600"
          />
          <span className="text-xs text-gray-500">{fiat}</span>
        </div>
        <CurrencyCombobox value={fiat} onChange={chooseFiat} priorityCodes={LIQUID_CURRENCIES} />
        {methodOptions.length > 0 && (
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={selectCls}>
            <option value="">{t("allPaymentMethods")}</option>
            {methodOptions.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        )}
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={selectCls}>
          {(Object.keys(SORT_KEYS) as SortKey[]).map((k) => (
            <option key={k} value={k}>{t("sortPrefix", { label: t(SORT_KEYS[k]) })}</option>
          ))}
        </select>
        <span className="text-xs text-gray-600">
          {ads !== null && t("advertiserCount", { count: rows.length })}
        </span>
      </div>

      <div className="mt-6">
        {error ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/[0.04] p-6">
            <p className="text-sm font-medium text-red-300">{t("bookError")}</p>
            <p className="mt-1 font-mono text-xs text-red-400/80">{error}</p>
            <button
              onClick={() => void load()}
              className="mt-4 rounded-md border border-white/15 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-white/5"
            >
              {t("retry")}
            </button>
          </div>
        ) : ads === null ? (
          <p className="p-6 text-sm text-gray-500">{t("reading")}</p>
        ) : (
          <DataTable
            minWidth={860}
            head={
              <tr>
                <Th>{t("colAdvertiser")}</Th>
                <Th right>{t("colPrice")}</Th>
                <Th right>{t("colLimits")}</Th>
                <Th>{t("colPaymentMethods")}</Th>
                <Th right>{t("colTrade")}</Th>
              </tr>
            }
          >
            {rows.map((ad) => (
              <AdRow
                key={ad.id}
                ad={ad}
                userDirection={tab}
                merchantName={merchantNames.get(ad.merchantPublicKey) ?? null}
                open={openAd === ad.id}
                onToggle={() => setOpenAd((current) => (current === ad.id ? null : ad.id))}
              />
            ))}
            {rows.length > 0 && cursor !== null && (
              // A page at a time, on request — never the whole matching set
              // fetched up front. See the module doc's "Filtering used to
              // happen here" section for what this replaced.
              <tr>
                <td colSpan={5} className="px-4 py-5 text-center">
                  <button
                    type="button"
                    onClick={() => void loadMore()}
                    disabled={loadingMore}
                    className="rounded-md border border-white/15 px-4 py-2 text-sm font-medium text-gray-200 hover:border-white/30 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loadingMore ? t("loadingMore") : t("loadMore")}
                  </button>
                </td>
              </tr>
            )}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12">
                  <div className="mx-auto max-w-xl text-center">
                    <p className="text-sm text-gray-300">
                      {t("emptyPair", { hasAsset: String(asset !== ALL_ASSETS), asset: asset ?? "", fiat })}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-gray-500">
                      {t("emptyBody", { fiat })}
                    </p>
                    <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                      <Link
                        href="/become-a-merchant"
                        className="rounded-md bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-hover"
                      >
                        {t("becomeMerchant")}
                      </Link>
                      <Link
                        href="/ads/new"
                        className="rounded-md border border-white/15 px-4 py-2.5 text-sm text-gray-200 hover:border-white/30"
                      >
                        {t("postFirstAd")}
                      </Link>
                    </div>
                    <p className="mt-4 text-xs text-gray-600">
                      {t("tryDifferentPair")}
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
        <HomeExplainer asset={assetName ?? cryptoWord} fiat={fiat} buying={tab === "Buy"} />
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
  merchantName,
  open,
  onToggle,
}: {
  ad: LiveAd;
  userDirection: TradeDirection;
  /**
   * The wallet's `MerchantName` identity claim (OFS-5000), or `null` when it
   * has never published one — see `lib/live-merchants.ts`'s
   * `fetchMerchantNames`. Resolved by `P2PExchange` for the page it is
   * showing, never fetched per row: this component only reads the answer.
   */
  merchantName: string | null;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("exchange");
  const buy = userDirection === "Buy";
  const shortLabel = t("merchantLabel", { short: ad.merchantShort });

  return (
    <>
    <Tr>
      <Td py="py-6">
        {/* A merchant is a PeerId and nothing else the protocol vouches for
            — but a wallet that published a `MerchantName` claim gets to be
            called that instead of six hex characters, the same self-asserted
            name `merchant-profile.tsx` shows on the full profile. The robot
            is drawn from the id either way, so it stays recognisable across
            the book even before a name loads. */}
        <span className="flex items-center gap-2.5" title={ad.merchantPeerId}>
          <WalletAvatar seed={ad.merchantPeerId} label={merchantName ?? shortLabel} size={32} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-white">
              {merchantName ?? shortLabel}
            </span>
            {/* The raw id stays visible under a name, since the name is a
                claim and the id is what every other screen — the order
                panel, the trade summary, a dispute — identifies this
                counterparty by. Omitted when there is no name to
                disambiguate from: `shortLabel` above already says it once. */}
            {merchantName && (
              <span className="block font-mono text-xs text-gray-500">…{ad.merchantShort}</span>
            )}
          </span>
        </span>
      </Td>
      <Td right num py="py-6">
        <p className="font-mono text-xl font-semibold tabular-nums text-white">
          {formatNumber(ad.price!)} <span className="text-sm font-normal text-gray-400">{ad.fiatCurrency}</span>
        </p>
        <p className="mt-1 text-[11px] text-gray-600">
          {ad.pricingKind === "Floating"
            ? t("floating", {
                sign: (ad.premiumBps ?? 0) >= 0 ? "+" : "",
                pct: ((ad.premiumBps ?? 0) / 100).toFixed(2),
              })
            : t("fixed")}
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
          {ad.paymentMethods.map((id, i) => (
            <span
              key={id}
              title={id}
              className="border-l-2 border-amber-400/60 pl-1.5 text-xs text-gray-400"
            >
              {ad.paymentMethodLabels[i] ?? id}
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
          {open ? t("hide") : t("tradeAction", { direction: t(buy ? "buy" : "sell"), asset: assetLabel(ad) })}
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
