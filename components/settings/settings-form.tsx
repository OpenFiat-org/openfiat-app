"use client";

import { useState } from "react";
import { Panel } from "@/components/panel";
import { PaymentAccounts } from "@/components/settings/payment-accounts";
import { CurrencyCombobox } from "@/components/p2p/currency-combobox";

/**
 * The delivery channels OFS-6000 §8 defines. All toggles are local state.
 *
 * Each hint used to end "· via PingRelay", "· via NotifyHive", "· via
 * TgramBridge", "· via PushSignal". No such providers exist — not in the
 * specs, not in the registry, nowhere. They read as the named partners
 * actually carrying a merchant's dispute alerts, and naming a carrier that
 * does not exist for a message that is not sent is a strange thing for a
 * settings screen to do.
 *
 * OFS-6000 has no fixed carriers to name in the first place: a notification
 * provider is a registered service a wallet subscribes to, discovered like
 * any other, so which one delivers an SMS is a property of a subscription
 * this app does not yet create.
 */
const CHANNELS = [
  { key: "email", label: "Email", hint: "Trade receipts and dispute updates" },
  { key: "sms", label: "SMS", hint: "Reservation and escrow alerts" },
  { key: "telegram", label: "Telegram", hint: "Chat-style trade session notifications" },
  { key: "push", label: "Push", hint: "Browser push, delivered by a registered Web Push provider" },
] as const;

export function SettingsForm() {
  const [fiat, setFiat] = useState("KES");
  const [channels, setChannels] = useState<Record<string, boolean>>({
    email: true,
    sms: true,
    telegram: false,
    push: true,
  });

  return (
    <div className="space-y-6">
      {/* First, because it is the one setting that gates an action: you cannot
          sell without an account to receive into. */}
      <PaymentAccounts />

      <Panel title="Preferences">
        <ol className="divide-y divide-white/5">
          <li className="flex items-center justify-between gap-4 px-4 py-4">
            <div>
              <p className="text-sm text-gray-200">Default fiat currency</p>
              <p className="text-xs text-gray-500">Used across the P2P exchange and trade screens</p>
            </div>
            <CurrencyCombobox value={fiat} onChange={setFiat} />
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

      <Panel title="Notification channels (OFS-6000)">
        <ol className="divide-y divide-white/5">
          {CHANNELS.map((c) => (
            <li key={c.key} className="flex items-center justify-between gap-4 px-4 py-4">
              <div>
                <p className="text-sm text-gray-200">{c.label}</p>
                <p className="text-xs text-gray-500">{c.hint}</p>
              </div>
              <button
                role="switch"
                aria-checked={channels[c.key]}
                // The button's only child is the knob, so without this the
                // switch has no accessible name and every row announces
                // itself identically.
                aria-label={c.label}
                onClick={() => setChannels((s) => ({ ...s, [c.key]: !s[c.key] }))}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                  channels[c.key] ? "bg-brand" : "bg-white/15"
                }`}
              >
                {/*
                 * `left-0.5` is what keeps the knob inside the track.
                 *
                 * It was absolutely positioned with no `left` at all, so it
                 * resolved to its static position — and a `<button>` centres
                 * its content, which puts an out-of-flow child's static
                 * origin at the track's midpoint, 22px in. Both offsets were
                 * then measured from there: `translate-x-[22px]` put the
                 * white circle at 44px, entirely outside the 44px track and
                 * over the panel's right edge, and the off state sat flush
                 * against the right instead of the left. The switch showed
                 * its knob on the wrong side in both states.
                 *
                 * Anchored explicitly, the travel is the plain arithmetic it
                 * looks like: 44 track − 20 knob − 2 inset = 20px, so both
                 * ends inset equally.
                 */}
                <span
                  className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                    channels[c.key] ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </li>
          ))}
        </ol>
      </Panel>

      <p className="text-[11px] text-gray-600">Preferences are simulated and reset on reload — nothing is persisted.</p>
    </div>
  );
}
