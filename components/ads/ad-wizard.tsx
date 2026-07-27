"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { StablecoinAsset } from "@/lib/types";
import { fxPerUsd } from "@/lib/data/ads";
import { OPEN_BALANCE, OPEN_BOND_REQUIRED, VAULTS } from "@/lib/data/wallet";
import { formatNumber } from "@/lib/format";
import { CurrencyCombobox } from "@/components/p2p/currency-combobox";
import { MethodPicker } from "@/components/ads/method-picker";

const DRAFT_KEY = "openfiat:ad-draft";
const STEPS = ["Market", "Pricing", "Limits", "Payment methods", "Review"] as const;

interface Draft {
  step: number;
  direction: "Buy" | "Sell";
  asset: StablecoinAsset;
  fiat: string;
  pricingType: "Fixed" | "Floating";
  price: string;
  premium: string;
  min: string;
  max: string;
  liquidity: string;
  methods: string[];
}

const DEFAULT_DRAFT: Draft = {
  step: 1,
  direction: "Sell",
  asset: "USDT",
  fiat: "KES",
  pricingType: "Floating",
  price: "132.00",
  premium: "0.8",
  min: "5000",
  max: "250000",
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

  const { step, direction, asset, fiat, pricingType, price, premium, min, max, liquidity, methods } = draft;

  // Indicative price from the static FX table
  const fx = fxPerUsd(fiat);
  const base = fx ? (asset === "SOL" ? 144.2 * fx : fx) : null;
  const premiumNum = Number(premium) || 0;
  const indicative =
    base === null
      ? null
      : pricingType === "Fixed"
        ? Number(price) || 0
        : Math.round(base * (1 + premiumNum / 100) * 100) / 100;

  // Per-step validation
  const minNum = Number(min) || 0;
  const maxNum = Number(max) || 0;
  const liqNum = Number(liquidity) || 0;
  const vault = VAULTS.find((v) => v.asset === asset);
  const vaultAvailable = vault?.available ?? 0;

  const stepValid: Record<number, boolean> = {
    1: true,
    2: pricingType === "Floating" ? premiumNum >= -5 && premiumNum <= 5 : Number(price) > 0,
    3: minNum > 0 && maxNum >= minNum && liqNum > 0 && liqNum <= vaultAvailable,
    4: methods.length >= 1,
    5: OPEN_BALANCE >= OPEN_BOND_REQUIRED,
  };
  const stepErrors: Record<number, string[]> = {
    1: [],
    2: [
      ...(pricingType === "Floating" && (premiumNum < -5 || premiumNum > 5) ? ["Premium must be between -5% and +5%."] : []),
      ...(pricingType === "Fixed" && !(Number(price) > 0) ? ["Enter a fixed price greater than 0."] : []),
      ...(base === null ? [`No oracle reference for ${asset}/${fiat} — pick another market.`] : []),
    ],
    3: [
      ...(minNum <= 0 ? ["Min trade must be greater than 0."] : []),
      ...(maxNum < minNum ? ["Max trade must be ≥ min trade."] : []),
      ...(liqNum <= 0 ? ["Liquidity must be greater than 0."] : []),
      ...(liqNum > vaultAvailable ? [`Exceeds your ${asset} vault availability (${formatNumber(vaultAvailable)} ${asset}).`] : []),
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
          {direction} {asset} for {fiat} · {pricingType === "Fixed" ? `Fixed ${price}` : `Floating ${premiumNum >= 0 ? "+" : ""}${premiumNum}%`} ·
          limits {formatNumber(minNum, 0)}–{formatNumber(maxNum, 0)} {fiat}. Draft cleared — on a live node this would
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
          <span className="font-mono text-xs tabular-nums text-gray-400">
            Your balance: {formatNumber(OPEN_BALANCE, 0)} OPEN
          </span>
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
              <p className={labelCls}>Asset</p>
              <div className="flex flex-wrap gap-2">
                {(["USDT", "USDC", "USD1", "SOL"] as const).map((a) => (
                  <button
                    key={a}
                    onClick={() => patch({ asset: a })}
                    className={`rounded-md border px-4 py-2 text-sm transition-colors ${
                      asset === a ? "border-brand/50 bg-brand/10 text-white" : "border-white/10 text-gray-400 hover:text-white"
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
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
                <label className={labelCls}>Price ({fiat}/{asset})</label>
                <input value={price} onChange={(e) => patch({ price: e.target.value })} type="number" className={inputCls} />
              </div>
            ) : (
              <div>
                <label className={labelCls}>Premium (%, -5 to +5)</label>
                <input value={premium} onChange={(e) => patch({ premium: e.target.value })} type="number" step="0.1" className={inputCls} />
              </div>
            )}
            <p className="rounded-md border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-gray-300">
              Indicative price:{" "}
              <span className="font-mono tabular-nums text-white">
                {indicative ? `${formatNumber(indicative)} ${fiat}/${asset}` : "—"}
              </span>
            </p>
          </div>
        )}

        {step === 3 && (
          <div className="max-w-xl space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Min trade ({fiat})</label>
                <input value={min} onChange={(e) => patch({ min: e.target.value })} type="number" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Max trade ({fiat})</label>
                <input value={max} onChange={(e) => patch({ max: e.target.value })} type="number" className={inputCls} />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className={labelCls}>Liquidity ({asset})</label>
                <span className="text-xs tabular-nums text-gray-500">Vault available {formatNumber(vaultAvailable)} {asset}</span>
              </div>
              <input value={liquidity} onChange={(e) => patch({ liquidity: e.target.value })} type="number" className={inputCls} />
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
                ["Direction", direction === "Sell" ? `Sell ${asset} (you sell crypto)` : `Buy ${asset} (you buy crypto)`],
                ["Market", `${asset}/${fiat}`],
                ["Pricing", pricingType === "Fixed" ? `Fixed ${price} ${fiat}` : `Floating oracle mid ${premiumNum >= 0 ? "+" : ""}${premiumNum}%`],
                ["Indicative price", indicative ? `${formatNumber(indicative)} ${fiat}/${asset}` : "—"],
                ["Limits", `${formatNumber(minNum, 0)} – ${formatNumber(maxNum, 0)} ${fiat}`],
                ["Liquidity", `${formatNumber(liqNum, 0)} ${asset}`],
                ["Payment methods", methods.join(" · ")],
                ["Merchant bond", `${formatNumber(OPEN_BOND_REQUIRED, 0)} OPEN (already bonded)`],
              ].map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-4 py-3 text-sm">
                  <dt className="text-gray-500">{label}</dt>
                  <dd className="text-right text-gray-200">{value}</dd>
                </div>
              ))}
            </dl>
            {OPEN_BALANCE < OPEN_BOND_REQUIRED && (
              <p className="mt-4 border-l-2 border-amber-400/60 bg-amber-400/5 px-4 py-3 text-sm text-amber-200">
                You need {formatNumber(OPEN_BOND_REQUIRED, 0)} OPEN to publish ads — you have {formatNumber(OPEN_BALANCE, 0)}.{" "}
                <Link href="/open" className="font-medium text-amber-100 underline">
                  Buy OPEN →
                </Link>
              </p>
            )}
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
