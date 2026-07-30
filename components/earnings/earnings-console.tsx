"use client";

import { useCallback, useEffect, useState } from "react";
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
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not read the statement.",
      );
    } finally {
      setBusy(false);
    }
  }, [wallet, endpoint, serviceId]);

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
      <Panel title="Provider earnings">
        <p className="px-4 py-6 text-sm text-gray-400">
          Connect the wallet your service was registered with. There is no provider account to log
          into — the key that registered the service is the only thing that can read its statement.
        </p>
      </Panel>
    );
  }

  const model = result ? paymentModelFor(result.record.service_type) : null;
  const price = result ? formatPricing(result.record.pricing) : null;

  return (
    <div className="space-y-6">
      <Panel title="Prove you control the service">
        <div className="space-y-4 px-4 py-4">
          <p className="text-sm text-gray-400">
            Pick one of your registered services, or enter a Service ID directly. Your wallet will
            be asked to sign a one-time challenge — that signature is what proves the service is
            yours. Nothing is submitted to the network and no transaction is sent.
          </p>

          <div>
            <p className="text-xs text-gray-500">Registered under your key</p>
            {!wallet && (
              <p className="mt-1.5 text-sm text-gray-500">
                Connect a wallet to list the services registered under it.
              </p>
            )}
            {wallet && discovering && (
              <p className="mt-1.5 text-sm text-gray-500">Searching the service registry…</p>
            )}
            {wallet && !discovering && myServices?.length === 0 && (
              <p className="mt-1.5 text-sm text-gray-500">
                No services are registered under this key. Registering one is how it gets here — there
                is no provider account to create.
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
              placeholder="Service ID, e.g. my-oracle-1"
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
              {busy ? "Waiting for signature…" : "Read statement"}
            </button>
          </div>
          {error && <p className="text-sm text-amber-400">{error}</p>}
        </div>
      </Panel>

      {result && model && (
        <>
          <Panel title="Statement">
            <div className="divide-y divide-white/5">
              <Field label="Service">{result.earnings.service_id}</Field>
              <Field label="Type">{serviceTypeLabel(result.record.service_type)}</Field>
              <Field label="Declared price">{price ?? "Free — no price declared"}</Field>
              <Field label="Payout wallet">
                {result.earnings.payout_wallet ? (
                  <span className="font-mono text-xs">{result.earnings.payout_wallet}</span>
                ) : (
                  <span className="text-gray-400">None declared</span>
                )}
              </Field>
            </div>

            {result.earnings.entries.length === 0 ? (
              <div className="border-t border-white/10 px-4 py-5">
                <p className="text-sm text-white">
                  Nothing has been credited to this service.
                </p>
                <p className="mt-2 text-sm text-gray-400">
                  Your signature was accepted and this is your real statement — the zero is the
                  correct answer, not a failed read. Nothing credits the earnings ledger yet for
                  any role, so every provider&apos;s statement is empty today.
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

          <Panel title="How this role is paid">
            <div className="space-y-4 px-4 py-4">
              <p className={`text-xs font-semibold uppercase tracking-wider ${STATUS_TONE[model.status]}`}>
                {model.label}
              </p>
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-500">Consumers pay</p>
                <p className="mt-1 text-sm text-gray-300">{model.consumerPays}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-500">You receive</p>
                <p className="mt-1 text-sm text-gray-300">{model.providerReceives}</p>
              </div>
              {model.blockedBy && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
                  <p className="text-xs uppercase tracking-wider text-amber-400">
                    Not yet enforceable
                  </p>
                  <p className="mt-1 text-sm text-amber-200/80">{model.blockedBy}</p>
                </div>
              )}
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
