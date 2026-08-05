import type { Metadata } from "next";
import { fetchAdvertisement } from "@/lib/live-advertisements";
import { NewTradeReview, NewTradeMissingAd } from "@/components/orders/new-trade-form";

export const metadata: Metadata = {
  title: "Review Order",
  description: "Review a real OpenFiat advertisement before an order against it.",
};

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const adParam = Array.isArray(query.ad) ? query.ad[0] : query.ad;
  // In the asset, not in fiat — see `NewTradeReview`. The parameter was
  // renamed from `amount` along with the unit it carries, so an old link
  // arrives with nothing here rather than with a fiat total silently read as
  // a quantity of tokens.
  const assetParam = Array.isArray(query.asset) ? query.asset[0] : query.asset;
  const methodParam = Array.isArray(query.method) ? query.method[0] : query.method;

  let ad = null;
  let fetchError: string | null = null;
  if (adParam) {
    try {
      ad = await fetchAdvertisement(adParam);
    } catch (err) {
      fetchError = err instanceof Error ? err.message : String(err);
    }
  }

  return (
    <section>
      <h1 className="text-xl font-semibold text-white">Review Order</h1>
      <p className="mt-1 text-sm text-gray-400">
        What placing this order against the live advertisement would mean.
      </p>
      <div className="mt-8">
        {fetchError ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/[0.04] p-6">
            <p className="text-sm font-medium text-red-300">Could not read this advertisement from the node</p>
            <p className="mt-1 font-mono text-xs text-red-400/80">{fetchError}</p>
          </div>
        ) : ad ? (
          <NewTradeReview
            ad={ad}
            userDirection={ad.direction === "Sell" ? "Buy" : "Sell"}
            assetAmount={assetParam}
            method={methodParam}
          />
        ) : (
          <NewTradeMissingAd />
        )}
      </div>
    </section>
  );
}
