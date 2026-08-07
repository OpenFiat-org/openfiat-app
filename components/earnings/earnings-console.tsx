"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { fetchMyServices, type MyService } from "@/lib/my-services";
import { Panel } from "@/components/panel";
import {
  EarningsError,
  formatAmount,
  formatPricing,
  paymentModelFor,
  readEarnings,
  serviceTypeLabel,
  shortMint,
  type EarningsResult,
  type PaymentStatus,
} from "@/lib/earnings";
import { NODE_CHANGED_EVENT, readNodeSelection } from "@/lib/node-preference";
import {
  WALLET_CHANGED_EVENT,
  currentSigner,
  readWalletConnection,
  type WalletConnection,
} from "@/lib/wallet-connection";

const inputCls =
  "w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm text-white outline-none focus:border-brand/50";

const STATUS_TONE: Record<PaymentStatus, string> = {
  defined: "text-emerald-400",
  intended: "text-sky-400",
  "awaiting-meter": "text-amber-400",
  unspecified: "text-gray-400",
  "not-applicable": "text-gray-400",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
      <span className="shrink-0 text-xs uppercase tracking-wider text-gray-500">{label}</span>
      <span className="text-right text-sm text-white">{children}</span>
    </div>
  );
}

/**
 * A provider reading their own earnings statement.
 *
 * The awkward truth this screen has to carry: every statement is empty, for
 * every role, because nothing credits the ledger yet. A bare "0.00" would be
 * indistinguishable from a failed request, so a successful read says so
 * explicitly and then explains what payment for *this* role actually looks
 * like — which differs enough between roles that one generic sentence would
 * be wrong for most of them.
 */
