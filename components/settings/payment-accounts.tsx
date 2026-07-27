"use client";

import { useEffect, useState } from "react";
import { COUNTRIES, currenciesFor, getCountry } from "@/lib/data/countries";
import {
  type SavedPaymentAccount,
  blankFields,
  isComplete,
  readAccounts,
  selectableMethods,
  writeAccounts,
} from "@/lib/payment-accounts";
import { CopyButton } from "@/components/copy-button";
import { Panel } from "@/components/panel";

const inputCls =
  "w-full rounded-md border border-white/10 bg-[#0a0e14]/70 px-3 py-2 text-sm text-white outline-none placeholder:text-gray-600 focus:border-brand/50";
const labelCls = "block text-xs text-gray-500";

/**
 * Manage the accounts you receive fiat into.
 *
 * Persisted to localStorage rather than kept in memory, because a seller who has
 * to retype their bank details on every trade will paste them into the chat
 * instead — which puts them in the trade log for anyone reading it later, and
 * loses the per-field copy the buyer needs.
 */
export function PaymentAccounts() {
  const [accounts, setAccounts] = useState<SavedPaymentAccount[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [method, setMethod] = useState("M-Pesa Kenya (Safaricom)");
  const [countryCode, setCountryCode] = useState("KE");
  const [fields, setFields] = useState(blankFields("M-Pesa Kenya (Safaricom)"));

  // SSR renders the empty state; accounts arrive post-mount so there is no
  // hydration mismatch.
  useEffect(() => {
    setAccounts(readAccounts());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) writeAccounts(accounts);
  }, [accounts, loaded]);

  function chooseMethod(next: string) {
    setMethod(next);
    // Field shapes differ per rail, so switching method starts a fresh set
    // rather than keeping labels that no longer apply.
    setFields(blankFields(next));
  }

  function save() {
    const country = getCountry(countryCode);
    const account: SavedPaymentAccount = {
      id: `acct-${Date.now().toString(36)}`,
      method,
      countryCode,
      currencyCode: country ? currenciesFor(country)[0] : "USD",
      fields,
    };
    setAccounts((prev) => [...prev, account]);
    setAdding(false);
    setFields(blankFields(method));
  }

  const ready = fields.every((f) => f.value.trim().length > 0);

  return (
    <Panel title={`Payment accounts${accounts.length ? ` — ${accounts.length}` : ""}`}>
      <div className="px-4 py-4">
        <p className="text-xs leading-relaxed text-gray-500">
          The accounts you receive fiat into. Selling requires at least one: when
          you take a sell order, you nominate which of these the buyer pays, and
          they see each field separately so they can copy it without retyping.
          Stored in this browser only.
        </p>

        {accounts.length > 0 && (
          <ul className="mt-4 divide-y divide-white/5 border-y border-white/5">
            {accounts.map((a) => {
              const country = getCountry(a.countryCode);
              return (
                <li key={a.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-white">{a.method}</span>
                    <span className="text-xs text-gray-500">
                      {country?.flag} {country?.name} · {a.currencyCode}
                    </span>
                    {!isComplete(a) && (
                      <span className="rounded border border-amber-400/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-300">
                        incomplete
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setAccounts((prev) => prev.filter((x) => x.id !== a.id))}
                      className="ml-auto text-xs text-gray-500 hover:text-red-300"
                    >
                      Remove
                    </button>
                  </div>
                  <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                    {a.fields.map((f) => (
                      <div key={f.label} className="flex items-center justify-between gap-3 text-xs">
                        <dt className="text-gray-500">{f.label}</dt>
                        <dd className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-mono text-gray-300">{f.value || "—"}</span>
                          {f.value && <CopyButton value={f.value} />}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </li>
              );
            })}
          </ul>
        )}

        {adding ? (
          <div className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls} htmlFor="acct-method">
                  Method
                </label>
                <select
                  id="acct-method"
                  value={method}
                  onChange={(e) => chooseMethod(e.target.value)}
                  className={inputCls}
                >
                  {selectableMethods().map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="acct-country">
                  Held in
                </label>
                <select
                  id="acct-country"
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className={inputCls}
                >
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name} — {c.currencyCode}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {fields.map((f, i) => (
              <div key={f.label}>
                <label className={labelCls} htmlFor={`acct-f-${i}`}>
                  {f.label}
                </label>
                <input
                  id={`acct-f-${i}`}
                  value={f.value}
                  onChange={(e) =>
                    setFields((prev) =>
                      prev.map((x, xi) => (xi === i ? { ...x, value: e.target.value } : x)),
                    )
                  }
                  className={inputCls}
                />
              </div>
            ))}

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={save}
                disabled={!ready}
                className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                Save account
              </button>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="text-sm text-gray-500 hover:text-gray-300"
              >
                Cancel
              </button>
              {!ready && (
                <span className="text-xs text-amber-300">
                  Fill every field — a partial account cannot be paid into.
                </span>
              )}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-4 rounded-md border border-white/15 px-4 py-2 text-sm text-gray-200 hover:border-white/30"
          >
            Add a payment account
          </button>
        )}
      </div>
    </Panel>
  );
}
