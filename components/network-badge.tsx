"use client";

import { useEffect, useState } from "react";
import { NETWORK_LABEL, SOLANA_CLUSTER, nodeUrl } from "@/lib/node-endpoint";
import { NODE_CHANGED_EVENT } from "@/lib/node-preference";

/**
 * Persistent "Devnet" marker in the top bar.
 *
 * The interface is visually indistinguishable from a production one, and
 * someone who reads a devnet balance as a real one draws exactly the wrong
 * conclusion about what they hold. Devnet OPEN has no value and cannot be
 * bridged to any that does, so which network you are on is not a detail to
 * put in a settings page.
 *
 * Shows the node actually being queried on hover, because "devnet" alone
 * does not say *which* devnet node answered — and when two nodes disagree,
 * that is the first thing worth knowing.
 */
export function NetworkBadge() {
  // Resolved on the client only: `nodeUrl()` reads localStorage, whose
  // server-side answer is always the default. Rendering the default first and
  // correcting on the effect pass keeps the first client render identical to
  // the server's rather than causing a hydration mismatch.
  const [endpoint, setEndpoint] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setEndpoint(nodeUrl());
    sync();
    window.addEventListener(NODE_CHANGED_EVENT, sync);
    return () => window.removeEventListener(NODE_CHANGED_EVENT, sync);
  }, []);

  return (
    <span
      title={
        endpoint
          ? `${NETWORK_LABEL} — node ${endpoint}, on-chain reads from ${SOLANA_CLUSTER}. Test tokens only; they have no value.`
          : `${NETWORK_LABEL} — test tokens only; they have no value.`
      }
      className="shrink-0 whitespace-nowrap rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-300"
    >
      {NETWORK_LABEL}
    </span>
  );
}