export function EarningsConsole() {
  const t = useTranslations("earnings");
  const [wallet, setWallet] = useState<WalletConnection | null>(null);
  const [endpoint, setEndpoint] = useState<string>(() => readNodeSelection().url);
  const [serviceId, setServiceId] = useState("");
  const [result, setResult] = useState<EarningsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Discovered from the registry rather than remembered by the user. `null`
  // means "not looked yet"; an empty array means "looked, and this key has
  // registered nothing" — two different things to show.
  const [myServices, setMyServices] = useState<MyService[] | null>(null);
  const [discovering, setDiscovering] = useState(false);

  useEffect(() => {
    const update = () => setWallet(readWalletConnection());
    update();
    window.addEventListener(WALLET_CHANGED_EVENT, update);
    return () => window.removeEventListener(WALLET_CHANGED_EVENT, update);
  }, []);

  useEffect(() => {
    // Every selection is a real endpoint now, so there is no "not a real
    // node" case to gate on — and `url` is the field to read, not `id`,
    // which is `custom:<host>` for a hand-typed node.
    const update = () => setEndpoint(readNodeSelection().url);
    update();
    window.addEventListener(NODE_CHANGED_EVENT, update);
    return () => window.removeEventListener(NODE_CHANGED_EVENT, update);
  }, []);

  const read = useCallback(async () => {
    const provider = currentSigner(wallet);
    if (!provider || !serviceId.trim()) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await readEarnings(endpoint, serviceId.trim(), provider));
    } catch (err) {
      setError(
        err instanceof EarningsError
          ? t(`failure.${err.kind}`)
          : err instanceof Error
            ? err.message
            : t("couldNotRead"),
      );
    } finally {
      setBusy(false);
    }
  }, [wallet, endpoint, serviceId, t]);

  // Listing services needs no signature: the registry is public and every
  // entry already carries the key that signed it. Only reading what a
  // service EARNED requires proving control of that key.
  useEffect(() => {
    const address = wallet?.address;
    if (!address) {
      setMyServices(null);
      return;
    }
    let cancelled = false;
    setDiscovering(true);
    fetchMyServices(address)
      .then((s) => !cancelled && setMyServices(s))
      .catch(() => !cancelled && setMyServices(null))
      .finally(() => !cancelled && setDiscovering(false));
    return () => {
      cancelled = true;
    };
  }, [wallet]);

  if (!wallet) {
    return (
      <Panel title={t("providerEarnings")}>
        <p className="px-4 py-6 text-sm text-gray-400">
          {t("connectWallet")}
        </p>
      </Panel>
    );
  }

  const model = result ? paymentModelFor(result.record.service_type) : null;
  const price = result ? formatPricing(t, result.record.pricing) : null;

  return (
    <div className="space-y-6">
      <Panel title={t("proveControl")}>
        <div className="space-y-4 px-4 py-4">
          <p className="text-sm text-gray-400">
            {t("proveIntro")}
          </p>

          <div>
            <p className="text-xs text-gray-500">{t("registeredUnderKey")}</p>
            {!wallet && (
              <p className="mt-1.5 text-sm text-gray-500">
                {t("connectToList")}
              </p>
            )}
            {wallet && discovering && (
              <p className="mt-1.5 text-sm text-gray-500">{t("searchingRegistry")}</p>
            )}
            {wallet && !discovering && myServices?.length === 0 && (
              <p className="mt-1.5 text-sm text-gray-500">
                {t("noServicesRegistered")}
              </p>
            )}
            {wallet && !discovering && myServices && myServices.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-2">
                {myServices.map((s) => (
                  <li key={s.serviceId}>
                    <button
                      type="button"
                      onClick={() => setServiceId(s.serviceId)}
                      className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                        serviceId === s.serviceId
                          ? "border-brand/50 bg-brand/10 text-white"
                          : "border-white/10 text-gray-300 hover:text-white"
                      }`}
                    >
                      <span className="block font-mono text-xs">{s.serviceId}</span>
                      <span className="block text-[11px] text-gray-500">
                        {s.serviceType}
                        {s.health ? ` · ${s.health}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              className={inputCls}
              placeholder={t("serviceIdPlaceholder")}
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void read();
              }}
            />
            <button
              type="button"
              onClick={() => void read()}
              disabled={busy || !serviceId.trim()}
              className="shrink-0 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {busy ? t("waitingSignature") : t("readStatement")}
            </button>
          </div>
          {error && <p className="text-sm text-amber-400">{error}</p>}
        </div>
      </Panel>

      {result && model && (
        <>
          <Panel title={t("statement")}>
            <div className="divide-y divide-white/5">
              <Field label={t("fieldService")}>{result.earnings.service_id}</Field>
              <Field label={t("fieldType")}>{serviceTypeLabel(result.record.service_type)}</Field>
              <Field label={t("fieldDeclaredPrice")}>{price ?? t("freeNoPrice")}</Field>
              <Field label={t("fieldPayoutWallet")}>
                {result.earnings.payout_wallet ? (
                  <span className="font-mono text-xs">{result.earnings.payout_wallet}</span>
                ) : (
                  <span className="text-gray-400">{t("noneDeclared")}</span>
                )}
              </Field>
            </div>

            {result.earnings.entries.length === 0 ? (
              <div className="border-t border-white/10 px-4 py-5">
                <p className="text-sm text-white">
                  {t("nothingCredited")}
                </p>
                <p className="mt-2 text-sm text-gray-400">
                  {t("zeroExplained")}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-white/5 border-t border-white/10">
                {result.earnings.entries.map((entry) => (
                  <li
                    key={`${entry.reference}-${entry.credited_at}`}
                    className="flex items-baseline justify-between gap-4 px-4 py-2.5"
                  >
                    <span className="text-sm text-gray-400">{entry.reference}</span>
                    <span className="text-sm text-white">
                      {formatAmount(entry.amount)} {shortMint(entry.token_mint)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={t("howRolePaid")}>
            <div className="space-y-4 px-4 py-4">
              <p className={`text-xs font-semibold uppercase tracking-wider ${STATUS_TONE[model.status]}`}>
                {t(`model.${model.role}.label`)}
              </p>
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-500">{t("consumersPay")}</p>
                <p className="mt-1 text-sm text-gray-300">{t(`model.${model.role}.consumerPays`)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-500">{t("youReceive")}</p>
                <p className="mt-1 text-sm text-gray-300">{t(`model.${model.role}.providerReceives`)}</p>
              </div>
              {model.blocked && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
                  <p className="text-xs uppercase tracking-wider text-amber-400">
                    {t("notEnforceable")}
                  </p>
                  <p className="mt-1 text-sm text-amber-200/80">{t(`model.${model.role}.blockedBy`)}</p>
                </div>
              )}
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
