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
 * Prefixes, because these are whole subtrees: `/explorer/address/<addr>` and
 * `/country/<slug>` are the fixture, not just their index pages.
 */
const FIXTURE_ROUTE_PREFIXES = [
  // Reads MERCHANTS and STAKING_SUMMARY for an address the chain would
  // answer for. The rest of `/explorer` is live, which is why this is a
  // deeper prefix rather than the whole subtree.
  "/explorer/address",
  // The country index and per-country pages price themselves from
  // `ORACLE_MID` and count advertisements from `PUBLIC_ADS`.
  "/countries",
  "/country",
];

/**
 * Subtrees whose children are fixtures but whose index page is not.
 *
 * `/merchants` is a live directory read from the advertisement book
 * (`lib/live-merchants.ts`), while `/merchants/<id>` is still the fixture
 * profile — `lib/data/merchants.ts` reputations, `lib/data/reviews.ts`
 * reviews, `lib/data/ads.ts` advertisements. A prefix cannot express that,
 * because a prefix deliberately matches its own index too.
 *
 * `/explorer` gets the same shape for free by listing `/explorer/address`
 * among the prefixes: its live parent simply is not on the list. That trick
 * only works when the fixture children sit under a distinguishing path
 * segment, and `/merchants/<id>` has none — the id is the segment. Hence a
 * second list rather than a cleverer pattern.
 */
const FIXTURE_SUBTREES_ONLY = ["/merchants"];

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

/**
 * Exported for `tests/network-notice.test.ts`. The set of routes this warns
 * on is the whole behaviour, and the previous version's stalest entry —
 * `"/providers/[id]"`, a route pattern that `usePathname` never produces —
 * went unnoticed for exactly as long as nothing asserted on the list.
 */
export function rendersFixtures(pathname: string): boolean {
  if (FIXTURE_ROUTES.includes(pathname)) return true;
  if (FIXTURE_SUBTREES_ONLY.some((prefix) => pathname.startsWith(`${prefix}/`))) return true;
  return FIXTURE_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * A floating warning, bottom-left, on the pages that still render fixtures.
 *
 * # It renders on those pages and nowhere else
 *
 * An intermediate version of this named the network on every route. That was
 * wrong in a quiet way: `components/network-badge.tsx` already carries a
 * persistent "Devnet" pill in a sticky top bar, so the two said the same word
 * on every page — and a warning a reader meets everywhere is furniture they
 * stop seeing. That is not a hypothetical cost. It is precisely how
 * `/providers/[id]` sat labelled "Sample data" while serving live registry
 * records without anyone noticing.
 *
 * So the division of labour is: the top bar answers "which network", always,
 * because it is always true and always relevant. This answers "is this
 * particular page real", and stays out of the way when the answer is yes —
 * which is now most of the app. Something that appears rarely is something
 * that gets read.
 *
 * It still names the network when it does appear, from the same
 * `NETWORK_LABEL` the top bar uses, so the two cannot disagree. That constant
 * is derived from the Solana RPC URL the app actually reads from — see
 * `lib/node-endpoint.ts` — rather than being a string that can be left saying
 * "Devnet" after a deployment has been pointed elsewhere, and a cluster it
 * cannot identify reads "Unknown network" instead of being assumed harmless.
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

  // Nothing to warn about: the top bar is already saying which network this
  // is, and repeating it here would only teach people to ignore this corner.
  if (!rendersFixtures(pathname)) return null;

  const title = [
    "This page renders built-in sample data rather than records read from a node or the chain.",
    `${NETWORK_LABEL} — on-chain reads from ${SOLANA_CLUSTER}${node ? `, protocol node ${node}` : ""}.`,
    TOKENS_ARE_WORTHLESS ? "Test tokens only; they have no value." : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      title={title}
      className="fixed bottom-4 left-4 z-50 flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300 backdrop-blur"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
      Sample data
      <span className="text-amber-300/70">· {NETWORK_LABEL}</span>
    </span>
  );
}
