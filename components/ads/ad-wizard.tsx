"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import bs58 from "bs58";

import {
  AD_DRAFT_KEY,
  AD_STEPS,
  EMPTY_AD_DRAFT,
  MAX_PAYMENT_METHODS,
  PREMIUM_LIMIT_PCT,
  completeThrough,
  parseDraft,
  priceDecimalsFor,
  stepProblems,
  type AdDraft,
  type AdProblem,
} from "@/lib/ad-draft";
import { assetOptions, useReferenceData, type AssetOption } from "@/lib/reference";
import { tradingSymbol } from "@/lib/asset-display";
import { formatNumber } from "@/lib/format";
import { formatBaseUnits } from "@/lib/live-vaults";
import { explainRefusal, publishAdvertisement, toWireAmount } from "@/lib/merchant-ads";
import { peerIdForPublicKey } from "@/lib/arbitration";
import {
  WALLET_CHANGED_EVENT,
  currentSigner,
  readWalletConnection,
  type WalletConnection,
} from "@/lib/wallet-connection";
import { useVaultBacking, vaultCovers, type VaultBacking } from "@/components/wallet/use-vault-backing";
import { AssetPicker } from "@/components/ads/asset-picker";
import { MethodPicker } from "@/components/ads/method-picker";
import { PricePosition } from "@/components/ads/price-position";
import { CurrencyCombobox } from "@/components/p2p/currency-combobox";
import { CountrySelect } from "@/components/p2p/country-select";

const inputCls =
  "w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm tabular-nums text-white outline-none focus:border-brand/50 [&>option]:bg-[#10151d]";
const labelCls = "mb-1 block text-xs text-gray-500";

/**
 * Post an advertisement, in the order every P2P desk asks for it.
 *
 * # What this rebuild changed
 *
 * The steps are Binance's — ad type and asset, price, amount and limits,
 * payment methods, review and confirm — for the reason set out in
 * `lib/ad-draft.ts`: a merchant has done this before, and reordering the
 * same five decisions teaches them nothing.
 *
 * The asset is chosen from the node's mint table, not typed. The field it
 * replaces had the placeholder "Base58 mint address", and the merchant was
 * expected to produce a 32-byte public key from memory. The old comment
 * defending that was right that a ticker is a label and a mint is an
 * identity — and wrong that the two could therefore not be shown together.
 * The node publishes the mapping and the buyer's node applies it; applying
 * it before the signature instead of after changes nothing except who has
 * to know base58.
 *
 * The asset's *precision* comes from that same table. It used to be read off
 * the merchant's own liquidity vault, which meant a merchant could not post
 * an advertisement at all until they had opened one — the vault lookup was
 * load-bearing for a number the node already publishes.
 *
 * Publishing is real: the draft is signed by the connected wallet and
 * submitted to the selected node, and the id in the confirmation is the id
 * the network has.
 */
