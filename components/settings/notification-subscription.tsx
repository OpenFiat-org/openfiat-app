"use client";

import bs58 from "bs58";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Panel } from "@/components/panel";
import {
  NOTIFICATION_CATEGORIES,
  fetchSubscription,
  publishSubscription,
  type NotificationCategory,
} from "@/lib/notifications";
import {
  WALLET_CHANGED_EVENT,
  currentSigner,
  readWalletConnection,
  type WalletConnection,
} from "@/lib/wallet-connection";

/**
 * What this wallet has asked to be notified about (OFS-6000).
 *
 * # What it replaced
 *
 * Four toggles — Email, SMS, Telegram, Push — in `useState`, saving nowhere,
 * with a footer conceding "Preferences are simulated and reset on reload".
 * They were also the wrong axis: a subscription is signed against
 * *categories*, and a channel is a property of a sealed destination. So the
 * screen offered control over something the record does not carry, and none
 * over what it does. `lib/notifications.ts` has the longer argument.
 *
 * # The switches now do exactly one thing, and it is stated
 *
 * They build a `SubscriptionUpdate`, the wallet signs it, and the node
 * gossips it. That is a real, verifiable statement of intent — and it is
 * *not* delivery. Nothing arrives anywhere until a destination exists, which
 * needs a registered notification gateway and a sealed address this app
 * cannot build yet. The panel says that plainly instead of letting a reader
 * flip a switch and expect an email.
 */
export function NotificationSubscription() {
  const t = useTranslations("settings");
  const [wallet, setWallet] = useState<WalletConnection | null>(null);
  const [enabled, setEnabled] = useState<NotificationCategory[] | null>(null);
  const [unknown, setUnknown] = useState<string[]>([]);
  const [destinations, setDestinations] = useState(0);
  const [published, setPublished] = useState(false);
  const [status, setStatus] = useState<
    { kind: "idle" } | { kind: "busy" } | { kind: "error"; message: string } | { kind: "done" }
  >({ kind: "idle" });
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setWallet(readWalletConnection());
    update();
    window.addEventListener(WALLET_CHANGED_EVENT, update);
    return () => window.removeEventListener(WALLET_CHANGED_EVENT, update);
  }, []);

  const load = useCallback(async (address: string) => {
    setLoadError(null);
    try {
      const subscription = await fetchSubscription(address);
      // `null` is "has never published", which is not the same as "all off".
      setPublished(subscription !== null);
      setEnabled(subscription?.enabled ?? []);
      // Carried through untouched so publishing does not unsubscribe this
      // wallet from a category a newer client turned on.
      setUnknown(subscription?.unknown ?? []);
      setDestinations(subscription?.destinations ?? 0);
    } catch (err) {
      setEnabled(null);
      setLoadError(
        err instanceof Error
          ? t("readError", { message: err.message })
          : t("readErrorGeneric"),
      );
    }
  }, [t]);

  useEffect(() => {
    if (!wallet) {
      setEnabled(null);
      return;
    }
    void load(wallet.address);
  }, [wallet, load]);

  function toggle(category: NotificationCategory) {
    setEnabled((current) =>
      current === null
        ? current
        : current.includes(category)
          ? current.filter((c) => c !== category)
          : [...current, category],
    );
    setStatus({ kind: "idle" });
  }

  async function publish() {
    if (!wallet || enabled === null) return;
    const provider = currentSigner(wallet);
    if (!provider) {
      setStatus({
        kind: "error",
        message: t("signerUnavailable"),
      });
      return;
    }
    setStatus({ kind: "busy" });
    try {
      await publishSubscription(provider, bs58.decode(wallet.address), enabled, unknown);
      await load(wallet.address);
      setStatus({ kind: "done" });
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : t("publishError"),
      });
    }
  }

  if (!wallet) {
    return (
      <Panel title={t("notifTitle")}>
        <p className="px-4 py-10 text-center text-sm leading-relaxed text-gray-500">
          {t("notifConnect")}
        </p>
      </Panel>
    );
  }

  return (
    <Panel title={t("notifTitle")}>
      {loadError && <p className="px-4 pt-4 text-xs text-amber-300">{loadError}</p>}
      {enabled === null ? (
        !loadError && <p className="px-4 py-10 text-center text-sm text-gray-500">{t("reading")}</p>
      ) : (
        <>
          {!published && (
            <p className="border-b border-white/5 px-4 py-3 text-xs leading-relaxed text-gray-500">
              {t("neverPublished")}
            </p>
          )}
          <ol className="divide-y divide-white/5">
            {NOTIFICATION_CATEGORIES.map((category) => (
              <li
                key={category}
                className="flex items-center justify-between gap-4 px-4 py-4"
              >
                <div>
                  <p className="text-sm text-gray-200">{t(`category.${category}`)}</p>
                  <p className="max-w-md text-xs text-gray-500">{t(`categoryNote.${category}`)}</p>
                </div>
                <button
                  role="switch"
                  aria-checked={enabled.includes(category)}
                  aria-label={t(`category.${category}`)}
                  onClick={() => toggle(category)}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    enabled.includes(category) ? "bg-brand" : "bg-white/15"
                  }`}
                >
                  <span
                    className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                      enabled.includes(category) ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </li>
            ))}
          </ol>
          <div className="space-y-2 border-t border-white/5 px-4 py-4">
            <button
              onClick={publish}
              disabled={status.kind === "busy"}
              className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status.kind === "busy" ? t("confirmInWallet") : t("signPublish")}
            </button>
            {status.kind === "error" && (
              <p className="text-xs text-red-300">{status.message}</p>
            )}
            {status.kind === "done" && (
              <p className="text-xs text-emerald-300">{t("published")}</p>
            )}
            {/*
              * The gap between "enabled" and "delivered", stated rather than
              * left to be discovered. A destination is sealed to one
              * registered notification gateway so only that gateway can read
              * the address; this app builds no sealed box yet.
              */}
            <p className="max-w-2xl text-xs leading-relaxed text-gray-500">
              {destinations === 0
                ? t("noDestination")
                : t("destinationsAttached", { count: destinations })}
            </p>
          </div>
        </>
      )}
    </Panel>
  );
}
