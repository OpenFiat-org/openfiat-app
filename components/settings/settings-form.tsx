"use client";

import { useEffect, useState } from "react";
import { Panel } from "@/components/panel";
import { NotificationSubscription } from "@/components/settings/notification-subscription";
import { PaymentAccounts } from "@/components/settings/payment-accounts";
import { CurrencyCombobox } from "@/components/p2p/currency-combobox";
import { preferredCurrency, writePreferredCurrency } from "@/lib/market-preference";

/*
 * Four channel toggles — Email, SMS, Telegram, Push — stood here in
 * `useState`, saving nowhere, under a footer conceding "Preferences are
 * simulated and reset on reload". They have moved to
 * `components/settings/notification-subscription.tsx` and become the five
 * categories a subscription is actually signed against, read from and
 * written back to the node. See `lib/notifications.ts` for why channels were
 * the wrong axis in the first place.
 */

export function SettingsForm() {
  /*
   * Empty until mount. The preference lives in localStorage, which cannot be
   * read during a server render, so seeding this with a currency here would
   * both cause a hydration mismatch and state a preference the reader never
   * expressed — the previous version's `useState("KES")` did exactly that,
   * and then wrote nowhere.
   */
  const [fiat, setFiat] = useState("");

  useEffect(() => {
    setFiat(preferredCurrency() ?? "");
  }, []);

  function chooseFiat(code: string) {
    setFiat(code);
    // The same key the exchange reads, so this control genuinely changes
    // which market the exchange opens on.
    writePreferredCurrency(code);
  }

  return (
    <div className="space-y-6">
      {/* First, because it is the one setting that gates an action: you cannot
          sell without an account to receive into. */}
      <PaymentAccounts />

      <Panel title="Preferences">
        <ol className="divide-y divide-white/5">
          <li className="flex items-center justify-between gap-4 px-4 py-4">
            <div>
              <p className="text-sm text-gray-200">Default market</p>
              <p className="text-xs text-gray-500">
                {fiat
                  ? "The currency the exchange opens on, in this browser."
                  : "No market chosen yet — the exchange opens on whichever you last browsed."}
              </p>
            </div>
            <CurrencyCombobox value={fiat} onChange={chooseFiat} />
          </li>
          {/*
           * A "Language" row stood here, offering English, Kiswahili,
           * Português, Français and हिन्दी. This app has no dictionaries and
           * no locale routing — every string in it is written in English at
           * the call site — so four of those five options changed nothing at
           * all, and the fifth was only correct by accident. A control that
           * cannot do the thing it names is worse than a missing one: the
           * missing one is honest about the state of the app, while this one
           * told a Kiswahili speaker the interface was theirs to have.
           *
           * Not replaced with a single-option selector either. One option is
           * furniture, not a control, and it would still imply the machinery
           * exists and is merely unpopulated.
           *
           * When translations do land, `openfiat-org` has already solved this
           * and is the arrangement to copy rather than re-derive:
           * `lib/i18n/config.ts` holds `LOCALES` plus a `LOCALE_META` entry
           * per locale (label, htmlLang, ogLocale, direction),
           * `lib/i18n/dictionaries/` holds one module per locale split into
           * chrome and content, `app/[locale]/` prefixes every URL including
           * the default so adding a language never changes an existing one,
           * and `tests/i18n.test.ts` checks the dictionaries agree on keys.
           * The selector belongs back here at that point, built from `LOCALES`
           * so it can only ever offer what actually exists.
           */}
          <li className="flex items-center justify-between gap-4 px-4 py-4">
            <div>
              <p className="text-sm text-gray-200">Theme</p>
              <p className="text-xs text-gray-500">Dark only for now — light mode is on the roadmap</p>
            </div>
            <span className="text-sm text-gray-500">Dark</span>
          </li>
        </ol>
      </Panel>

      <NotificationSubscription />
      {/*
        * "Preferences are simulated and reset on reload — nothing is
        * persisted" used to close this page, and it was true of everything
        * above it. Each panel now says for itself where its state lives:
        * payment accounts in this browser, the default market in this
        * browser, and the subscription on the network under your signature.
        */}
    </div>
  );
}
