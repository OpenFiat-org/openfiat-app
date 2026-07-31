"use client";

import { useEffect, useState } from "react";

import { fetchMintNames, type ReferenceMint } from "@/lib/live-vaults";
import { nodeUrl } from "@/lib/node-endpoint";

/**
 * The node's mint phrasebook, for the wallet screens that render a mint.
 *
 * # Three states, and the third is not the second
 *
 * `undefined` is a request in flight, `null` is one that failed, and an
 * array is an answer. A screen that collapsed the first two would accuse
 * the node of being unreachable for the moment between mount and answer,
 * on every page load. `nameForMint` takes exactly this shape and turns it
 * into `asking` / `unasked` / `named` / `unnamed`.
 *
 * # Why a hook here rather than `lib/reference.ts`'s `useReferenceData`
 *
 * That one is the natural home and should absorb this once it works. It
 * calls `@openfiat/sdk`'s `reference` namespace, which the published
 * `dist` does not export — the package points `types` at `src` and
 * `import` at a `dist` built before that namespace existed — so the call
 * throws a `TypeError` synchronously, before its own `.catch()` is
 * attached, and escapes the effect rather than landing in its `error`
 * state. Until the SDK's `dist` catches up, a wallet screen wired to it
 * would crash instead of degrading.
 *
 * # Why `nodeUrl()` and not the build default
 *
 * The balances and vaults on these screens come from Solana, but the names
 * come from whichever OpenFiat node the user picked. Asking a different
 * node than the one the rest of the interface is reading would let a mint
 * be named one thing here and another on the advertisement it backs.
 */
export function useMintNames(): ReferenceMint[] | null | undefined {
  const [mints, setMints] = useState<ReferenceMint[] | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    // Read inside the effect: `nodeUrl()` touches localStorage, which does
    // not exist during the server render, so reading it in the component
    // body would give the two renders different answers.
    void fetchMintNames(nodeUrl()).then((answer) => {
      if (live) setMints(answer);
    });
    return () => {
      live = false;
    };
  }, []);

  return mints;
}
