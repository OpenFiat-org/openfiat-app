"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { NODE_CHANGED_EVENT, readNodeSelection } from "@/lib/node-preference";

/**
 * Routes backed by the real devnet programs on every load — `/staking` and
 * `/governance` read `StakingConfig`/`StakeAccount`/`Proposal` straight from
 * Solana via `lib/onchain-config`, with no mock fallback, and their detail
 * and action routes (`/staking/stake`, `/governance/[id]`) do the same.
 */
const LIVE_ROUTE_PREFIXES = ["/staking", "/governance"];

/**
 * Routes reading the real node on every load, matched exactly.
 *
 * `/ads` reads this wallet's real advertisements from `getAdvertisements`.
 * `/ads/new` is NOT included: the publishing wizard still builds its payment
 * method and country choices from fixtures, so it is matched exactly rather
 * than by prefix — claiming the whole subtree is live would be the same
 * overstatement this badge exists to prevent.
 */
const LIVE_ROUTES = ["/ads"];

/**
 * Routes that are live only once the user has selected a custom access node.
 * Matched exactly, not by prefix: only the index routes were cut over, so
 * `/providers/[id]` and `/explorer/address/[address]` still read fixtures.
 */
const NODE_DEPENDENT_ROUTES = ["/explorer", "/providers"];

function isLive(pathname: string, customNode: boolean): boolean {
  if (LIVE_ROUTE_PREFIXES.some((r) => pathname === r || pathname.startsWith(`${r}/`))) {
    return true;
  }
  if (LIVE_ROUTES.includes(pathname)) return true;
  return customNode && NODE_DEPENDENT_ROUTES.includes(pathname);
}

/**
 * Floating "Simulated data" label — bottom-left, subtle, hover for details.
 *
 * Hidden on routes actually serving real data, which is why this is not just
 * a static element in the layout: claiming a page is simulated while it shows
 * real on-chain balances is the more damaging of the two errors.
 *
 * One known imprecision: if `/explorer` or `/providers` is pointed at a custom
 * node that then fails to respond, those pages fall back to fixtures and this
 * badge stays hidden. Both render their own explicit "showing simulated data"
 * notice in that case, so the state is still stated on screen — closing the
 * gap here would mean threading live-state up out of each panel.
 */
export function SimulatedBadge() {
  const pathname = usePathname();
  // Read on the client only: `readNodeSelection` hits localStorage, and its
  // server-side answer is always the non-custom default. Starting at `false`
  // keeps the first client render identical to the server's, so hiding the
  // badge for a custom node happens on the effect pass rather than as a
  // hydration mismatch.
  const [customNode, setCustomNode] = useState(false);

  useEffect(() => {
    const sync = () => setCustomNode(readNodeSelection().custom);
    sync();
    window.addEventListener(NODE_CHANGED_EVENT, sync);
    return () => window.removeEventListener(NODE_CHANGED_EVENT, sync);
  }, []);

  if (isLive(pathname, customNode)) return null;

  return (
    <span
      title="This page renders built-in sample data, not records read from a node. Separate from the devnet notice in the header: that says which NETWORK the app talks to, this says this PAGE is not talking to it."
      className="fixed bottom-4 left-4 z-50 flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300 backdrop-blur"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
      Sample data
    </span>
  );
}
