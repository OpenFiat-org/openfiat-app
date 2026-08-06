import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { CounterpartiesConsole } from "@/components/counterparties/counterparties-console";
import { PageHero } from "@/components/page-hero";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "counterparties" });
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default function CounterpartiesPage() {
  const t = useTranslations("counterparties");
  return (
    <section>
      <PageHero
        variant="bloom"
        title={t("heroTitle")}
        description={t("heroDescription")}
      />

      <div className="mt-8">
        <CounterpartiesConsole />
      </div>
    </section>
  );
}
