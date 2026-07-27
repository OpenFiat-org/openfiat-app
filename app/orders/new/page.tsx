import type { Metadata } from "next";
import { adById } from "@/lib/data/ads";
import { merchantById } from "@/lib/data/merchants";
import { NewTradeForm, NewTradeMissingAd } from "@/components/orders/new-trade-form";

export const metadata: Metadata = {
  title: "New Order",
  description: "Create an escrow-protected P2P reservation on OpenFiat.",
};

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const adParam = Array.isArray(query.ad) ? query.ad[0] : query.ad;
  const ad = adParam ? adById(adParam) : undefined;

  return (
    <section>
      <h1 className="text-xl font-semibold text-white">Confirm Order</h1>
      <p className="mt-1 text-sm text-gray-400">
        Review the offer and place your order — the seller's crypto locks in escrow on Solana when the order is placed.
      </p>
      <div className="mt-8">
        {ad ? (
          <NewTradeForm
            ad={ad}
            merchant={merchantById(ad.merchantId)}
            userDirection={ad.direction === "Sell" ? "Buy" : "Sell"}
          />
        ) : (
          <NewTradeMissingAd />
        )}
      </div>
    </section>
  );
}
