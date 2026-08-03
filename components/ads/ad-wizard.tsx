"use client";

import Link from "next/link";
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
} from "@/lib/ad-draft";
import { assetOptions, useReferenceData, type AssetOption } from "@/lib/reference";
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
  const backingProblems =
    total <= 0
      ? []
      : backing.kind === "none"
        ? [
            "This wallet has no liquidity vault for that token, so nothing backs this advertisement — every reservation against it would fail. Open one from Wallet → Deposit first.",
          ]
        : cover !== null && !cover.covered
          ? [
              `Your vault holds ${formatBaseUnits(cover.available, backing.kind === "found" ? backing.vault.decimals : 0)} available, less than the ${formatNumber(total)} on offer here.`,
            ]
          : [];

  const stepErrors: Record<number, string[]> = {
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
      setPublishError("Connect a wallet before publishing — it is what signs the advertisement.");
      return;
    }
    if (!asset) {
      setPublishError(
        "The token's precision comes from your node's mint table, and that answer is not in hand. Reload once the node is reachable.",
      );
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
      setPublishError(explainRefusal(err instanceof Error ? err.message : String(err)));
    } finally {
      setPublishing(false);
    }
  }

  if (published) {
    return (
      <div className="border-y border-white/5 py-14 text-center">
        <p className="text-2xl text-emerald-400">✓</p>
        <h2 className="mt-3 text-lg font-semibold text-white">Advertisement posted</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-gray-400">
          {draft.direction} {asset?.symbol ?? "your token"} for {draft.fiat} ·{" "}
          {draft.pricingType === "Fixed"
            ? `Fixed ${draft.price}`
            : `Floating ${Number(draft.premium) >= 0 ? "+" : ""}${draft.premium}%`}{" "}
          · orders {formatNumber(Number(draft.minOrder))}–{formatNumber(Number(draft.maxOrder))}{" "}
          {asset?.symbol ?? ""}.
        </p>
        <p className="mx-auto mt-3 max-w-md font-mono text-xs text-gray-500">{published}</p>
        <p className="mx-auto mt-2 max-w-md text-xs text-gray-500">
          Signed by your wallet and accepted by the node, which gossips it to the rest of the
          network. Edit it, pause it or take it down from My Ads.
        </p>
        <Link
          href="/ads"
          className="mt-6 inline-block rounded-md bg-brand px-6 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
        >
          Go to My Ads
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
              <li key={label} className="flex items-center gap-2">
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
                  {label}
                </span>
              </li>
            );
          })}
        </ol>
        {resumed && (
          <span className="ml-auto flex items-center gap-2 text-xs text-amber-300">
            Draft restored
            <button onClick={discard} className="text-gray-400 underline hover:text-white">
              Discard draft
            </button>
          </span>
        )}
      </div>

      <div className="py-8">
        {step === 1 && (
          <div className="space-y-8">
            <div>
              <p className={labelCls}>I want to</p>
              <div className="grid max-w-md grid-cols-2 gap-3">
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
                      {d}
                    </span>
                    <span className="mt-0.5 block text-xs text-gray-500">
                      {d === "Sell" ? "You sell crypto for fiat" : "You buy crypto with fiat"}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className={labelCls}>Asset</p>
              <AssetPicker
                value={draft.mint}
                onChange={(option) => patch({ mint: option.mint })}
                walletAddress={wallet?.address ?? null}
              />
            </div>
            <div>
              <p className={labelCls}>Fiat currency</p>
              <CurrencyCombobox value={draft.fiat} onChange={(code) => patch({ fiat: code })} />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="max-w-xl space-y-6">
            <div>
              <p className={labelCls}>Price type</p>
              <div className="grid grid-cols-2 gap-3">
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
                    <span className="font-medium">{p}</span>
                    <span className="mt-0.5 block text-xs text-gray-500">
                      {p === "Fixed"
                        ? "One price, until you change it"
                        : "Tracks the oracle mid, refreshed continuously"}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {draft.pricingType === "Fixed" ? (
              <div>
                <label className={labelCls} htmlFor="ad-price">
                  Price — {draft.fiat || "fiat"} per {asset?.symbol ?? "unit"}
                </label>
                <input
                  id="ad-price"
                  value={draft.price}
                  onChange={(e) => patch({ price: e.target.value })}
                  inputMode="decimal"
                  className={inputCls}
                />
                <p className="mt-1.5 text-[11px] text-gray-600">
                  Signed at exactly the precision you type: {priceDecimalsFor(draft)} decimal
                  place{priceDecimalsFor(draft) === 1 ? "" : "s"}. A fixed price does not move
                  until you edit it from My Ads.
                </p>
              </div>
            ) : (
              <>
                <div>
                  <label className={labelCls} htmlFor="ad-premium">
                    Price margin (%, −{PREMIUM_LIMIT_PCT} to +{PREMIUM_LIMIT_PCT})
                  </label>
                  <input
                    id="ad-premium"
                    value={draft.premium}
                    onChange={(e) => patch({ premium: e.target.value })}
                    inputMode="decimal"
                    className={inputCls}
                  />
                  <p className="mt-1.5 text-[11px] text-gray-600">
                    Applied over the median of every current oracle record for this pair. 0 tracks
                    the mid exactly.
                  </p>
                </div>
                <div>
                  <label className={labelCls} htmlFor="ad-price-decimals">
                    Price decimals for {draft.fiat || "this currency"}
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
                    How many places the resolved price is quoted to — 2 for most currencies, 0 for
                    ones with no subunit in daily use. Asked rather than inferred: a floating ad
                    carries no typed price to take it from, and a currency-to-decimals table here
                    would mis-round every currency missing from it.
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
                  Total trading amount ({asset?.symbol ?? "asset"})
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
                Checked against your on-chain liquidity vault for this mint, against its{" "}
                <span className="text-gray-500">available</span> balance — the only figure a
                reservation can draw on. A vault&rsquo;s lifetime total includes tokens that have
                already settled and left.{" "}
                <Link href="/wallet" className="text-gray-400 underline hover:text-white">
                  Your vaults
                </Link>{" "}
                are on the Wallet page.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls} htmlFor="ad-min">
                  Minimum order ({asset?.symbol ?? "asset"})
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
                  Maximum order ({asset?.symbol ?? "asset"})
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
              All three are in {asset?.symbol ?? "the asset"}, not in {draft.fiat || "fiat"} — that
              is the unit the record carries them in.
            </p>
          </div>
        )}

        {step === 4 && (
          <div className="max-w-xl space-y-6">
            <div>
              <label className={labelCls} htmlFor="ad-country">
                Where you settle fiat
              </label>
              <CountrySelect
                id="ad-country"
                value={draft.country}
                onChange={(code) => patch({ country: code })}
                countries={reference.status === "ready" ? reference.data.countries : []}
                className={inputCls}
                placeholder="Any country — show every rail"
              />
              <p className="mt-1.5 text-[11px] leading-relaxed text-gray-600">
                Only used to order the suggestions below: your node knows which rails that country
                actually uses. It is not part of the advertisement — the record carries payment
                methods and a currency, and no country.
              </p>
            </div>
            <div>
              <p className={labelCls}>
                Payment methods buyers can pay you with (up to {MAX_PAYMENT_METHODS})
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
              There is no payment-time-limit setting here. On Binance a merchant picks one; on this
              protocol the payment window belongs to the reservation and is set by the node, so an
              advertisement has no field for it and this screen does not pretend to offer one.
            </p>
          </div>
        )}

        {step === 5 && (
          <div className="max-w-xl">
            <dl className="divide-y divide-white/5 border-y border-white/5">
              {[
                [
                  "Ad type",
                  draft.direction === "Sell"
                    ? "Sell — you sell crypto for fiat"
                    : "Buy — you buy crypto with fiat",
                ],
                ["Asset", asset ? `${asset.symbol} · ${asset.decimals} decimals` : "—"],
                // In full, not shortened: this is the last screen before a
                // merchant commits, and the address is the only thing that
                // says which token they will actually be paid in.
                ["Mint", draft.mint],
                ["Fiat currency", draft.fiat],
                [
                  "Price",
                  draft.pricingType === "Fixed"
                    ? `Fixed — ${draft.price} ${draft.fiat}`
                    : `Floating — oracle mid ${Number(draft.premium) >= 0 ? "+" : ""}${draft.premium}%`,
                ],
                [
                  "Total on offer",
                  `${formatNumber(total)} ${asset?.symbol ?? ""}`.trim(),
                ],
                [
                  "Order limits",
                  `${formatNumber(Number(draft.minOrder))} – ${formatNumber(Number(draft.maxOrder))} ${asset?.symbol ?? ""}`.trim(),
                ],
                ["Payment methods", draft.methods.join(" · ")],
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
              This screen does not read your merchant bond, so it cannot tell you whether the node
              will accept this. Check where you stand on{" "}
              <Link href="/become-a-merchant" className="font-medium text-amber-100 underline">
                Become a merchant
              </Link>
              . Your vault backing for this token{" "}
              {backingProblems.length === 0 ? "was checked on the previous step" : "is short — see step 3"}.
            </p>
          </div>
        )}

        {(stepErrors[step] ?? []).length > 0 && (
          <ul className="mt-4 max-w-xl space-y-1.5">
            {stepErrors[step]!.map((err) => (
              <li
                key={err}
                className="border-l-2 border-amber-400/50 bg-amber-400/5 px-3 py-1.5 text-xs text-amber-200"
              >
                {err}
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
            ← Back
          </button>
        )}
        {step < AD_STEPS.length ? (
          <button
            onClick={() => stepDone(step) && patch({ step: step + 1 })}
            disabled={!stepDone(step)}
            className="rounded-md bg-brand px-6 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            Continue →
          </button>
        ) : (
          <button
            onClick={() => void publish()}
            disabled={!completeThrough(stepErrors, AD_STEPS.length) || publishing || !wallet}
            className="rounded-md bg-emerald-600 px-6 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {publishing ? "Signing…" : "Confirm to post"}
          </button>
        )}
        {publishError ? (
          <p className="text-[11px] text-red-300">{publishError}</p>
        ) : (
          <p className="text-[11px] text-gray-600">
            {wallet
              ? "Posting costs one wallet signature. Everything above is local until then."
              : "Connect a wallet to post — it is what signs the advertisement."}
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
  const base = "text-xs";
  switch (backing.kind) {
    case "unkeyed":
      return (
        <span className={`${base} text-gray-500`}>Connect a wallet and pick an asset to check backing</span>
      );
    case "loading":
      return <span className={`${base} text-gray-500`}>Checking your vault…</span>;
    case "error":
      return (
        <span className={`${base} text-amber-300/80`} title={backing.message}>
          Could not reach the cluster — backing unverified, not unbacked
        </span>
      );
    case "none":
      return <span className={`${base} text-red-300`}>No vault for this token on this wallet</span>;
    case "found": {
      const cover = vaultCovers(backing.vault, amount);
      const available = formatBaseUnits(backing.vault.available, backing.vault.decimals);
      if (cover === null) {
        // The typed amount has more precision than the mint has decimals, so
        // there is no quantity to compare yet.
        return <span className={`${base} text-gray-500`}>{available} available in your vault</span>;
      }
      return cover.covered ? (
        <span className={`${base} text-emerald-400`}>Backed — {available} available</span>
      ) : (
        <span className={`${base} text-red-300`}>Only {available} available in your vault</span>
      );
    }
  }
}
