"use client";

import { useLocale } from "next-intl";
import { useMemo, useRef, useState } from "react";
import { INTERNATIONAL_MARKET } from "@/lib/types";
import { currencyOptions, useReferenceData } from "@/lib/reference";

export type { CurrencyOption } from "@/lib/reference";

/**
 * Searchable country/currency combobox (a filter control, not a data
 * modal). Typing filters by currency code, currency name, or country name.
 *
 * # The list comes from the node
 *
 * It was built at module load from a 441-line country table in this
 * bundle, so which currencies this network traded in was a fact about
 * which build of this app you had open. `getReferenceData` answers it
 * now, which also means a currency added to the network appears here
 * without a release.
 *
 * That table also shipped the Somaliland shilling as `SLSH`. Four
 * letters, which the protocol's currency type rejects outright — a
 * merchant could pick it out of this very dropdown and have their
 * advertisement refused by the node with an error naming a field they
 * never filled in. Codes now come from the node, which cannot offer one
 * it could not itself accept.
 *
 * # An unreachable node is not an empty world
 *
 * There is no built-in list to fall back on, and the panel says so
 * rather than rendering an empty scroller — "no currencies" is a claim
 * about the network, and a failed request is not grounds for it.
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
  const state = useReferenceData();
  const locale = useLocale();

  // Rebuilt only when a new answer arrives, not on every keystroke: this
  // walks 253 countries to fold them into ~160 currency rows.
  const all = useMemo(
    () => (state.status === "ready" ? currencyOptions(state.data, locale) : []),
    [state, locale],
  );

  const options = useMemo(() => {
    let list = all;
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
        o.displayName.toLowerCase().includes(q) ||
        o.countries.some((c) => c.toLowerCase().includes(q)),
    );
  }, [all, query, priorityCodes]);

  const selected = all.find((o) => o.code === value);
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
        aria-expanded={open}
        aria-haspopup="listbox"
        /* A stable accessible name that still carries the current value. The
           trigger's own text is a flag, a code and an arrow, so without this
           a screen reader announced "🏳️ ▾" — and with nothing selected it
           announced nothing at all. */
        aria-label={`Fiat currency: ${isInternational ? "International" : value || "none selected"}`}
        className={`relative flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-gray-200 transition-colors ${
          open ? "border-brand/60 bg-brand/[0.06] text-white" : "border-white/10 hover:border-white/25"
        }`}
      >
        {isInternational ? (
          <>
            <span>🌐</span>
            <span className="font-medium">International</span>
            <span className="text-xs text-gray-500">all currencies</span>
          </>
        ) : (
          <>
            {/*
              * A neutral flag until the node has named this currency,
              * rather than one guessed from the first two letters of the
              * code. That guess is right often enough to be trusted and
              * wrong often enough to matter, and the code beside it
              * already says everything the flag would.
              */}
            <span>{selected?.flag ?? "🏳️"}</span>
            {/* A label when nothing is chosen. The ad wizard starts with no
                currency selected — nothing here has the standing to pick one
                for a merchant — and without this the trigger was a flag and
                an arrow with no words in it, which is unreachable by name for
                a screen reader and unreadable for everybody else. */}
            <span className="font-medium">{value || "Select a currency"}</span>
            <span className="text-xs text-gray-500">{selected?.displayName ?? ""}</span>
          </>
        )}
        <span className="text-gray-600">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          {/*
            * A notch pointing back at the trigger. Without it the panel reads
            * as an unmoored sheet — you can see a list of currencies but not
            * which control produced it, and with several filters in a row that
            * is a real question.
            */}
          <div className="absolute z-50 mt-2 w-[24rem] rounded-lg border border-white/15 bg-[#10151d] shadow-2xl">
            <span
              aria-hidden
              className="absolute -top-[5px] left-5 h-2 w-2 rotate-45 border-l border-t border-white/15 bg-[#10151d]"
            />
            <div className="border-b border-white/10 p-3">
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search country or currency…"
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-gray-600 focus:border-brand/50"
              />
            </div>
            <ul
              role="listbox"
              aria-label="Fiat currencies"
              className="scrollbar-dark max-h-80 divide-y divide-white/5 overflow-y-auto rounded-b-lg"
            >
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
                      {o.displayName}
                      <span className="text-gray-600"> — {o.countries.join(", ")}</span>
                    </span>
                    <span className="text-xs text-gray-600">{o.symbol}</span>
                  </button>
                </li>
              ))}
              {/*
                * Three different reasons this list can be short, and they
                * must not look alike. "No matches" is a statement about
                * the query and is only true once a node has answered;
                * before that the honest word is "loading", and after a
                * failure it is "could not load". The version this
                * replaced could only ever say "No matches", because the
                * list was a constant and could not fail to exist.
                */}
              {state.status === "loading" && (
                <li className="px-3 py-4 text-center text-sm text-gray-500">
                  Asking the node for currencies…
                </li>
              )}
              {state.status === "error" && (
                <li className="px-3 py-4 text-center text-sm">
                  <span className="block text-amber-400">Could not load currencies.</span>
                  <span className="mt-0.5 block text-xs text-gray-500">{state.message}</span>
                  <button
                    type="button"
                    onClick={state.retry}
                    className="mt-2 text-sm text-brand underline underline-offset-2 hover:text-white"
                  >
                    Try again
                  </button>
                </li>
              )}
              {state.status === "ready" && options.length === 0 && !showInternational && (
                <li className="px-3 py-4 text-center text-sm text-gray-500">No matches.</li>
              )}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
