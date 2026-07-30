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
 *
 * There used to be a `"no-node"` member here, for a selection that could not
 * answer. It is gone because that state cannot be reached: every entry in the
 * picker is now a real endpoint (`lib/node-endpoint.ts`), so a selection
 * always names somewhere a request can go. A node that is picked and then
 * fails to answer is a different thing entirely — it produces an error from
 * the read, with the node's own reason attached, rather than a precondition
 * that hides the page before anything has been tried.
 */
export type CounterpartiesStatus =
  /** No wallet connected. There is no history to show, because there is nobody to show it to. */
  | "no-wallet"
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
  // `readNodeSelection` is safe before hydration — it returns the build's
  // default node when there is no `window` — so the endpoint is known from
  // the first render and never passes through a "nothing selected" state.
  const [endpoint, setEndpoint] = useState<string>(() => readNodeSelection().url);
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
      // Every selection is queried over `url`. The old code read `id`, which
      // is `custom:<host>` for a hand-typed node, so the one path it allowed
      // built `http://custom:host` and could not have worked either.
      setSummaries(null);
      setError(null);
      setEndpoint(readNodeSelection().url);
    };
    update();
    window.addEventListener(NODE_CHANGED_EVENT, update);
    return () => window.removeEventListener(NODE_CHANGED_EVENT, update);
  }, []);

  // Adopt a read that already happened elsewhere in the app for this exact
  // wallet and node — silently, since it costs nothing and prompts nothing.
  useEffect(() => {
    if (!wallet || summaries) return;
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
    if (!wallet) return;
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
    : loading
      ? "loading"
      : summaries
        ? "loaded"
        : error
          ? "failed"
          : "ready";

  return { status, summaries: summaries ?? [], error, read };
}
