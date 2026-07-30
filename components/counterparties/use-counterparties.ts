"use client";

import { COUNTERPARTIES, counterparties, type CounterpartySummary } from "@/lib/counterparties";
import { useSignedRead, type SignedReadStatus } from "@/components/use-signed-read";

/**
 * Reads the connected wallet's own counterparty history.
 *
 * Everything about *how* — no fetch on mount, adopt a read that already
 * happened, drop it all when the wallet changes — is `useSignedRead`'s, and
 * is shared with every other read a wallet has to sign for. What is left here
 * is the shape this screen wants: `summaries`, never null, because a badge
 * that has nothing to say renders nothing rather than branching on it.
 *
 * There used to be a `"no-node"` status. It is gone because that state cannot
 * be reached: every entry in the picker is a real endpoint
 * (`lib/node-endpoint.ts`), so a selection always names somewhere a request
 * can go. A node that is picked and then fails to answer is a different thing
 * entirely — it produces an error from the read, with the node's own reason
 * attached, rather than a precondition that hides the page before anything
 * has been tried.
 */
export type CounterpartiesStatus = SignedReadStatus;

export interface CounterpartiesState {
  status: CounterpartiesStatus;
  summaries: CounterpartySummary[];
  error: string | null;
  /** Meaningful exactly when `status` is "ready" or "failed". */
  read: () => void;
}

export function useCounterparties(): CounterpartiesState {
  const { status, data, error, read } = useSignedRead(counterparties, COUNTERPARTIES);
  return { status, summaries: data ?? [], error, read };
}
