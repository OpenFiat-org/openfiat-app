"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type SavedPaymentAccount,
  blankFields,
  isComplete,
  readAccounts,
  writeAccounts,
} from "@/lib/payment-accounts";
import { flagForCountry } from "@/lib/countries";
import { useReferenceData } from "@/lib/reference";
import { groupedMethods } from "@/lib/payment-catalog";
import { useCountryPaymentMethods } from "@/components/use-country-methods";
import { CopyButton } from "@/components/copy-button";
import { CountrySelect } from "@/components/p2p/country-select";
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
 * # Both dropdowns read the node, and the rails follow the country
 *
 * The method list came from `lib/data/payment-methods.ts` and the country
 * list from `lib/data/countries.ts` — two tables compiled into the bundle,
 * and the last readers either had. That made this the one screen where a
 * merchant could nominate an account on a rail the network does not carry,
 * and it meant adding a payment method needed a release of this app before
 * anybody could hold an account on it.
 *
 * The methods are now ordered by the country the account is held in, through
 * `getPaymentMethods`. Alphabetical over all 84 put "Airtel Money" above
 * "M-Pesa Kenya (Safaricom)" for a Kenyan account and "Alipay" above "PIX"
 * for a Brazilian one; the node knows which rails each country uses and says
 * so. Choosing the country first is therefore not a formality here — it is
 * what makes the second dropdown answerable.
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
  // The selected rail's catalogue **id**, empty until one is chosen. An id
  // because that is what an advertisement carries and what this account has
  // to be matched against — see `SavedPaymentAccount.method`.
  const [methodId, setMethodId] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [fields, setFields] = useState(blankFields(null));

  const catalogue = useCountryPaymentMethods(countryCode || null);
  // Grouped, so the country's own rails come first and everything else
  // follows — the node's ordering, kept rather than re-sorted alphabetically.
  const methods = useMemo(
    () => (catalogue.status === "ready" ? groupedMethods(catalogue.data) : []),
    [catalogue],
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
    // No method is pre-chosen: the rails depend on the country, and the
    // country is the merchant's to pick. The previous default was the
    // literal "M-Pesa Kenya (Safaricom)" — a string only a deleted table
    // ever used — and then the node's alphabetically-first entry, which was
    // no more relevant to anybody.
    setCountryCode("");
    setMethodId("");
    setFields(blankFields(null));
    setAdding(true);
  }

  function chooseCountry(next: string) {
    setCountryCode(next);
    // The rail list is about to change under it, so a method chosen for the
    // previous country is cleared rather than left standing.
    setMethodId("");
    setFields(blankFields(null));
  }

  /** The node's row for the selected id, or `undefined` before one is picked. */
  const chosen = methods.find((entry) => entry.method.id === methodId)?.method;

  function chooseMethod(next: string) {
    setMethodId(next);
    // Which fields a rail needs comes from the node's own category for it,
    // so switching rail starts a fresh set rather than keeping labels that
    // no longer apply.
    const row = methods.find((entry) => entry.method.id === next)?.method;
    setFields(blankFields(row?.category ?? null, next));
  }

  function save() {
    const country = countries.find((c) => c.code === countryCode);
    const account: SavedPaymentAccount = {
      id: `acct-${Date.now().toString(36)}`,
      method: methodId,
      // Cached for display only. Matching goes through the id above.
      methodName: chosen?.name,
      countryCode,
      // The node's own currency for that country. There is no "USD" fallback
      // any more: a country the node did not list is not one this form can
      // offer, so the branch cannot be reached from the dropdown.
      currencyCode: country?.currency ?? "",
      fields,
    };
    setAccounts((prev) => [...prev, account]);
    setAdding(false);
    setFields(blankFields(null));
  }

  const ready =
    methodId.trim().length > 0 &&
    countryCode.trim().length > 0 &&
    fields.length > 0 &&
    fields.every((f) => f.value.trim().length > 0);

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
                    {/* The name saved with it, or the id itself. An id on
                        screen is the value the account actually carries,
                        which beats inventing a name for it. */}
                    <span className="text-sm font-medium text-white" title={a.method}>
                      {a.methodName ?? a.method}
                    </span>
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
              {/* Country first, because it decides what the method list can
                  usefully offer. */}
              <div>
                <label className={labelCls} htmlFor="acct-country">
                  Held in
                </label>
                <CountrySelect
                  id="acct-country"
                  value={countryCode}
                  onChange={chooseCountry}
                  countries={countries}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="acct-method">
                  Method
                </label>
                <select
                  id="acct-method"
                  value={methodId}
                  onChange={(e) => chooseMethod(e.target.value)}
                  disabled={catalogue.status !== "ready"}
                  className={inputCls}
                >
                  <option value="">
                    {catalogue.status === "loading"
                      ? "Asking your node…"
                      : catalogue.status === "error"
                        ? "Could not load payment methods"
                        : "Select a method"}
                  </option>
                  {methods.map(({ method: m, group }) => (
                    <option key={m.id} value={m.id}>
                      {group === "suggested" && countryCode ? "★ " : ""}
                      {m.name}
                    </option>
                  ))}
                </select>
                {catalogue.status === "error" && (
                  <button
                    type="button"
                    onClick={catalogue.retry}
                    className="mt-1 text-[11px] text-brand underline hover:text-white"
                  >
                    Try again
                  </button>
                )}
                {catalogue.status === "ready" && countryCode && (
                  <p className="mt-1 text-[11px] text-gray-600">
                    ★ marks the rails your node associates with this country.
                  </p>
                )}
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
                  {countryCode && methodId
                    ? "Fill every field — a partial account cannot be paid into."
                    : "Choose where the account is held, then which rail it is on."}
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
