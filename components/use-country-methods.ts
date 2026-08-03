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
 * costs nothing and lets the node put the rails this merchant already
 * advertises first, which is the closest thing to a personalised default
 * that is also true.
 */
export function useCountryPaymentMethods(
  country: string | null,
  merchant: string | null = null,
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
  }, [country, merchant, attempt, retry]);

  return state;
}
