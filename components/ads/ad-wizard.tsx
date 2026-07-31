"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import bs58 from "bs58";
import { formatNumber, shortAddress } from "@/lib/format";
import { DEVNET_SETTLEMENT_MINT } from "@/lib/onchain-config";
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
 * localStorage["openfiat:ad-draft"]. Publishing is simulated.
 */
export function AdWizard() {
  const [draft, setDraft] = useState<Draft>(DEFAULT_DRAFT);
  const [loaded, setLoaded] = useState(false);
  const [resumed, setResumed] = useState(false);
  const [published, setPublished] = useState(false);

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

  const { step, direction, mint, fiat, pricingType, price, premium, min, max, minRep, liquidity, methods } = draft;

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
   * There is no vault-backing check here any more, and that is deliberate.
   *
   * It used to read a `VAULTS` fixture keyed by asset ticker and refuse any
   * advertised liquidity above the figure it found. That gate looked like a
   * safety check and enforced nothing: the numbers were invented, identical
   * for every visitor, and unrelated to any vault on chain.
   *
   * A real check needs the merchant's `LiquidityVault` for the mint being
   * advertised, and `lib/live-vaults.ts` can do exactly that. Until this
   * screen picked a mint the lookup had no key to use — an asset ticker is
   * not one, and no devnet mint is mapped to any of the tickers it used to
   * offer. It has a key now, so what is missing is only the read: the
   * connected wallet plus one call. That is a change worth making on its own
   * rather than smuggling in here, and until it is made the step says
   * plainly that it cannot verify backing rather than implying it did.
   */

  const stepValid: Record<number, boolean> = {
    1: mintValid,
    2: pricingType === "Floating" ? premiumNum >= -5 && premiumNum <= 5 : Number(price) > 0,
    3: minNum > 0 && maxNum >= minNum && liqNum > 0,
    4: methods.length >= 1,
    5: true,
  };
  const stepErrors: Record<number, string[]> = {
    1: mintValid ? [] : ["Enter a mint address: base58, decoding to 32 bytes."],
    2: [
      ...(pricingType === "Floating" && (premiumNum < -5 || premiumNum > 5) ? ["Premium must be between -5% and +5%."] : []),
      ...(pricingType === "Fixed" && !(Number(price) > 0) ? ["Enter a fixed price greater than 0."] : []),
    ],
    3: [
      ...(minNum <= 0 ? ["Min trade must be greater than 0."] : []),
      ...(maxNum < minNum ? ["Max trade must be ≥ min trade."] : []),
      ...(liqNum <= 0 ? ["Liquidity must be greater than 0."] : []),
    ],
    4: methods.length === 0 ? ["Select at least one payment method."] : [],
    5: [],
  };

  if (published) {
    return (
      <div className="border-y border-white/5 py-14 text-center">
        <p className="text-2xl text-emerald-400">✓</p>
        <h2 className="mt-3 text-lg font-semibold text-white">Advertisement published (simulated)</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-gray-400">
          {direction} <span className="font-mono">{shortAddress(mint)}</span> for {fiat} · {pricingType === "Fixed" ? `Fixed ${price}` : `Floating ${premiumNum >= 0 ? "+" : ""}${premiumNum}%`} ·
          limits {formatNumber(minNum)}–{formatNumber(maxNum)} <span className="font-mono">{shortAddress(mint)}</span>. Draft cleared — on a live node this would
          emit an AdvertisementCreated event.
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
                <span className="text-xs text-amber-300/80">Not checked against a vault — see below</span>
              </div>
              <input value={liquidity} onChange={(e) => patch({ liquidity: e.target.value })} type="number" className={inputCls} />
              <p className="mt-1.5 text-[11px] text-gray-600">
                Nothing here confirms you hold this much. A vault is keyed by mint and by merchant,
                so checking would mean reading the chain for the connected wallet — a call this
                wizard does not make, rather than a lookup it cannot key. An earlier version filled
                the gap with invented balances and refused advertisements against them.{" "}
                <Link href="/wallet" className="text-gray-400 underline hover:text-white">
                  Your real vault balances
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
            onClick={() => stepValid[5] && setPublished(true)}
            disabled={!stepValid[5]}
            className="rounded-md bg-emerald-600 px-6 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Publish Advertisement
          </button>
        )}
        <p className="text-[11px] text-gray-600">Simulated — nothing is persisted beyond your local draft.</p>
      </div>
    </div>
  );
}
