"use client";

import { useCallback, useEffect, useState } from "react";

import {
  fetchCountryMethods,
  type CountryMethodsState,
} from "@/lib/payment-catalog";
import { nodeUrl } from "@/lib/node-endpoint";

/**
 * The node's payment-method catalogue for one country, for a client screen.
 *
 * Split out of `lib/payment-catalog.ts` because that module is reached from
 * `lib/live-advertisements.ts` — which server components import, to turn the
 * rail ids on an advertisement into names — and a module calling `useState`
 * cannot be imported by a server component at all. The data layer is plain;
 * this is the hook over it.
 *
 * Re-asks whenever the country changes, which is the point: a merchant who
 * switches from Kenya to Brazil should see PIX at the top, not M-Pesa.
 *
 * `merchant` is the connected wallet's peer id when there is one. Passing it
 * costs nothing and is what makes the merchant's *own* definitions — signed
 * records the node holds — show up beside the compiled-in rails.
 *
 * `reloadToken` re-asks when it changes and nothing else does. A merchant who
 * has just published a definition needs it back in the list to select it, and
 * the alternative — splicing the new row in locally — would put a rail in the
 * picker on this app's say-so rather than the node's, which is the failure
 * `lib/reference.ts` exists to avoid. Bumping the token asks again and the
 * node answers, or it does not and the picker says so.
 */
export function useCountryPaymentMethods(
  country: string | null,
  merchant: string | null = null,
  reloadToken = 0,
): CountryMethodsState {
  const [state, setState] = useState<CountryMethodsState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    // `nodeUrl()` reads localStorage, so it is called inside the effect and
    // not in the component body — the server render has no such storage and
    // the two renders would disagree.
    void (async () => {
      try {
        const data = await fetchCountryMethods(nodeUrl(), country, merchant);
        if (live) setState({ status: "ready", data });
      } catch (error: unknown) {
        if (live) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : "the node did not answer",
            retry,
          });
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [country, merchant, attempt, reloadToken, retry]);

  return state;
}
