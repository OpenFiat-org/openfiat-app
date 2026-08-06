import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { MerchantConsole } from "@/components/ads/merchant-console";
import { PageHero } from "@/components/page-hero";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "ads" });
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default function AdsPage() {
  const t = useTranslations("ads");
  return (
    <section>
      <PageHero
        title={t("heroTitle")}
        description={t("heroDescription")}
      />
      <div className="mt-8">
        <MerchantConsole />
      </div>
    </section>
  );
}
