import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { fetchTrades, type PublicTrade } from "@/lib/live-trades";
import { ExplorerLive } from "@/components/explorer/live-explorer-panel";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "explorer" });
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default async function ExplorerPage() {
  let trades: PublicTrade[] | null = null;
  try {
    trades = (await fetchTrades()).slice(0, 8);
  } catch {
    // ExplorerLive renders "could not read trades" for `null` — a real,
    // distinct fact from an empty list.
  }

  return (
    <section>
      <ExplorerLive settlements={trades} />
    </section>
  );
}
