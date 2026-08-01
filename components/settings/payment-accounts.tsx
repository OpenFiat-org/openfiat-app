"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type SavedPaymentAccount,
  blankFields,
  isComplete,
  readAccounts,
  writeAccounts,
} from "@/lib/payment-accounts";
import { flagForCountry, useReferenceData } from "@/lib/reference";
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
 *
 * # Both dropdowns read the node
 *
 * The method list came from `lib/data/payment-methods.ts` and the country
 * list from `lib/data/countries.ts` — two tables compiled into the bundle,
 * and the last readers either had. That made this the one screen where a
 * merchant could nominate an account on a rail the network does not carry,
 * and it meant adding a payment method needed a release of this app before
 * anybody could hold an account on it.
 *
 * There is no fallback list when the node cannot be reached, deliberately —
 * see `lib/reference.ts`. An empty dropdown reads as "the network supports
 * nothing", which is a claim about the network made out of a failure to
 * reach one, so the form says "could not load" and refuses to open instead.
 */
export function PaymentAccounts() {
  const reference = useReferenceData();
  const [accounts, setAccounts] = useState<SavedPaymentAccount[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  // Empty until the node answers. A default rail written here would be this
  // app naming a payment method again, and the previous default
  // ("M-Pesa Kenya (Safaricom)") was a string only the deleted table used.
  const [method, setMethod] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [fields, setFields] = useState(blankFields(""));

  const methods = useMemo(
    () =>
      reference.status === "ready"
        ? [...reference.data.payment_methods].sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [reference],
  );
  const countries = useMemo(
    () =>
      reference.status === "ready"
        ? [...reference.data.countries].sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [reference],
  );

  // SSR renders the empty state; accounts arrive post-mount so there is no
  // hydration mismatch.
  useEffect(() => {
    setAccounts(readAccounts());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) writeAccounts(accounts);
  }, [accounts, loaded]);

  /**
   * Opens the form, seeded from the node's own first entries.
   *
   * Seeded here rather than in an effect, and never from a constant: the
   * button that calls this is disabled until the reference data is in hand,
   * so there is no moment at which this form has to guess a rail. The
   * previous default was the literal "M-Pesa Kenya (Safaricom)" — a string
   * only the deleted table ever used.
   */
  function startAdding() {
    setMethod(methods[0]?.name ?? "");
    setCountryCode(countries[0]?.code ?? "");
    setFields(blankFields(methods[0]?.name ?? ""));
    setAdding(true);
  }

  function chooseMethod(next: string) {
    setMethod(next);
    // Field shapes differ per rail, so switching method starts a fresh set
    // rather than keeping labels that no longer apply.
    setFields(blankFields(next));
  }

  function save() {
    const country = countries.find((c) => c.code === countryCode);
    const account: SavedPaymentAccount = {
      id: `acct-${Date.now().toString(36)}`,
      method,
      countryCode,
      // The node's own currency for that country. There is no "USD" fallback
      // any more: a country the node did not list is not one this form can
      // offer, so the branch cannot be reached from the dropdown.
      currencyCode: country?.currency ?? "",
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
              // The node's name for the stored code, when it is reachable;
              // the code itself otherwise. A saved account keeps working
              // whether or not a node can be asked what its country is called.
              const country = countries.find((c) => c.code === a.countryCode);
              return (
                <li key={a.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-white">{a.method}</span>
                    <span className="text-xs text-gray-500">
                      {flagForCountry(a.countryCode)} {country?.name ?? a.countryCode} ·{" "}
                      {a.currencyCode}
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
                  {methods.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.name}
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
                  {countries.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name} — {c.currency}
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
        ) : reference.status === "error" ? (
          /* Not an empty dropdown. Which rails and countries the network
             carries is the node's answer, and "could not load" has to be
             distinguishable from "loaded, and empty". */
          <p className="mt-4 text-sm text-amber-300">
            Couldn&apos;t ask your access node which payment methods and countries
            the network supports ({reference.message}).{" "}
            <button
              type="button"
              onClick={reference.retry}
              className="underline hover:text-amber-200"
            >
              Try again
            </button>
          </p>
        ) : (
          <button
            type="button"
            onClick={startAdding}
            disabled={reference.status !== "ready"}
            className="mt-4 rounded-md border border-white/15 px-4 py-2 text-sm text-gray-200 hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {reference.status === "ready"
              ? "Add a payment account"
              : "Asking your node which rails exist…"}
          </button>
        )}
      </div>
    </Panel>
  );
}
