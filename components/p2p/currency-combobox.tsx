"use client";

import { useMemo, useRef, useState } from "react";
import { INTERNATIONAL_MARKET } from "@/lib/types";
import { COUNTRIES, POPULAR_CURRENCY_CODES, flagForCurrency } from "@/lib/data/countries";

export interface CurrencyOption {
  code: string;
  name: string;
  symbol: string;
  flag: string;
  countries: string[];
}

/** Unique currency options derived from the global countries registry. */
export const CURRENCY_OPTIONS: CurrencyOption[] = (() => {
  const byCode = new Map<string, CurrencyOption>();
  for (const c of COUNTRIES) {
    const existing = byCode.get(c.currencyCode);
    if (existing) {
      if (existing.countries.length < 3 && !existing.countries.includes(c.name)) {
        existing.countries.push(c.name);
      }
    } else {
      byCode.set(c.currencyCode, {
        code: c.currencyCode,
        name: c.currencyName,
        symbol: c.currencySymbol,
        flag: flagForCurrency(c.currencyCode),
        countries: [c.name],
      });
    }
  }
  const popular = POPULAR_CURRENCY_CODES as readonly string[];
  return [...byCode.values()].sort((a, b) => {
    const pa = popular.indexOf(a.code);
    const pb = popular.indexOf(b.code);
    if (pa !== -1 || pb !== -1) return (pa === -1 ? 999 : pa) - (pb === -1 ? 999 : pb);
    return a.code.localeCompare(b.code);
  });
})();

/**
 * Searchable country/currency combobox (a filter control, not a data modal).
 * Typing filters by currency code, currency name, or country name.
 */
export function CurrencyCombobox({
  value,
  onChange,
  priorityCodes,
  allowInternational = false,
}: {
  value: string;
  onChange: (code: string) => void;
  /** Currency codes to float to the top (e.g. those with liquidity). */
  priorityCodes?: ReadonlySet<string>;
  /** Pin a "🌐 International — all currencies" option at the top. */
  allowInternational?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const options = useMemo(() => {
    let list = CURRENCY_OPTIONS;
    if (priorityCodes && priorityCodes.size > 0) {
      list = [...list].sort((a, b) => {
        const aa = priorityCodes.has(a.code) ? 0 : 1;
        const bb = priorityCodes.has(b.code) ? 0 : 1;
        return aa - bb || a.code.localeCompare(b.code);
      });
    }
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (o) =>
        o.code.toLowerCase().includes(q) ||
        o.name.toLowerCase().includes(q) ||
        o.countries.some((c) => c.toLowerCase().includes(q)),
    );
  }, [query, priorityCodes]);

  const selected = CURRENCY_OPTIONS.find((o) => o.code === value);
  const isInternational = value === INTERNATIONAL_MARKET;
  const q = query.trim().toLowerCase();
  const showInternational = allowInternational && (!q || "international".includes(q));

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setQuery("");
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-sm text-gray-200 hover:border-white/25"
      >
        {isInternational ? (
          <>
            <span>🌐</span>
            <span className="font-medium">International</span>
            <span className="text-xs text-gray-500">all currencies</span>
          </>
        ) : (
          <>
            <span>{selected?.flag ?? flagForCurrency(value)}</span>
            <span className="font-medium">{value}</span>
            <span className="text-xs text-gray-500">{selected?.name ?? ""}</span>
          </>
        )}
        <span className="text-gray-600">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-2 w-[22rem] overflow-hidden rounded-lg border border-white/15 bg-[#10151d] shadow-2xl">
            <div className="border-b border-white/10 p-3">
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search country or currency…"
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-gray-600 focus:border-brand/50"
              />
            </div>
            <ul className="max-h-80 divide-y divide-white/5 overflow-y-auto">
              {showInternational && (
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(INTERNATIONAL_MARKET);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-white/[0.04] ${
                      isInternational ? "bg-brand/10" : ""
                    }`}
                  >
                    <span className="text-base">🌐</span>
                    <span className="font-medium text-white">International</span>
                    <span className="min-w-0 flex-1 truncate text-gray-400">all currencies, any payment method</span>
                  </button>
                </li>
              )}
              {options.map((o) => (
                <li key={o.code}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(o.code);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-white/[0.04] ${
                      o.code === value ? "bg-brand/10" : ""
                    }`}
                  >
                    <span className="text-base">{o.flag}</span>
                    <span className="w-12 font-medium text-white">{o.code}</span>
                    <span className="min-w-0 flex-1 truncate text-gray-400">
                      {o.name}
                      <span className="text-gray-600"> — {o.countries.join(", ")}</span>
                    </span>
                    <span className="text-xs text-gray-600">{o.symbol}</span>
                  </button>
                </li>
              ))}
              {options.length === 0 && !showInternational && (
                <li className="px-3 py-4 text-center text-sm text-gray-500">No matches.</li>
              )}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
