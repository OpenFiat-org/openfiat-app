"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import bs58 from "bs58";
import { formatNumber, shortAddress } from "@/lib/format";
import { DEVNET_SETTLEMENT_MINT } from "@/lib/onchain-config";
import { formatBaseUnits } from "@/lib/live-vaults";
import { WALLET_CHANGED_EVENT, readWalletConnection, type WalletConnection } from "@/lib/wallet-connection";
import { useVaultBacking, vaultCovers, type VaultBacking } from "@/components/wallet/use-vault-backing";
import { currentSigner } from "@/lib/wallet-connection";
import { explainRefusal, publishAdvertisement, toWireAmount } from "@/lib/merchant-ads";
import { CurrencyCombobox } from "@/components/p2p/currency-combobox";
import { MethodPicker } from "@/components/ads/method-picker";

/**
 * Whether `value` could be a mint at all: base58 decoding to exactly 32
 * bytes, which is the same thing the node checks before it will accept an
 * advertisement.
 *
 * It deliberately does not check membership of any list. The settlement
 * allowlist lives on chain and governance can change it, so a client
 * refusing an address for being absent from a list compiled last month would
 * block a trade the protocol allows. Enforcement belongs where the funds
 * move; this only catches a typo before it becomes a signature.
 */
function isMintAddress(value: string): boolean {
  try {
    return bs58.decode(value.trim()).length === 32;
  } catch {
    return false;
  }
}

const DRAFT_KEY = "openfiat:ad-draft";
const STEPS = ["Market", "Pricing", "Limits", "Payment methods", "Review"] as const;

interface Draft {
  step: number;
  direction: "Buy" | "Sell";
  /**
   * The mint the merchant will be paid in.
   *
   * This was a ticker off a fixed list, and an advertisement no longer has
   * anywhere to put one: OFS-2100 carries `asset_mint` and no asset name,
   * because a ticker on a record is a label its author chose and is tied to
   * the token the escrow moves by nothing at all. What a buyer reads is
   * resolved from this address by the node that serves them, so this screen
   * chooses an identity and never a name.
   */
  mint: string;
  fiat: string;
  /**
   * The precision a floating price is quoted in — the fiat currency's, so
   * 2 for KES/NGN/USD and 0 for JPY.
   *
   * Declared by the merchant because nothing else on the record carries
   * it: the limits are in the asset, and a floating advertisement has no
   * fixed price to borrow the precision from. Inferring it from the
   * currency code would mean shipping a currency table that silently
   * mis-rounds every currency missing from it.
   */
  priceDecimals: string;
  pricingType: "Fixed" | "Floating";
  price: string;
  premium: string;
  min: string;
  max: string;
  minRep: string;
  liquidity: string;
  methods: string[];
}

const DEFAULT_DRAFT: Draft = {
  step: 1,
  direction: "Sell",
  mint: DEVNET_SETTLEMENT_MINT,
  fiat: "KES",
  priceDecimals: "2",
  pricingType: "Floating",
  price: "132.00",
  premium: "0.8",
  // In the token, like `liquidity` — these were 5,000 and 250,000, which
  // are KES figures against a 10,000-unit vault: a starting draft that
  // offered to sell twenty-five times what it held.
  min: "10",
  max: "5000",
  minRep: "",
  liquidity: "10000",
  methods: ["M-Pesa Kenya (Safaricom)"],
};

const inputCls =
  "w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm tabular-nums text-white outline-none focus:border-brand/50 [&>option]:bg-[#10151d]";
const labelCls = "mb-1 block text-xs text-gray-500";

/**
 * Binance-style multi-step post-advertisement wizard. Flat (no boxed panel),
 * per-step validation, OPEN-bond gating, and draft persistence to
 * localStorage["openfiat:ad-draft"].
 *
 * Publishing is real. It used to end at a green tick reading
 * "Advertisement published (simulated)" — the draft was cleared and
 * nothing was ever sent, so the first step of the merchant journey was
 * the one thing in it that could not fail. It now signs an
 * `AdvertisementCreate` with the connected wallet and submits it to the
 * selected node; the id in the confirmation is the id the network has.
 */
