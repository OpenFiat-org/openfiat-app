"use client";

import { useState } from "react";
import { Panel } from "@/components/panel";
import { PaymentAccounts } from "@/components/settings/payment-accounts";
import { CurrencyCombobox } from "@/components/p2p/currency-combobox";

/** Notification channels per OFS-6000. All toggles are simulated client state. */
const CHANNELS = [
  { key: "email", label: "Email", hint: "Trade receipts and dispute updates · via PingRelay" },
  { key: "sms", label: "SMS", hint: "Reservation and escrow alerts · via NotifyHive" },
  { key: "telegram", label: "Telegram", hint: "Chat-style trade session notifications · via TgramBridge" },
  { key: "push", label: "Push", hint: "Browser push via the notification gateway · via PushSignal" },
] as const;

const selectCls =
  "rounded-md border border-white/10 px-3 py-2 text-sm text-gray-300 outline-none focus:border-brand/50 [&>option]:bg-[#10151d]";

export function SettingsForm() {
  const [fiat, setFiat] = useState("KES");
  const [language, setLanguage] = useState("English");
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
          <li className="flex items-center justify-between gap-4 px-4 py-4">
            <div>
              <p className="text-sm text-gray-200">Language</p>
              <p className="text-xs text-gray-500">Interface language</p>
            </div>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} className={selectCls}>
              {["English", "Kiswahili", "Português", "Français", "हिन्दी"].map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </li>
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
                onClick={() => setChannels((s) => ({ ...s, [c.key]: !s[c.key] }))}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                  channels[c.key] ? "bg-brand" : "bg-white/15"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                    channels[c.key] ? "translate-x-[22px]" : "translate-x-0.5"
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
