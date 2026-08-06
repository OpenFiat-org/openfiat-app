import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { ArbitrationConsole } from "@/components/arbitrate/arbitration-console";
import { PageHero } from "@/components/page-hero";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "arbitrate" });
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default function ArbitratePage() {
  const t = useTranslations("arbitrate");
  return (
    <section>
      <PageHero
        variant="bloom"
        title={t("heroTitle")}
        description={t("heroDescription")}
      />

      <div className="mt-8">
        <ArbitrationConsole />
      </div>
    </section>
  );
}
