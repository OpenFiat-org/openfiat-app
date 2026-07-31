"use client";

import { useEffect, useRef, useState } from "react";
import {
  isSuggestedMethod,
  searchPaymentMethods,
  useReferenceData,
  type SuggestedMethod,
} from "@/lib/reference";

const CUSTOM_KEY = "openfiat:custom-methods";

/**
 * Payment-method picker: type-ahead over the methods the node suggests,
 * chips for the selected ones, and methods the user adds themselves kept
 * in localStorage.
 *
 * # The suggestions come from the node
 *
 * They used to come from an 84-entry table in this bundle, which meant a
 * new payment method could not be advertised until this app shipped
 * again, and two interfaces could offer different lists with no way to
 * tell which was right. `getReferenceData` answers it now.
 *
 * # A method the node does not list is still allowed
 *
 * The node's list is a suggestion and not a permission — nothing on its
 * RPC surface checks an advertisement's methods against it. So the "add
 * it anyway" path stays, and matters more now that the list is not this
 * app's to extend: a merchant on a rail nobody has heard of names it
 * here, and it is theirs to use immediately.
 *
 * # A node that cannot be reached says so
 *
 * It deliberately does not fall back to a built-in list. An empty
 * dropdown would tell a merchant the network supports no payment
 * methods, which is a claim about the network made out of a failed
 * request. Typing a method by hand keeps working throughout, so the
 * control is never fully dead.
 */
export function MethodPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (methods: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [custom, setCustom] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const state = useReferenceData();
  const suggested: SuggestedMethod[] =
    state.status === "ready" ? state.data.payment_methods : [];

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CUSTOM_KEY);
      if (saved) setCustom(JSON.parse(saved) as string[]);
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  // Close suggestions on outside pointer-down.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const suggestions = searchPaymentMethods(suggested, query, custom).filter(
    (m) => !selected.includes(m),
  );
  const typed = query.trim();
  const exactExists =
    typed.length > 0 &&
    (isSuggestedMethod(suggested, typed) ||
      custom.some((c) => c.toLowerCase() === typed.toLowerCase()));

  function add(method: string) {
    if (!selected.includes(method)) onChange([...selected, method]);
    setQuery("");
  }

  function addCustom(name: string) {
    const next = [...custom, name];
    setCustom(next);
    try {
      localStorage.setItem(CUSTOM_KEY, JSON.stringify(next));
    } catch {
      /* localStorage unavailable */
    }
    add(name);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Enter" || !typed) return;
    e.preventDefault();
    if (suggestions.length > 0) add(suggestions[0]);
    else if (!exactExists) addCustom(typed);
  }

  /**
   * Only ever asserted against an answer we actually have. While the node
   * is being asked, nothing the node suggests is in `suggested` yet, so
   * badging on absence would label every method the merchant already
   * chose as one they invented.
   */
  const userAdded = (name: string) =>
    state.status === "ready" && !isSuggestedMethod(suggested, name);

  return (
    <div>
      {/* Selected chips */}
      <div className="flex flex-wrap gap-2">
        {selected.map((m) => (
          <span
            key={m}
            className="flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs text-gray-200"
          >
            {m}
            {userAdded(m) && (
              <span className="rounded bg-white/10 px-1 text-[9px] uppercase tracking-wide text-brand-teal">
                added by you
              </span>
            )}
            <button onClick={() => onChange(selected.filter((x) => x !== m))} aria-label={`Remove ${m}`} className="text-gray-500 hover:text-white">
              ✕
            </button>
          </span>
        ))}
        {selected.length === 0 && <p className="text-xs text-gray-600">No payment methods selected yet.</p>}
      </div>

      {/* Type-ahead input */}
      <div className="relative mt-3" ref={rootRef}>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Add a payment method — type to search, e.g. “mp”…"
          className="w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm text-white outline-none placeholder:text-gray-600 focus:border-brand/50"
        />
        {open && (suggestions.length > 0 || typed || state.status !== "ready") && (
          <ul className="absolute z-30 mt-1 max-h-64 w-full divide-y divide-white/5 overflow-y-auto rounded-md border border-white/15 bg-[#10151d] shadow-xl">
            {state.status === "loading" && (
              <li className="px-3 py-2 text-sm text-gray-500">Asking the node…</li>
            )}
            {/*
              * Named as a failure to reach the node, never as an absence
              * of methods. The difference decides what a merchant does
              * next: retry, or type their rail in and carry on.
              */}
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
                  You can still type a method name and add it.
                </span>
              </li>
            )}
            {suggestions.map((m) => (
              <li key={m}>
                <button
                  type="button"
                  onClick={() => add(m)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-white/[0.04]"
                >
                  {m}
                  {userAdded(m) && (
                    <span className="rounded bg-white/10 px-1 text-[9px] uppercase tracking-wide text-brand-teal">
                      added by you
                    </span>
                  )}
                </button>
              </li>
            ))}
            {typed && !exactExists && !suggestions.some((s) => s.toLowerCase() === typed.toLowerCase()) && (
              <li>
                <button
                  type="button"
                  onClick={() => addCustom(typed)}
                  className="w-full px-3 py-2 text-left text-sm text-brand hover:bg-white/[0.04]"
                >
                  Add “{typed}” as a new method
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
      {/*
        * This used to promise that a method you added was "shared in the
        * registry". It was not — it went to this browser's localStorage
        * and nowhere else, and a merchant could reasonably have read that
        * sentence as meaning their rail was now offered to everyone. The
        * suggestions come from the node; what you add stays here.
        */}
      <p className="mt-1.5 text-[11px] text-gray-600">
        Suggestions come from your node. A method it does not list is still allowed — type it and
        add it; it is saved in this browser for your future ads.
      </p>
    </div>
  );
}
