"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import {
  NETWORK_LABEL,
  SOLANA_CLUSTER,
  TOKENS_ARE_WORTHLESS,
} from "@/lib/node-endpoint";
import { NODE_CHANGED_EVENT, readNodeSelection } from "@/lib/node-preference";

/**
 * Routes that still render built-in fixtures rather than anything read from
 * a node or the chain.
 *
 * # This list used to run the other way round, and that was the bug
 *
 * The badge was previously driven by an allowlist of routes known to be
 * live, and showed "Sample data" everywhere else. Every route therefore
 * started out being described as fabricated and had to be argued out of it
 * one cutover at a time — so the list went stale in the direction that made
 * the app describe its own real data as invented. By the time this was
 * looked at, `/wallet`, `/earnings`, `/arbitrate`, `/account/counterparties`
 * and every dynamic route were reading live devnet state under a label
 * saying they were not.
 *
 * One entry never matched anything at all: `"/providers/[id]"` was in the
 * live list, but `usePathname()` returns a resolved path (`/providers/svc-1`)
 * and never a route pattern, so the fully live per-service page was labelled
 * sample data on every load. A list that has to enumerate dynamic segments
 * by hand cannot stay right for long.
 *
 * Inverted, the default is "this is real", which is now true of most of the
 * app, and the exceptions are named. The failure mode changes with it: a
 * forgotten entry now under-warns on a page someone deliberately built on a
 * fixture, instead of over-warning on every page somebody made real.
 *
 * Prefixes, because these are whole subtrees: `/merchants/<id>` and
 * `/explorer/address/<addr>` are the fixture, not just their index pages.
 */
const FIXTURE_ROUTE_PREFIXES = [
  // The merchant directory and profile: `lib/data/merchants.ts` reputations,
  // `lib/data/reviews.ts` reviews, `lib/data/ads.ts` advertisements.
  "/merchants",
  // Reads MERCHANTS and STAKING_SUMMARY for an address the chain would
  // answer for. The rest of `/explorer` is live, which is why this is a
  // deeper prefix rather than the whole subtree.
  "/explorer/address",
  // The country index and per-country pages price themselves from
  // `ORACLE_MID` and count advertisements from `PUBLIC_ADS`.
  "/countries",
  "/country",
];

/** Fixture routes with no subtree of their own, matched exactly. */
const FIXTURE_ROUTES = [
  // `PRESALE` and `SALE_PHASES` — a sale schedule and allocation figures
  // with no on-chain account behind them.
  "/open",
  // The publishing wizard's payment methods and countries are fixtures.
  // `/ads` itself reads the wallet's real advertisements, so this is matched
  // exactly and not as a prefix.
  "/ads/new",
];

function rendersFixtures(pathname: string): boolean {
  if (FIXTURE_ROUTES.includes(pathname)) return true;
  return FIXTURE_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * The persistent floating marker, bottom-left: which network you are on, and
 * whether this particular page is reading it.
 *
 * Distinct from `components/network-badge.tsx`, which is the compact pill in
 * the top bar. Both now read `NETWORK_LABEL`, so they cannot disagree; this
 * one is the one that also carries the per-page caveat.
 *
 * # Why the network is the headline
 *
 * The label used to read "Sample data" and nothing else, which answered a
 * question almost nobody asks while leaving the one that matters unstated.
 * This interface is visually indistinguishable from a production exchange;
 * the thing a visitor most needs to know is that the balances, escrows and
 * stakes on screen are on a test cluster and represent no value. So the
 * badge names the network on every route, and adds the sample-data qualifier
 * only where it is true.
 *
 * `NETWORK_LABEL` is derived from the Solana RPC URL the app actually reads
 * from — see `lib/node-endpoint.ts`. It is not a constant that can be left
 * saying "Devnet" after a deployment has been pointed somewhere else, and a
 * cluster it cannot identify reads "Unknown network" rather than being
 * assumed harmless.
 */
export function NetworkNotice() {
  const pathname = usePathname();
  // Resolved on the client only: `readNodeSelection` reads localStorage,
  // whose server-side answer is always the build default. Starting at null
  // keeps the first client render identical to the server's, so naming the
  // selected node happens on the effect pass rather than as a hydration
  // mismatch.
  const [node, setNode] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setNode(readNodeSelection().url);
    sync();
    window.addEventListener(NODE_CHANGED_EVENT, sync);
    return () => window.removeEventListener(NODE_CHANGED_EVENT, sync);
  }, []);

  const fixtures = rendersFixtures(pathname);

  const title = [
    `${NETWORK_LABEL} — on-chain reads from ${SOLANA_CLUSTER}${node ? `, protocol node ${node}` : ""}.`,
    TOKENS_ARE_WORTHLESS ? "Test tokens only; they have no value." : null,
    fixtures
      ? "This page renders built-in sample data rather than records read from a node or the chain."
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      title={title}
      className="fixed bottom-4 left-4 z-50 flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300 backdrop-blur"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
      {NETWORK_LABEL}
      {fixtures && <span className="text-amber-300/70">· sample data</span>}
    </span>
  );
}