export function AdWizard() {
  const t = useTranslations("ads");
  const L = useTranslations("lifecycle");
  const [draft, setDraft] = useState<AdDraft>(EMPTY_AD_DRAFT);
  const [loaded, setLoaded] = useState(false);
  const [resumed, setResumed] = useState(false);
  const [published, setPublished] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [wallet, setWallet] = useState<WalletConnection | null>(null);

  const reference = useReferenceData();

  useEffect(() => {
    const update = () => setWallet(readWalletConnection());
    update();
    window.addEventListener(WALLET_CHANGED_EVENT, update);
    return () => window.removeEventListener(WALLET_CHANGED_EVENT, update);
  }, []);

  // Restored post-mount, so the server render and the first client render
  // agree on the empty draft and there is no hydration flash.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(AD_DRAFT_KEY);
      if (saved) {
        setDraft(parseDraft(saved));
        setResumed(true);
      }
    } catch {
      /* localStorage unavailable, or a draft this build cannot read */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(AD_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* localStorage unavailable */
    }
  }, [draft, loaded]);

  function patch(p: Partial<AdDraft>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  function discard() {
    setDraft(EMPTY_AD_DRAFT);
    setResumed(false);
    try {
      localStorage.removeItem(AD_DRAFT_KEY);
    } catch {
      /* localStorage unavailable */
    }
  }

  const { step } = draft;

  /**
   * The node's row for the selected mint.
   *
   * Resolved on every render rather than stored in the draft, deliberately.
   * A precision copied into localStorage last week is a precision that
   * survives the node changing its mind about a mint, and every amount on
   * the record is scaled by it — a stale `6` against a nine-decimal token
   * publishes limits a thousand times too small.
   */
  const asset: AssetOption | null = useMemo(() => {
    if (reference.status !== "ready" || !draft.mint) return null;
    return assetOptions(reference.data).find((option) => option.mint === draft.mint) ?? null;
  }, [reference, draft.mint]);

  /*
   * What to call the chosen token on this screen. The node's own spelling
   * everywhere except the native mint, which reads `SOL` because that is
   * what a merchant funds the vault with — see `lib/asset-display.ts`.
   * `asset.symbol` stays the matching identity and is what `PricePosition`
   * compares the live book on.
   */
  const assetName = asset ? (tradingSymbol(asset.mint, asset.symbol) ?? asset.symbol) : null;

  const merchantPeerId = useMemo(() => {
    if (!wallet) return null;
    try {
      return peerIdForPublicKey(bs58.decode(wallet.address));
    } catch {
      return null;
    }
  }, [wallet]);

  const problems = stepProblems(draft, asset);

  /*
   * The vault-backing check, against the merchant's real `LiquidityVault`.
   *
   * It blocks only on evidence of a shortfall — a vault that exists and
   * holds less than the total on offer, or no vault at all, both of which
   * the chain asserted. `loading`, `error` and `unkeyed` are not findings
   * about anybody's balance and never read as one: an unreachable RPC
   * saying "insufficient" would be a lie in the direction that costs a
   * merchant a trade.
   */
  const backing = useVaultBacking(wallet?.address ?? null, draft.mint || null);
  const cover = backing.kind === "found" ? vaultCovers(backing.vault, draft.totalAmount) : null;
  const total = Number(draft.totalAmount) || 0;
  const backingProblems: AdProblem[] =
    total <= 0
      ? []
      : backing.kind === "none"
        ? [{ key: "backingNoVault" }]
        : cover !== null && !cover.covered
          ? [
              {
                key: "backingShort",
                values: {
                  available: formatBaseUnits(cover.available, backing.kind === "found" ? backing.vault.decimals : 0),
                  total: formatNumber(total),
                },
              },
            ]
          : [];

  const stepErrors: Record<number, AdProblem[]> = {
    ...problems,
    3: [...problems[3]!, ...backingProblems],
  };
  const stepDone = (n: number) => (stepErrors[n] ?? []).length === 0;

  /**
   * Signs the advertisement and submits it.
   *
   * Every amount is base units plus the node's decimals for this mint. The
   * price carries its own precision — the one the merchant typed for a fixed
   * price, the one they declared for a floating one — because a fiat price
   * and an asset amount are scaled by different things and sharing a
   * `decimals` between them would misprice one of the two.
   */
  async function publish() {
    const signer = currentSigner(wallet);
    if (!wallet || !signer) {
      setPublishError(t("publishNoWallet"));
      return;
    }
    if (!asset) {
      setPublishError(t("publishNoAsset"));
      return;
    }
    setPublishing(true);
    setPublishError(null);
    try {
      const id = await publishAdvertisement(
        { provider: signer, publicKey: bs58.decode(wallet.address) },
        {
          assetMint: asset.mint,
          direction: draft.direction,
          fiatCurrency: draft.fiat,
          minTrade: Number(draft.minOrder),
          maxTrade: Number(draft.maxOrder),
          initialLiquidity: total,
          decimals: asset.decimals,
          pricing:
            draft.pricingType === "Fixed"
              ? { Fixed: { price: toWireAmount(Number(draft.price), priceDecimalsFor(draft)) } }
              : {
                  Floating: {
                    // "any", like every record the protocol crate itself
                    // builds. The field is a merchant's declared preference
                    // and the resolver does not read it — it takes the
                    // median of every current record for the pair. A
                    // provider picker here would be a control that changes
                    // nothing.
                    oracle_provider: "any",
                    premium_bps: Math.round(Number(draft.premium) * 100),
                    price_decimals: priceDecimalsFor(draft),
                  },
                },
          paymentMethods: draft.methods,
        },
      );
      localStorage.removeItem(AD_DRAFT_KEY);
      setPublished(id);
    } catch (err) {
      setPublishError(explainRefusal(err));
    } finally {
      setPublishing(false);
    }
  }

  if (published) {
    return (
      <div className="border-y border-white/5 py-14 text-center">
        <p className="text-2xl text-emerald-400">✓</p>
        <h2 className="mt-3 text-lg font-semibold text-white">{t("posted")}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-gray-400">
          {t("postedSummary", {
            direction: L(draft.direction),
            asset: assetName ?? t("yourToken"),
            fiat: draft.fiat,
            price:
              draft.pricingType === "Fixed"
                ? t("fixedPrice", { price: draft.price })
                : t("floating", { sign: Number(draft.premium) >= 0 ? "+" : "", pct: draft.premium }),
            range: `${formatNumber(Number(draft.minOrder))}–${formatNumber(Number(draft.maxOrder))} ${assetName ?? ""}`.trim(),
          })}
        </p>
        <p className="mx-auto mt-3 max-w-md font-mono text-xs text-gray-500">{published}</p>
        <p className="mx-auto mt-2 max-w-md text-xs text-gray-500">
          {t("postedNote")}
        </p>
        <Link
          href="/ads"
          className="mt-6 inline-block rounded-md bg-brand px-6 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
        >
          {t("goToMyAds")}
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Step rail */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-white/5 pb-5">
        <ol className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {AD_STEPS.map((label, i) => {
            const n = i + 1;
            const done = n < step && stepDone(n);
            const current = n === step;
            return (
              <li key={label} className="flex items-center gap-2" data-step={label}>
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold ${
                    done
                      ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-300"
                      : current
                        ? "border-brand bg-brand/20 text-brand-hover"
                        : "border-white/15 text-gray-600"
                  }`}
                >
                  {done ? "✓" : n}
                </span>
                <span className={`text-sm ${current ? "font-medium text-white" : "text-gray-500"}`}>
                  {t(`step.${i}`)}
                </span>
              </li>
            );
          })}
        </ol>
        {resumed && (
          <span className="ml-auto flex items-center gap-2 text-xs text-amber-300">
            {t("draftRestored")}
            <button onClick={discard} className="text-gray-400 underline hover:text-white">
              {t("discardDraft")}
            </button>
          </span>
        )}
      </div>

      <div className="py-8">
        {step === 1 && (
          <div className="space-y-8">
            <div>
              <p className={labelCls}>{t("iWantTo")}</p>
              {/* Stacked on a phone. These two carry a label and a line of
                  explanation each, and side by side at 375px the
                  explanation wraps to four lines and the buttons stop
                  reading as a pair of choices. */}
              <div className="grid max-w-md grid-cols-1 gap-3 sm:grid-cols-2">
                {(["Sell", "Buy"] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => patch({ direction: d })}
                    aria-pressed={draft.direction === d}
                    className={`rounded-md border px-4 py-3 text-left text-sm transition-colors ${
                      draft.direction === d
                        ? "border-brand/50 bg-brand/10 text-white"
                        : "border-white/10 text-gray-400 hover:text-white"
                    }`}
                  >
                    <span
                      className={`font-semibold ${d === "Sell" ? "text-orange-400" : "text-emerald-400"}`}
                    >
                      {L(d)}
                    </span>
                    <span className="mt-0.5 block text-xs text-gray-500">
                      {d === "Sell" ? t("sellExplain") : t("buyExplain")}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className={labelCls}>{t("asset")}</p>
              <AssetPicker
                value={draft.mint}
                onChange={(option) => patch({ mint: option.mint })}
                walletAddress={wallet?.address ?? null}
              />
            </div>
            <div>
              <p className={labelCls}>{t("fiatCurrency")}</p>
              <CurrencyCombobox value={draft.fiat} onChange={(code) => patch({ fiat: code })} />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="max-w-xl space-y-6">
            <div>
              <p className={labelCls}>{t("priceType")}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {(["Fixed", "Floating"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => patch({ pricingType: p })}
                    aria-pressed={draft.pricingType === p}
                    className={`rounded-md border px-4 py-3 text-left text-sm transition-colors ${
                      draft.pricingType === p
                        ? "border-brand/50 bg-brand/10 text-white"
                        : "border-white/10 text-gray-400 hover:text-white"
                    }`}
                  >
                    <span className="font-medium">{p === "Fixed" ? t("fixed") : t("floatingLabel")}</span>
                    <span className="mt-0.5 block text-xs text-gray-500">
                      {p === "Fixed" ? t("fixedExplain") : t("floatingExplain")}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {draft.pricingType === "Fixed" ? (
              <div>
                <label className={labelCls} htmlFor="ad-price">
                  {t("priceLabel", { fiat: draft.fiat || t("fiatWord"), asset: assetName ?? t("unitWord") })}
                </label>
                <input
                  id="ad-price"
                  value={draft.price}
                  onChange={(e) => patch({ price: e.target.value })}
                  inputMode="decimal"
                  className={inputCls}
                />
                <p className="mt-1.5 text-[11px] text-gray-600">
                  {t("fixedPriceNote", { count: priceDecimalsFor(draft) })}
                </p>
              </div>
            ) : (
              <>
                <div>
                  <label className={labelCls} htmlFor="ad-premium">
                    {t("priceMargin", { limit: PREMIUM_LIMIT_PCT })}
                  </label>
                  <input
                    id="ad-premium"
                    value={draft.premium}
                    onChange={(e) => patch({ premium: e.target.value })}
                    inputMode="decimal"
                    className={inputCls}
                  />
                  <p className="mt-1.5 text-[11px] text-gray-600">
                    {t("premiumNote")}
                  </p>
                </div>
                <div>
                  <label className={labelCls} htmlFor="ad-price-decimals">
                    {t("priceDecimalsLabel", { fiat: draft.fiat || t("thisCurrency") })}
                  </label>
                  <input
                    id="ad-price-decimals"
                    value={draft.priceDecimals}
                    onChange={(e) => patch({ priceDecimals: e.target.value })}
                    type="number"
                    min={0}
                    max={12}
                    className={inputCls}
                  />
                  <p className="mt-1.5 text-[11px] leading-relaxed text-gray-600">
                    {t("priceDecimalsNote")}
                  </p>
                </div>
              </>
            )}

            {/* Bybit shows an estimated ranking as a price is typed. We have
                the whole book over one call, so this is a count rather than
                an estimate — and it says so when it could not read it. */}
            <div className="border-l-2 border-white/10 pl-3">
              <PricePosition
                assetSymbol={asset?.symbol ?? null}
                assetLabel={assetName}
                fiat={draft.fiat}
                direction={draft.direction}
                pricingType={draft.pricingType}
                price={Number(draft.price) || 0}
                premium={Number(draft.premium) || 0}
              />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="max-w-xl space-y-6">
            <div>
              <div className="flex items-center justify-between">
                <label className={labelCls} htmlFor="ad-total">
                  {t("totalAmount", { asset: assetName ?? t("assetWord") })}
                </label>
                <VaultBackingStatus backing={backing} amount={draft.totalAmount} />
              </div>
              <input
                id="ad-total"
                value={draft.totalAmount}
                onChange={(e) => patch({ totalAmount: e.target.value })}
                inputMode="decimal"
                className={inputCls}
              />
              <p className="mt-1.5 text-[11px] leading-relaxed text-gray-600">
                {t.rich("totalNote", {
                  avail: (chunks) => <span className="text-gray-500">{chunks}</span>,
                  vaults: (chunks) => (
                    <Link href="/wallet" className="text-gray-400 underline hover:text-white">
                      {chunks}
                    </Link>
                  ),
                })}
              </p>
            </div>
            {/* Minimum and maximum, one above the other on a phone — same
                reason as the pair in `ad-controls.tsx`. */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls} htmlFor="ad-min">
                  {t("minOrder", { asset: assetName ?? t("assetWord") })}
                </label>
                <input
                  id="ad-min"
                  value={draft.minOrder}
                  onChange={(e) => patch({ minOrder: e.target.value })}
                  inputMode="decimal"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="ad-max">
                  {t("maxOrder", { asset: assetName ?? t("assetWord") })}
                </label>
                <input
                  id="ad-max"
                  value={draft.maxOrder}
                  onChange={(e) => patch({ maxOrder: e.target.value })}
                  inputMode="decimal"
                  className={inputCls}
                />
              </div>
            </div>
            {/* In the asset, not in the fiat. OFS-2100's `min_trade` and
                `max_trade` are `Amount`s denominated in the asset, the same
                unit as the total above — labelling them in fiat would have a
                merchant type a KES figure into a field the protocol reads as
                USDC. */}
            <p className="text-[11px] leading-relaxed text-gray-600">
              {t("threeInAsset", { asset: assetName ?? t("theAsset"), fiat: draft.fiat || t("fiatWord") })}
            </p>
          </div>
        )}

        {step === 4 && (
          <div className="max-w-xl space-y-6">
            <div>
              <label className={labelCls} htmlFor="ad-country">
                {t("whereSettle")}
              </label>
              <CountrySelect
                id="ad-country"
                value={draft.country}
                onChange={(code) => patch({ country: code })}
                countries={reference.status === "ready" ? reference.data.countries : []}
                className={inputCls}
                placeholder={t("anyCountry")}
              />
              <p className="mt-1.5 text-[11px] leading-relaxed text-gray-600">
                {t("countryNote")}
              </p>
            </div>
            <div>
              <p className={labelCls}>
                {t("methodsLabel", { max: MAX_PAYMENT_METHODS })}
              </p>
              <MethodPicker
                selected={draft.methods}
                onChange={(m) => patch({ methods: m })}
                country={draft.country || null}
                merchant={merchantPeerId}
              />
            </div>
            {/*
              * Binance's next field here is a payment time limit, and it is
              * not collected because there is nowhere to put it: a
              * reservation's `expires_at` is set by the node, and
              * `AdvertisementCreate` carries no window. A dropdown offering
              * 15/30/60 minutes would be a control that changes nothing,
              * which is what the old "minimum counterparty reputation"
              * selector on this wizard was.
              */}
            <p className="border-l-2 border-white/10 pl-3 text-[11px] leading-relaxed text-gray-500">
              {t("noTimeLimit")}
            </p>
          </div>
        )}

        {step === 5 && (
          <div className="max-w-xl">
            <dl className="divide-y divide-white/5 border-y border-white/5">
              {[
                [
                  t("reviewAdType"),
                  draft.direction === "Sell" ? t("reviewSell") : t("reviewBuy"),
                ],
                [t("asset"), asset ? t("reviewAssetVal", { asset: assetName ?? "", decimals: asset.decimals }) : "—"],
                // In full, not shortened: this is the last screen before a
                // merchant commits, and the address is the only thing that
                // says which token they will actually be paid in.
                [t("reviewMint"), draft.mint],
                [t("fiatCurrency"), draft.fiat],
                [
                  t("colPrice"),
                  draft.pricingType === "Fixed"
                    ? t("reviewFixed", { price: draft.price, fiat: draft.fiat })
                    : t("reviewFloating", { sign: Number(draft.premium) >= 0 ? "+" : "", pct: draft.premium }),
                ],
                [
                  t("reviewTotal"),
                  `${formatNumber(total)} ${assetName ?? ""}`.trim(),
                ],
                [
                  t("reviewLimits"),
                  `${formatNumber(Number(draft.minOrder))} – ${formatNumber(Number(draft.maxOrder))} ${assetName ?? ""}`.trim(),
                ],
                [t("paymentMethods"), draft.methods.join(" · ")],
              ].map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-4 py-3 text-sm">
                  <dt className="shrink-0 text-gray-500">{label}</dt>
                  {/* `break-all` because a base58 address has no break
                      opportunity of its own and would otherwise push the row
                      past the column rather than wrap inside it. */}
                  <dd className="break-all text-right text-gray-200">{value}</dd>
                </div>
              ))}
            </dl>
            {/*
              * What this screen does not check, said once and plainly. It
              * used to assert "5,000 OPEN (already bonded)" — a number
              * nothing had read, which also disagreed with the app's own
              * stale merchant minimum.
              */}
            <p className="mt-4 border-l-2 border-amber-400/60 bg-amber-400/5 px-4 py-3 text-sm leading-relaxed text-amber-200">
              {t.rich("bondNote", {
                link: (chunks) => (
                  <Link href="/become-a-merchant" className="font-medium text-amber-100 underline">
                    {chunks}
                  </Link>
                ),
              })}{" "}
              {backingProblems.length === 0 ? t("backingChecked") : t("backingShortStep")}
            </p>
          </div>
        )}

        {(stepErrors[step] ?? []).length > 0 && (
          <ul className="mt-4 max-w-xl space-y-1.5">
            {stepErrors[step]!.map((err) => (
              <li
                key={err.key}
                className="border-l-2 border-amber-400/50 bg-amber-400/5 px-3 py-1.5 text-xs text-amber-200"
              >
                {t(`problem.${err.key}`, err.values)}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-white/5 pt-6">
        {step > 1 && (
          <button
            onClick={() => patch({ step: step - 1 })}
            className="rounded-md border border-white/15 px-5 py-2 text-sm text-gray-300 hover:bg-white/5"
          >
            {t("back")}
          </button>
        )}
        {step < AD_STEPS.length ? (
          <button
            onClick={() => stepDone(step) && patch({ step: step + 1 })}
            disabled={!stepDone(step)}
            className="rounded-md bg-brand px-6 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("continue")}
          </button>
        ) : (
          <button
            onClick={() => void publish()}
            disabled={!completeThrough(stepErrors, AD_STEPS.length) || publishing || !wallet}
            className="rounded-md bg-emerald-600 px-6 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {publishing ? t("signing") : t("confirmToPost")}
          </button>
        )}
        {publishError ? (
          <p className="text-[11px] text-red-300">{publishError}</p>
        ) : (
          <p className="text-[11px] text-gray-600">
            {wallet ? t("postingNote") : t("connectToPost")}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * What the vault lookup found, next to the total-amount field.
 *
 * Five outcomes, five sentences. The two that mean "you are advertising more
 * than you hold" are red and block the step; the three that mean "no
 * finding" are grey and block nothing. Nothing here renders an unanswered
 * lookup as a shortfall — see `useVaultBacking`.
 */
function VaultBackingStatus({ backing, amount }: { backing: VaultBacking; amount: string }) {
  const t = useTranslations("ads");
  const base = "text-xs";
  switch (backing.kind) {
    case "unkeyed":
      return <span className={`${base} text-gray-500`}>{t("backingUnkeyed")}</span>;
    case "loading":
      return <span className={`${base} text-gray-500`}>{t("backingLoading")}</span>;
    case "error":
      return (
        <span className={`${base} text-amber-300/80`} title={backing.message}>
          {t("backingError")}
        </span>
      );
    case "none":
      return <span className={`${base} text-red-300`}>{t("backingNone")}</span>;
    case "found": {
      const cover = vaultCovers(backing.vault, amount);
      const available = formatBaseUnits(backing.vault.available, backing.vault.decimals);
      if (cover === null) {
        // The typed amount has more precision than the mint has decimals, so
        // there is no quantity to compare yet.
        return <span className={`${base} text-gray-500`}>{t("backingAvailable", { available })}</span>;
      }
      return cover.covered ? (
        <span className={`${base} text-emerald-400`}>{t("backingBacked", { available })}</span>
      ) : (
        <span className={`${base} text-red-300`}>{t("backingOnly", { available })}</span>
      );
    }
  }
}
