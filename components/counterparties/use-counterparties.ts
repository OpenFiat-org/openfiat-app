"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CounterpartyError,
  FAILURE_MESSAGE,
  forgetCounterparties,
  loadCounterparties,
  peekCounterparties,
  type CounterpartySummary,
} from "@/lib/counterparties";
import { NODE_CHANGED_EVENT, readNodeSelection } from "@/lib/node-preference";
import {
  WALLET_CHANGED_EVENT,
  currentSigner,
  readWalletConnection,
  type WalletConnection,
} from "@/lib/wallet-connection";

/**
 * Why the history is not on screen — each one a different thing to say, and
 * none of them an error.
 */
export type CounterpartiesStatus =
  /** No wallet connected. There is no history to show, because there is nobody to show it to. */
  | "no-wallet"
  /** Connected, but pointed at the simulated node selection, which has no settlements. */
  | "no-node"
  /** Everything is in place; the user has not asked yet. Asking costs a wallet prompt. */
  | "ready"
  | "loading"
  | "loaded"
  | "failed";

export interface CounterpartiesState {
  status: CounterpartiesStatus;
  summaries: CounterpartySummary[];
  error: string | null;
  /** Present exactly when `status` is "ready" or "failed". */
  read: () => void;
}

/**
 * Reads the connected wallet's own counterparty history.
 *
 * Deliberately does not fetch on mount. The read requires a wallet signature,
 * and a page that pops a signing prompt because you happened to open it
 * trains people to approve prompts without reading them. Instead it adopts an
 * already-completed read for the same wallet and node if one exists in this
 * tab (`peekCounterparties`), so the first explicit read fills in every badge
 * elsewhere in the app for free.
 */
export function useCounterparties(): CounterpartiesState {
  const [wallet, setWallet] = useState<WalletConnection | null>(null);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<CounterpartySummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const update = () => {
      // A different wallet must never inherit the previous one's history,
      // so the shared cache is dropped whenever the connection changes.
      forgetCounterparties();
      setSummaries(null);
      setError(null);
      setWallet(readWalletConnection());
    };
    update();
    window.addEventListener(WALLET_CHANGED_EVENT, update);
    return () => window.removeEventListener(WALLET_CHANGED_EVENT, update);
  }, []);

  useEffect(() => {
    const update = () => {
      const selection = readNodeSelection();
      setSummaries(null);
      setError(null);
      setEndpoint(selection.custom ? `http://${selection.id}` : null);
    };
    update();
    window.addEventListener(NODE_CHANGED_EVENT, update);
    return () => window.removeEventListener(NODE_CHANGED_EVENT, update);
  }, []);

  // Adopt a read that already happened elsewhere in the app for this exact
  // wallet and node — silently, since it costs nothing and prompts nothing.
  useEffect(() => {
    if (!wallet || !endpoint || summaries) return;
    const pending = peekCounterparties(endpoint, wallet.address);
    if (!pending) return;
    let live = true;
    void pending.then((result) => live && setSummaries(result)).catch(() => {});
    return () => {
      live = false;
    };
  }, [wallet, endpoint, summaries]);

  const read = useCallback(() => {
    const signer = currentSigner(wallet);
    if (!wallet || !endpoint) return;
    if (!signer) {
      setError(FAILURE_MESSAGE["wallet-cannot-sign"]);
      return;
    }
    setLoading(true);
    setError(null);
    loadCounterparties(endpoint, wallet.address, signer)
      .then(setSummaries)
      .catch((err: unknown) => {
        setError(
          err instanceof CounterpartyError || err instanceof Error
            ? err.message
            : FAILURE_MESSAGE.unreachable,
        );
      })
      .finally(() => setLoading(false));
  }, [wallet, endpoint]);

  const status: CounterpartiesStatus = !wallet
    ? "no-wallet"
    : !endpoint
      ? "no-node"
      : loading
        ? "loading"
        : summaries
          ? "loaded"
          : error
            ? "failed"
            : "ready";

  return { status, summaries: summaries ?? [], error, read };
}
