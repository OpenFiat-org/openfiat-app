"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  groupedMethods,
  methodLabel,
  searchGrouped,
  type GroupedMethod,
} from "@/lib/payment-catalog";
import { useCountryPaymentMethods } from "@/components/use-country-methods";
import { MAX_PAYMENT_METHODS } from "@/lib/ad-draft";

const GROUP_LABELS: Record<GroupedMethod["group"], string> = {
  merchant: "On your other ads",
  suggested: "Common here",
  others: "Everywhere else",
};

/**
 * Payment-method picker: the node's per-country catalogue, type-ahead over
 * names and aliases, and a cap of five.
 *
 * # It selects ids and shows names
 *
 * `selected` is a list of catalogue ids — `builtin:pix` — because that is
 * what `AdvertisementCreate.payment_methods` carries. A build that sent
 * display names could not publish at all: the node answers
 * `UNSUPPORTED_PAYMENT_METHOD` for `"PIX"` and accepts `"builtin:pix"`. See
 * `lib/payment-catalog.ts`, which records how that was established.
 *
 * # The suggestions are local knowledge, and come from the node
 *
 * This used to search a flat list of 84 methods in the order
 * `getReferenceData` happened to return them, so a merchant in Nairobi
 * scrolled past Alipay and Zelle to reach M-Pesa. `getPaymentMethods` takes
 * a country and answers with the rails that country actually uses first —
 * PIX and Mercado Pago for Brazil, UPI for India, SEPA and Faster Payments
 * for the UK. That ordering is the node's local knowledge, not a heuristic
 * invented here, and it is the whole reason for the second call.
 *
 * The `merchant` group is narrower still: rails this merchant already
 * advertises, read off their own live advertisements. Empty for a first ad,
 * and shown as empty rather than filled with a guess.
 *
 * # There is no "add your own rail" any more
 *
 * There was, and it produced advertisements the node refused: an id it does
 * not know is rejected outright, custom ones included. A control that
 * silently guarantees a failure two screens later is worse than its absence,
 * so it is gone and the copy below says what the limit actually is rather
 * than implying the merchant simply has not found their rail yet.
 *
 * # A node that cannot be reached says so
 *
 * There is deliberately no built-in list to fall back on. An empty dropdown
 * would tell a merchant the network supports no payment methods, which is a
 * claim about the network made out of a failed request — and here it would
 * also be a dead end, since nothing can be typed in instead.
 */
export function MethodPicker({
  selected,
  onChange,
  country,
  merchant = null,
  max = MAX_PAYMENT_METHODS,
}: {
  /** Catalogue ids, not display names. */
  selected: string[];
  onChange: (methodIds: string[]) => void;
  /** ISO country code whose rails to suggest first, or `null` for all of them. */
  country: string | null;
  /** The connected merchant's peer id, so the node can surface their own rails. */
  merchant?: string | null;
  max?: number;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const state = useCountryPaymentMethods(country, merchant);

  const catalogue = useMemo(
    () => (state.status === "ready" ? groupedMethods(state.data) : []),
    [state],
  );
  const names = useMemo(
    () => new Map(catalogue.map((entry) => [entry.method.id, entry.method.name])),
    [catalogue],
  );

  // Close on outside pointer-down, and on Escape — the panel is absolutely
  // positioned and covers the wizard's Continue button while it is open.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  const full = selected.length >= max;

  const suggestions = useMemo(
    () =>
      searchGrouped(catalogue, query)
        .filter((entry) => !selected.includes(entry.method.id))
        .slice(0, 8),
    [catalogue, query, selected],
  );

  function add(id: string) {
    if (full || selected.includes(id)) return;
    onChange([...selected, id]);
    setQuery("");
    // Closed on selection. Left open, the panel sits on top of whatever
    // follows it on the page — in the ad wizard, the Continue button — and a
    // merchant who has just chosen a rail cannot reach it.
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Enter" || suggestions.length === 0) return;
    e.preventDefault();
    add(suggestions[0]!.method.id);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {selected.map((id) => (
          <span
            key={id}
            className="flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs text-gray-200"
            title={id}
          >
            {/* The node's name for the id, or the id itself while the
                catalogue is still loading. Unhelpful and true beats helpful
                and invented. */}
            {methodLabel(id, names)}
            <button
              type="button"
              onClick={() => onChange(selected.filter((x) => x !== id))}
              aria-label={`Remove ${methodLabel(id, names)}`}
              className="text-gray-500 hover:text-white"
            >
              ✕
            </button>
          </span>
        ))}
        {selected.length === 0 && (
          <p className="text-xs text-gray-600">No payment methods selected yet.</p>
        )}
        <span className="ml-auto text-[11px] tabular-nums text-gray-600">
          {selected.length} of {max}
        </span>
      </div>

      <div className="relative mt-3" ref={rootRef}>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          disabled={full}
          aria-label="Search payment methods"
          placeholder={
            full
              ? "Five is the most an advertisement can list — remove one to add another"
              : "Search payment methods — try “mpesa”, “pix”, “upi”…"
          }
          className="w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm text-white outline-none placeholder:text-gray-600 focus:border-brand/50 disabled:cursor-not-allowed disabled:opacity-50"
        />
        {open && !full && (
          <ul className="absolute z-30 mt-1 max-h-72 w-full divide-y divide-white/5 overflow-y-auto rounded-md border border-white/15 bg-[#10151d] shadow-xl">
            {state.status === "loading" && (
              <li className="px-3 py-2 text-sm text-gray-500">Asking the node…</li>
            )}
            {/* Named as a failure to reach the node, never as an absence of
                methods. The difference decides what a merchant does next. */}
            {state.status === "error" && (
              <li className="px-3 py-2 text-sm">
                <span className="text-amber-400">Could not load payment methods.</span>{" "}
                <button
                  type="button"
                  onClick={state.retry}
                  className="text-brand underline underline-offset-2 hover:text-white"
                >
                  Try again
                </button>
                <span className="mt-1 block text-[11px] text-gray-600">
                  Nothing can be selected until your node answers — the node only accepts rails
                  from its own catalogue.
                </span>
              </li>
            )}
            {state.status === "ready" && suggestions.length === 0 && (
              <li className="px-3 py-2 text-sm text-gray-500">
                {query.trim()
                  ? `Your node lists no rail matching “${query.trim()}”.`
                  : "Your node lists no payment methods."}
              </li>
            )}
            {suggestions.map((entry, i) => {
              const previous = suggestions[i - 1];
              const heading = previous?.group !== entry.group ? GROUP_LABELS[entry.group] : null;
              return (
                <li key={entry.method.id}>
                  {heading && (
                    <p className="bg-white/[0.03] px-3 py-1 text-[10px] uppercase tracking-wide text-gray-500">
                      {heading}
                      {entry.group === "suggested" && country ? ` · ${country}` : ""}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => add(entry.method.id)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-white/[0.04]"
                  >
                    {entry.method.name}
                    <span className="ml-auto text-[10px] text-gray-600">
                      {entry.method.category}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {/*
        * Two claims this used to make, both wrong. It promised that a method
        * you added was "shared in the registry" — it went to this browser's
        * localStorage and nowhere else — and then, after that was fixed, that
        * "a method it does not list is still allowed". The node refuses one.
        */}
      <p className="mt-1.5 text-[11px] leading-relaxed text-gray-600">
        These are the rails your node accepts, ordered by what the country you selected actually
        uses. It refuses any other, so there is nothing to type in — if a rail you settle on is
        missing, it has to be added to the node&rsquo;s catalogue before anyone can advertise it.
      </p>
    </div>
  );
}
