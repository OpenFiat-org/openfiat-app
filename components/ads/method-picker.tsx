"use client";

import { useEffect, useRef, useState } from "react";
import { isRegistryMethod, searchPaymentMethods } from "@/lib/data/payment-methods";

const CUSTOM_KEY = "openfiat:custom-methods";

/**
 * Payment-method picker: type-ahead suggestions from the canonical registry,
 * chips for selected methods, and community-added methods persisted to
 * localStorage (simulating "one user adds it, everyone can use it").
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

  const suggestions = searchPaymentMethods(query, custom).filter((m) => !selected.includes(m));
  const typed = query.trim();
  const exactExists = typed.length > 0 && (isRegistryMethod(typed) || custom.some((c) => c.toLowerCase() === typed.toLowerCase()));

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
            {!isRegistryMethod(m) && (
              <span className="rounded bg-white/10 px-1 text-[9px] uppercase tracking-wide text-brand-teal">
                community-added
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
        {open && (suggestions.length > 0 || typed) && (
          <ul className="absolute z-30 mt-1 max-h-64 w-full divide-y divide-white/5 overflow-y-auto rounded-md border border-white/15 bg-[#10151d] shadow-xl">
            {suggestions.map((m) => (
              <li key={m}>
                <button
                  type="button"
                  onClick={() => add(m)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-white/[0.04]"
                >
                  {m}
                  {!isRegistryMethod(m) && (
                    <span className="rounded bg-white/10 px-1 text-[9px] uppercase tracking-wide text-brand-teal">
                      community-added
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
      <p className="mt-1.5 text-[11px] text-gray-600">
        New methods you add become selectable for future ads (simulated — community-added methods are shared in the registry).
      </p>
    </div>
  );
}
