import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { fetchAdvertisement } from "@/lib/live-advertisements";
import { NewTradeReview, NewTradeMissingAd } from "@/components/orders/new-trade-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "placeOrder" });
  return { title: t("reviewMetaTitle"), description: t("reviewMetaDescription") };
}

export default async function NewOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "placeOrder" });
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
      <h1 className="text-xl font-semibold text-white">{t("reviewOrderTitle")}</h1>
      <p className="mt-1 text-sm text-gray-400">
        {t("reviewOrderSubtitle")}
      </p>
      <div className="mt-8">
        {fetchError ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/[0.04] p-6">
            <p className="text-sm font-medium text-red-300">{t("couldNotReadAd")}</p>
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
