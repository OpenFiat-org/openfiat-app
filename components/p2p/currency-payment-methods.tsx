"use client";

import { useEffect, useState } from "react";

import { fetchAdvertisements } from "@/lib/live-advertisements";
import { NODE_CHANGED_EVENT } from "@/lib/node-preference";

/**
 * The payment rails merchants advertising in one currency actually accept.
 *
 * # What this replaced
 *
 * `paymentMethodsForCurrency` in `lib/data/ads.ts`: a hand-written map from
 * currency to rails, used to write "Local merchants accept M-Pesa, Equity
 * Bank, KCB" into the prose, the meta description and the OpenGraph card of
 * all 253 country pages. Nobody had to be advertising anything for a country
 * page to state which rails its merchants took — the sentence was the same
 * whether the book held fifty advertisements or none — and the OpenGraph
 * card carried that claim into other people's timelines.
 *
 * # Why it is a client component under a static page
 *
 * `/country/[slug]` is prerendered for every country, which is what makes it
 * this app's indexable surface, and a server-side node read at request time
 * would give that up for one sentence. So the page ships without the claim
 * and this fills it in from the reader's own access node — which also means
 * two readers on different nodes see their own node's answer rather than
 * whatever the build machine's node held.
 *
 * # An empty answer is stated, not hidden
 *
 * A currency with no advertisements renders a sentence saying so. Rendering
 * nothing would leave a page that reads exactly like one whose merchants
 * happen to take no named rails, and "nobody is advertising here yet" is the
 * single most useful thing that page can tell a visitor.
 */
export function CurrencyPaymentMethods({ currency }: { currency: string }) {
  const [methods, setMethods] = useState<string[] | null>(null);
  const [merchants, setMerchants] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(false);
      try {
        const ads = (await fetchAdvertisements()).filter(
          (ad) =>
            ad.status === "Active" &&
            ad.fiatCurrency.toUpperCase() === currency.toUpperCase(),
        );
        if (cancelled) return;
        setMethods([...new Set(ads.flatMap((ad) => ad.paymentMethods))].sort());
        setMerchants(new Set(ads.map((ad) => ad.merchantPeerId)).size);
      } catch {
        if (!cancelled) setError(true);
      }
    }

    void load();
    window.addEventListener(NODE_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(NODE_CHANGED_EVENT, load);
    };
  }, [currency]);

  if (error) {
    return (
      <p className="mt-3 text-sm text-amber-300">
        Your access node did not answer, so what merchants here accept is unknown.
      </p>
    );
  }

  if (methods === null) {
    return <p className="mt-3 text-sm text-gray-500">Reading the {currency} book…</p>;
  }

  if (merchants === 0) {
    return (
      <p className="mt-3 text-sm text-gray-400">
        No wallet is currently advertising in {currency} on your access node.
        Publishing an advertisement is all it takes to open this market.
      </p>
    );
  }

  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-gray-400">
      <span className="text-gray-500">
        {merchants === 1 ? "1 merchant accepts" : `${merchants} merchants accept`}
      </span>
      {methods.length === 0 ? (
        <span className="text-gray-500">no named payment method</span>
      ) : (
        methods.map((method) => (
          <span
            key={method}
            className="rounded border border-white/10 px-2 py-0.5 text-xs text-gray-300"
          >
            {method}
          </span>
        ))
      )}
    </p>
  );
}
