import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { fetchTrade } from "@/lib/live-trades";
import { fetchAdvertisement, type LiveAd } from "@/lib/live-advertisements";
import { TradeRoom } from "@/components/orders/trade-room";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "tradeRoom" });
  return { title: t("metaTitle") };
}

/**
 * Trade room for one real trade. Replaces a page that, for any id it didn't
 * recognise, synthesized a whole fake trade — fabricated payment
 * instructions and transaction signatures included — from the query string
 * alone. See `components/orders/trade-room.tsx`'s own doc for what that
 * meant in practice.
 */
export default async function TradePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "tradeRoom" });

  let trade = null;
  let ad: LiveAd | null = null;
  let error: string | null = null;
  try {
    trade = await fetchTrade(id);
    if (trade) {
      try {
        ad = await fetchAdvertisement(trade.reservation.advertisement_id);
      } catch {
        // Pair/price context is a nice-to-have; the trade itself still renders without it.
      }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <section>
      <Link href="/orders" className="text-sm text-gray-500 hover:text-white">
        {t("backToTrades")}
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-white">{t("tradeHeading", { id })}</h1>
      </div>
      <div className="mt-8">
        {error ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/[0.04] p-6">
            <p className="text-sm font-medium text-red-300">{t("couldNotRead")}</p>
            <p className="mt-1 font-mono text-xs text-red-400/80">{error}</p>
          </div>
        ) : trade ? (
          <TradeRoom publicTrade={trade} ad={ad} />
        ) : (
          <p className="rounded-lg border border-white/10 bg-white/[0.02] p-6 text-sm text-gray-400">
            {t("noReservation", { id })}
          </p>
        )}
      </div>
    </section>
  );
}
