"use client";

import { useCallback, useEffect, useState } from "react";
import { NODE_CHANGED_EVENT, readNodeSelection } from "@/lib/node-preference";
import {
  forgetSignedReads,
  type GatedSurface,
  type WalletCache,
} from "@/lib/wallet-proof";
import {
  WALLET_CHANGED_EVENT,
  currentSigner,
  readWalletConnection,
  type WalletConnection,
} from "@/lib/wallet-connection";

/**
 * A node read that only the connected wallet can make.
 *
 * There are several of these now — a wallet's counterparties, its own
 * settlements, its own dispute cases — and they all behave the same way for
 * the same reasons, so the behaviour lives here once:
 *
 *  - **Nothing is fetched on mount.** Each read costs a wallet signature, and
 *    a page that pops a signing prompt because you happened to open it trains
 *    people to approve prompts without reading them. `read()` is an answer to
 *    something the person asked for.
 *  - **A read that already happened is adopted silently** (`peek`), so the
 *    first explicit read on one page fills in whatever else needs it for free
 *    and without a second prompt.
 *  - **Changing wallet or node drops everything.** A second wallet on the same
 *    machine must never see the first one's records, and that is worth more
 *    than the one avoided refetch.
 */
export type SignedReadStatus =
  /** No wallet connected. There is nothing to show, because there is nobody to show it to. */
  | "no-wallet"
  /** Everything is in place; the user has not asked yet. Asking costs a wallet prompt. */
  | "ready"
  | "loading"
  | "loaded"
  | "failed";

export interface SignedReadState<T> {
  status: SignedReadStatus;
  /** Null until a read succeeds — never an empty stand-in for "not read yet". */
  data: T | null;
  error: string | null;
  read: () => void;
  /**
   * Drop what was read, so the next `read()` asks the node again.
   *
   * For after the wallet writes something the read covers: an arbitrator who
   * has just joined a case is entitled to a record they were not entitled to
   * a moment ago, and the cached answer would show them the case they are
   * working as one they have not joined.
   */
  forget: () => void;
}

/**
 * Which of the five states a read is in, as a plain function of what is
 * known.
 *
 * Split out of the hook so it can be asserted directly. The case that
 * matters is `no-wallet`: a screen that cannot tell "nobody is connected"
 * from "connected, and this wallet has nothing" will eventually tell someone
 * they have no trades when they have simply not signed yet, and no amount of
 * careful copy downstream fixes a status that already lost the distinction.
 */
export function signedReadStatus(known: {
  connected: boolean;
  loading: boolean;
  loaded: boolean;
  failed: boolean;
}): SignedReadStatus {
  if (!known.connected) return "no-wallet";
  if (known.loading) return "loading";
  if (known.loaded) return "loaded";
  return known.failed ? "failed" : "ready";
}

export function useSignedRead<T>(
  cache: WalletCache<T>,
  surface: GatedSurface,
): SignedReadState<T> {
  const [wallet, setWallet] = useState<WalletConnection | null>(null);
  // `readNodeSelection` is safe before hydration — it returns the build's
  // default node when there is no `window` — so the endpoint is known from
  // the first render and never passes through a "nothing selected" state.
  const [endpoint, setEndpoint] = useState<string>(() => readNodeSelection().url);
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const update = () => {
      // Every cached gated read is dropped, not just this hook's: a wallet
      // change invalidates all of them, and remembering to clear each one
      // separately is exactly what gets forgotten.
      forgetSignedReads();
      setData(null);
      setError(null);
      setWallet(readWalletConnection());
    };
    update();
    window.addEventListener(WALLET_CHANGED_EVENT, update);
    return () => window.removeEventListener(WALLET_CHANGED_EVENT, update);
  }, []);

  useEffect(() => {
    const update = () => {
      // `url` is the field to read, not `id`, which is `custom:<host>` for a
      // hand-typed node.
      setData(null);
      setError(null);
      setEndpoint(readNodeSelection().url);
    };
    update();
    window.addEventListener(NODE_CHANGED_EVENT, update);
    return () => window.removeEventListener(NODE_CHANGED_EVENT, update);
  }, []);

  useEffect(() => {
    if (!wallet || data) return;
    const pending = cache.peek(endpoint, wallet.address);
    if (!pending) return;
    let live = true;
    void pending.then((result) => live && setData(result)).catch(() => {});
    return () => {
      live = false;
    };
  }, [cache, wallet, endpoint, data]);

  const read = useCallback(() => {
    const signer = currentSigner(wallet);
    if (!wallet) return;
    if (!signer) {
      setError(surface.messages["wallet-cannot-sign"]);
      return;
    }
    setLoading(true);
    setError(null);
    cache
      .load(endpoint, wallet.address, signer)
      .then(setData)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : surface.messages.unreachable);
      })
      .finally(() => setLoading(false));
  }, [cache, surface, wallet, endpoint]);

  const forget = useCallback(() => {
    cache.forget();
    setData(null);
    setError(null);
  }, [cache]);

  const status = signedReadStatus({
    connected: wallet !== null,
    loading,
    loaded: data !== null,
    failed: error !== null,
  });

  return { status, data, error, read, forget };
}