export function AdWizard() {
  const [draft, setDraft] = useState<Draft>(DEFAULT_DRAFT);
  const [loaded, setLoaded] = useState(false);
  const [resumed, setResumed] = useState(false);
  const [published, setPublished] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [wallet, setWallet] = useState<WalletConnection | null>(null);

  // The merchant half of the vault key. Read post-mount and kept in sync,
  // the same way `components/wallet/vaults-panel.tsx` does it.
  useEffect(() => {
    const update = () => setWallet(readWalletConnection());
    update();
    window.addEventListener(WALLET_CHANGED_EVENT, update);
    return () => window.removeEventListener(WALLET_CHANGED_EVENT, update);
  }, []);

  // Restore draft on mount (SSR renders the default step 1 — no hydration flash).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        setDraft({ ...DEFAULT_DRAFT, ...(JSON.parse(saved) as Draft) });
        setResumed(true);
      }
    } catch {
      /* localStorage unavailable */
    }
    setLoaded(true);
  }, []);

  // Persist on every change.
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* localStorage unavailable */
    }
  }, [draft, loaded]);

  function patch(p: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  function discard() {
    setDraft(DEFAULT_DRAFT);
    setResumed(false);
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* localStorage unavailable */
    }
  }

  const { step, direction, mint, fiat, priceDecimals, pricingType, price, premium, min, max, minRep, liquidity, methods } = draft;

  /*
   * There is no indicative price on this screen any more.
   *
   * It was `fxPerUsd(fiat)` — the fiat's rate against the US dollar — shown
   * as what the chosen asset would fetch. That only worked because the
   * ticker was doing the arithmetic silently: "USDT" was read as a promise
   * that one unit is one dollar. A mint address makes no such promise, and
   * this app has no way to learn it from one. Every rate on this network is
   * published by an oracle against a symbol the node resolves, which is a
   * read this wizard does not make.
   *
   * So the number is gone rather than kept with an assumption attached. A
   * merchant who wants a reference has the live oracle rates on /network and
   * the real book on the exchange.
   */
  const premiumNum = Number(premium) || 0;
  const mintValid = isMintAddress(mint);

  // Per-step validation
  const minNum = Number(min) || 0;
  const maxNum = Number(max) || 0;
  const liqNum = Number(liquidity) || 0;
  /*
   * The vault-backing check, against the merchant's real `LiquidityVault`.
   *
   * It used to read a `VAULTS` fixture keyed by asset ticker and refuse any
   * advertised liquidity above the figure it found — a gate that looked like
   * a safety check and enforced nothing, because the numbers were invented
   * and identical for every visitor. It was then removed entirely, because
   * a ticker maps to no mint and there was nothing to key a real read on.
   *
   * Both halves of the key exist now: the mint is what this screen collects,
   * and the merchant is the connected wallet. No name is involved in either.
   */
  const backing = useVaultBacking(wallet?.address ?? null, mintValid ? mint.trim() : null);
  const cover = backing.kind === "found" ? vaultCovers(backing.vault, liquidity) : null;

  /*
   * Blocking only on evidence, and only on evidence of a shortfall.
   *
   * `found` with too little available, and `none` (no vault at all, so
   * nothing is available) are both things the chain asserted, and
   * advertising liquidity that is not there is the oversell this gate
   * exists to stop. `loading`, `error` and `unkeyed` are not findings about
   * the merchant's balance and must never read as one — an unreachable RPC
   * saying "insufficient" would be a lie in the direction that costs
   * somebody a trade.
   */
  const backingShortfall =
    liqNum > 0 && (backing.kind === "none" || (cover !== null && !cover.covered));

  const stepValid: Record<number, boolean> = {
    1: mintValid,
    2:
      (pricingType === "Floating" ? premiumNum >= -5 && premiumNum <= 5 : Number(price) > 0) &&
      Number.isInteger(Number(priceDecimals)) &&
      Number(priceDecimals) >= 0 &&
      Number(priceDecimals) <= 12,
    3: minNum > 0 && maxNum >= minNum && liqNum > 0 && !backingShortfall,
    4: methods.length >= 1,
    5: true,
  };
  const stepErrors: Record<number, string[]> = {
    1: mintValid ? [] : ["Enter a mint address: base58, decoding to 32 bytes."],
    2: [
      ...(pricingType === "Floating" && (premiumNum < -5 || premiumNum > 5) ? ["Premium must be between -5% and +5%."] : []),
      ...(pricingType === "Fixed" && !(Number(price) > 0) ? ["Enter a fixed price greater than 0."] : []),
      ...(Number.isInteger(Number(priceDecimals)) &&
      Number(priceDecimals) >= 0 &&
      Number(priceDecimals) <= 12
        ? []
        : ["Price decimals must be a whole number between 0 and 12."]),
    ],
    3: [
      ...(minNum <= 0 ? ["Min trade must be greater than 0."] : []),
      ...(maxNum < minNum ? ["Max trade must be ≥ min trade."] : []),
      ...(liqNum <= 0 ? ["Liquidity must be greater than 0."] : []),
      ...(backing.kind === "none" && liqNum > 0
        ? [`This wallet has no vault for ${shortAddress(mint)}, so nothing backs this advertisement. Open one with a deposit first.`]
        : []),
      ...(cover !== null && !cover.covered
        ? [
            `Your vault has ${formatBaseUnits(cover.available, backing.kind === "found" ? backing.vault.decimals : 0)} available — less than the ${formatNumber(liqNum)} advertised.`,
          ]
        : []),
    ],
    4: methods.length === 0 ? ["Select at least one payment method."] : [],
    5: [],
  };

  /**
   * Signs the advertisement and submits it.
   *
   * The asset's precision comes from the merchant's own vault for this
   * mint, read from the chain — never a default. Every amount on the
   * record is base units plus decimals, so guessing six for a token that
   * uses nine would publish limits a thousand times smaller than the ones
   * on screen, and nothing downstream would notice.
   */
  async function publish() {
    const signer = currentSigner(wallet);
    if (!wallet || !signer) {
      setPublishError("Connect a wallet before publishing — it is what signs the advertisement.");
      return;
    }
    if (backing.kind !== "found") {
      setPublishError(
        "The token's precision comes from your vault for this mint, and that lookup has not answered. Open the vault first.",
      );
      return;
    }
    setPublishing(true);
    setPublishError(null);
    try {
      const id = await publishAdvertisement(
        { provider: signer, publicKey: bs58.decode(wallet.address) },
        {
          assetMint: mint.trim(),
          direction,
          fiatCurrency: fiat,
          minTrade: minNum,
          maxTrade: maxNum,
          initialLiquidity: liqNum,
          decimals: backing.vault.decimals,
          pricing:
            pricingType === "Fixed"
              ? { Fixed: { price: toWireAmount(Number(price), Number(priceDecimals) || 2) } }
              : {
                  Floating: {
                    // "any", like every record the protocol crate itself
                    // builds. The field is a merchant's declared
                    // preference and the resolver does not read it — it
                    // takes the median of every current record for the
                    // pair. A provider picker here would be a control
                    // that changes nothing.
                    oracle_provider: "any",
                    premium_bps: Math.round(premiumNum * 100),
                    price_decimals: Number(priceDecimals) || 2,
                  },
                },
          paymentMethods: methods,
        },
      );
      localStorage.removeItem(DRAFT_KEY);
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
        <h2 className="mt-3 text-lg font-semibold text-white">Advertisement published</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-gray-400">
          {direction} <span className="font-mono">{shortAddress(mint)}</span> for {fiat} · {pricingType === "Fixed" ? `Fixed ${price}` : `Floating ${premiumNum >= 0 ? "+" : ""}${premiumNum}%`} ·
          limits {formatNumber(minNum)}–{formatNumber(maxNum)} <span className="font-mono">{shortAddress(mint)}</span>.
        </p>
        <p className="mx-auto mt-3 max-w-md font-mono text-xs text-gray-500">{published}</p>
        <p className="mx-auto mt-2 max-w-md text-xs text-gray-500">
          Signed by your wallet and accepted by the node, which gossips it to the rest of the
          network. Pause, edit or take it down from My Ads.
        </p>
        <Link href="/ads" className="mt-6 inline-block rounded-md bg-brand px-6 py-2 text-sm font-semibold text-white hover:bg-brand-hover">
          Back to My Ads
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Wizard header: steps + OPEN balance + draft state */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-white/5 pb-5">
        <ol className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {STEPS.map((label, i) => {
            const n = i + 1;
            const done = n < step;
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
                <span className={`text-sm ${current ? "font-medium text-white" : "text-gray-500"}`}>{label}</span>
              </li>
            );
          })}
        </ol>
        <div className="ml-auto flex items-center gap-4">
          {resumed && (
            <span className="flex items-center gap-2 text-xs text-amber-300">
              Draft restored
              <button onClick={discard} className="text-gray-400 underline hover:text-white">
                Discard draft
              </button>
            </span>
          )}
          {/* The real OPEN balance is in the header badge, read from the
              connected wallet's token account. This used to print a constant
              and contradict it. */}
        </div>
      </div>

      {/* Step body — flat sections, hairline dividers, no boxed panel */}
      <div className="py-8">
        {step === 1 && (
          <div className="space-y-8">
            <div>
              <p className={labelCls}>Direction</p>
              <div className="grid max-w-md grid-cols-2 gap-3">
                {(["Sell", "Buy"] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => patch({ direction: d })}
                    className={`rounded-md border px-4 py-3 text-left text-sm transition-colors ${
                      direction === d ? "border-brand/50 bg-brand/10 text-white" : "border-white/10 text-gray-400 hover:text-white"
                    }`}
                  >
                    <span className={`font-semibold ${d === "Sell" ? "text-orange-400" : "text-emerald-400"}`}>{d}</span>
                    <span className="mt-0.5 block text-xs text-gray-500">
                      {d === "Sell" ? "You sell crypto for fiat" : "You buy crypto with fiat"}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls} htmlFor="asset-mint">
                Token you will be paid in
              </label>
              {/*
               * A mint address, typed, not a ticker chosen from a list.
               *
               * The list used to be USDT / USDC / USD1 / SOL, and an
               * advertisement now has nowhere to put any of those words. It
               * carries `asset_mint`, because the token a buyer receives has
               * to be the token the escrow moves, and only an address ties
               * the two together — a ticker is a label the merchant picked.
               *
               * Offering tickers here and mapping them to addresses behind
               * the field would rebuild exactly that gap one screen earlier,
               * with this app choosing the meaning of "USDC" on the
               * merchant's behalf. So the field is the address, and the
               * chips below only fill in mints this app already names
               * elsewhere, each shown with the address it stands for.
               */}
              <input
                id="asset-mint"
                value={mint}
                onChange={(e) => patch({ mint: e.target.value })}
                spellCheck={false}
                autoComplete="off"
                placeholder="Base58 mint address"
                className={`${inputCls} max-w-xl font-mono`}
              />
              {/*
               * One quick-fill, not a menu of the mints this app knows.
               *
               * `KNOWN_DEVNET_MINTS` also contains OPEN, and OPEN is *not* on
               * the escrow settlement allowlist — OFS-4100 holds it back
               * until the public sale. That list exists for the vault screens,
               * where opening a vault in OPEN is a reasonable thing to do.
               * Offering it here would invite a merchant to advertise a token
               * no escrow can pay a buyer in, which is a worse mistake for
               * being made with the protocol's own familiar name.
               */}
              <div className="mt-2">
              <button
                onClick={() => patch({ mint: DEVNET_SETTLEMENT_MINT })}
                className={`rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                  mint.trim() === DEVNET_SETTLEMENT_MINT
                    ? "border-brand/50 bg-brand/10 text-white"
                    : "border-white/10 text-gray-400 hover:text-white"
                }`}
              >
                <span className="block font-medium">Use the devnet settlement stablecoin</span>
                <span className="mt-0.5 block break-all font-mono text-[11px] text-gray-600">
                  {DEVNET_SETTLEMENT_MINT}
                </span>
              </button>
              </div>
              <p className="mt-2 max-w-xl text-[11px] leading-relaxed text-gray-600">
                Any mint is accepted here. What can actually be escrowed is decided by the
                escrow program on chain, which governance can change — so this screen does not
                keep its own copy of that list and does not refuse an address for being absent
                from one. The name a buyer reads is resolved from this address by the node
                serving them; nothing you type here becomes that name.
              </p>
            </div>
            <div>
              <p className={labelCls}>Fiat currency (country / currency)</p>
              <CurrencyCombobox value={fiat} onChange={(code) => patch({ fiat: code })} />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="max-w-xl space-y-6">
            <div>
              <p className={labelCls}>Pricing model</p>
              <div className="grid grid-cols-2 gap-3">
                {(["Floating", "Fixed"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => patch({ pricingType: p })}
                    className={`rounded-md border px-4 py-3 text-left text-sm transition-colors ${
                      pricingType === p ? "border-brand/50 bg-brand/10 text-white" : "border-white/10 text-gray-400 hover:text-white"
                    }`}
                  >
                    <span className="font-medium">{p}</span>
                    <span className="mt-0.5 block text-xs text-gray-500">
                      {p === "Floating" ? "Oracle mid ± your premium" : "One locked price"}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            {pricingType === "Fixed" ? (
              <div>
                <label className={labelCls} title={mint}>
                  Price ({fiat} per unit of {shortAddress(mint)})
                </label>
                <input value={price} onChange={(e) => patch({ price: e.target.value })} type="number" className={inputCls} />
              </div>
            ) : (
              <div>
                <label className={labelCls}>Premium (%, -5 to +5)</label>
                <input value={premium} onChange={(e) => patch({ premium: e.target.value })} type="number" step="0.1" className={inputCls} />
              </div>
            )}
            {/*
              * Asked, not inferred. A floating advertisement carries no
              * fixed price to borrow a precision from, and the limits are
              * in the asset rather than in the fiat — so the record has a
              * field for this and the merchant is the one who fills it.
              * A currency-to-decimals table here would round every
              * currency it had not heard of to whatever the default was.
              */}
            <div>
              <label className={labelCls}>Price decimals for {fiat}</label>
              <input
                value={priceDecimals}
                onChange={(e) => patch({ priceDecimals: e.target.value })}
                type="number"
                min={0}
                max={12}
                className={inputCls}
              />
              <p className="mt-1.5 text-[11px] text-gray-600">
                How many decimal places the resolved price is quoted to. 2 for most currencies,
                0 for ones with no subunit in daily use.
              </p>
            </div>
            {/* No indicative price — see the note where it used to be
                computed. A number here needed the ticker to stand in for "one
                unit is one dollar", and a mint says nothing of the kind. */}
            <p className="max-w-xl text-xs leading-relaxed text-gray-500">
              There is no reference price on this screen. The one that used to be here read a
              fiat/USD table and assumed the token you picked was worth a dollar, which the
              ticker implied and a mint address does not. Live oracle rates are on{" "}
              <Link href="/network" className="text-gray-400 underline hover:text-white">
                Network
              </Link>
              , and what merchants are actually quoting is on the exchange.
            </p>
          </div>
        )}

        {step === 3 && (
          <div className="max-w-xl space-y-6">
            <div className="grid grid-cols-2 gap-4">
              {/* In the token, not in the fiat currency. OFS-2100's
                  `min_trade`/`max_trade` are `Amount`s denominated in the
                  asset, the same unit as the liquidity field below — these
                  labels said `({fiat})` and would have had a merchant type
                  a KES figure into a field the protocol reads as USDC. */}
              <div>
                <label className={labelCls} title={mint}>Min trade ({shortAddress(mint)})</label>
                <input value={min} onChange={(e) => patch({ min: e.target.value })} type="number" className={inputCls} />
              </div>
              <div>
                <label className={labelCls} title={mint}>Max trade ({shortAddress(mint)})</label>
                <input value={max} onChange={(e) => patch({ max: e.target.value })} type="number" className={inputCls} />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className={labelCls} title={mint}>
                  Liquidity ({shortAddress(mint)})
                </label>
                <VaultBackingStatus backing={backing} liquidity={liquidity} />
              </div>
              <input value={liquidity} onChange={(e) => patch({ liquidity: e.target.value })} type="number" className={inputCls} />
              <p className="mt-1.5 text-[11px] text-gray-600">
                Checked against your on-chain liquidity vault for this mint — the merchant half of
                the key is your connected wallet, the mint half is the address above. Compared
                against the vault&rsquo;s <span className="text-gray-500">available</span>{" "}
                balance, which is the only figure a reservation can draw on; a vault&rsquo;s lifetime total
                includes tokens that have already settled and left.{" "}
                <Link href="/wallet" className="text-gray-400 underline hover:text-white">
                  Your vault balances
                </Link>{" "}
                are on the Wallet page.
              </p>
            </div>

            {/* Counterparty floor. Advisory rather than enforced — see the
                field's note in lib/types.ts — so the copy says what it does and
                what it does not do. */}
            <div>
              <label className={labelCls} htmlFor="min-rep">
                Minimum counterparty reputation
              </label>
              <select
                id="min-rep"
                value={minRep}
                onChange={(e) => patch({ minRep: e.target.value })}
                className={inputCls}
              >
                <option value="">Trade with anyone</option>
                <option value="60">60+ — exclude poor records</option>
                <option value="70">70+ — established counterparties</option>
                <option value="80">80+ — strong records only</option>
                <option value="90">90+ — very restrictive</option>
              </select>
              <p className="mt-1.5 text-xs leading-relaxed text-gray-500">
                This client will not let anyone below your floor open an order,
                and tells them why. It is a preference, not a protocol rule —
                nothing on chain enforces it, and a high floor excludes every new
                participant, which costs you volume.
              </p>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="max-w-xl">
            <p className={labelCls}>Payment methods buyers can pay you with</p>
            <MethodPicker selected={methods} onChange={(m) => patch({ methods: m })} />
          </div>
        )}

        {step === 5 && (
          <div className="max-w-xl">
            <dl className="divide-y divide-white/5 border-y border-white/5">
              {[
                ["Direction", direction === "Sell" ? "Sell (you sell crypto)" : "Buy (you buy crypto)"],
                // In full, not shortened: this is the last screen before a
                // merchant commits, and the address is the only thing that
                // says which token they will actually be paid in.
                ["Token (mint)", mint],
                ["Fiat", fiat],
                ["Pricing", pricingType === "Fixed" ? `Fixed ${price} ${fiat}` : `Floating oracle mid ${premiumNum >= 0 ? "+" : ""}${premiumNum}%`],
                // In the token being advertised, like the liquidity below —
                // not in the fiat currency two rows up.
                ["Limits", `${formatNumber(minNum)} – ${formatNumber(maxNum)} ${mint}`],
                ["Liquidity", `${formatNumber(liqNum)} ${mint}`],
                ["Payment methods", methods.join(" · ")],
                ["Merchant bond", "Not verified by this screen"],
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
              * This used to assert "5,000 OPEN (already bonded)" and warn
              * against a hardcoded balance — two invented numbers that also
              * disagreed with `lib/data/staking.ts`'s own merchant minimum.
              * The bond is real and lives in the staking program; this
              * screen does not read it, so it does not claim to.
              */}
            <p className="mt-4 border-l-2 border-amber-400/60 bg-amber-400/5 px-4 py-3 text-sm text-amber-200">
              This wizard does not check your merchant bond or your vault balance, so it cannot tell you
              whether this advertisement would be publishable. Your bonded stake is on{" "}
              <Link href="/staking" className="font-medium text-amber-100 underline">
                Staking
              </Link>
              , and your real vault balances are on{" "}
              <Link href="/wallet" className="font-medium text-amber-100 underline">
                Wallet
              </Link>
              .
            </p>
          </div>
        )}

        {/* Per-step errors */}
        {stepErrors[step].length > 0 && (
          <ul className="mt-4 max-w-xl space-y-1.5">
            {stepErrors[step].map((err) => (
              <li key={err} className="border-l-2 border-amber-400/50 bg-amber-400/5 px-3 py-1.5 text-xs text-amber-200">
                {err}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-3 border-t border-white/5 pt-6">
        {step > 1 && (
          <button
            onClick={() => patch({ step: step - 1 })}
            className="rounded-md border border-white/15 px-5 py-2 text-sm text-gray-300 hover:bg-white/5"
          >
            ← Back
          </button>
        )}
        {step < STEPS.length ? (
          <button
            onClick={() => stepValid[step] && patch({ step: step + 1 })}
            disabled={!stepValid[step]}
            className="rounded-md bg-brand px-6 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            Continue →
          </button>
        ) : (
          <button
            onClick={() => void publish()}
            disabled={!stepValid[5] || publishing}
            className="rounded-md bg-emerald-600 px-6 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {publishing ? "Signing…" : "Publish Advertisement"}
          </button>
        )}
        {publishError ? (
          <p className="text-[11px] text-red-300">{publishError}</p>
        ) : (
          <p className="text-[11px] text-gray-600">
            Publishing costs one wallet signature. The draft above is local until then.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * What the vault lookup found, next to the liquidity field.
 *
 * Five outcomes, five sentences. The two that mean "you are advertising
 * more than you hold" are red and block the step; the three that mean "no
 * finding" are grey and block nothing. Nothing here ever renders an
 * unanswered lookup as a shortfall — see `useVaultBacking`.
 */
function VaultBackingStatus({ backing, liquidity }: { backing: VaultBacking; liquidity: string }) {
  const base = "text-xs";
  switch (backing.kind) {
    case "unkeyed":
      return <span className={`${base} text-gray-500`}>Connect a wallet and enter a mint to check backing</span>;
    case "loading":
      return <span className={`${base} text-gray-500`}>Checking your vault…</span>;
    case "error":
      return (
        <span className={`${base} text-amber-300/80`} title={backing.message}>
          Could not reach the cluster — backing unverified, not unbacked
        </span>
      );
    case "none":
      return <span className={`${base} text-red-300`}>No vault for this mint on this wallet</span>;
    case "found": {
      const cover = vaultCovers(backing.vault, liquidity);
      const available = formatBaseUnits(backing.vault.available, backing.vault.decimals);
      if (cover === null) {
        // The typed amount has more precision than the mint has decimals, so
        // there is no quantity to compare yet.
        return <span className={`${base} text-gray-500`}>{available} available in your vault</span>;
      }
      return cover.covered ? (
        <span className={`${base} text-emerald-400`}>Backed — {available} available in your vault</span>
      ) : (
        <span className={`${base} text-red-300`}>Only {available} available in your vault</span>
      );
    }
  }
}
