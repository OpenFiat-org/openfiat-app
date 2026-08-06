import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { DisputesTable } from "@/components/disputes/disputes-table";
import { PageHero } from "@/components/page-hero";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "disputes" });
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default function DisputesPage() {
  const t = useTranslations("disputes");
  return (
    <section>
      <PageHero
        variant="scales"
        title={t("heroTitle")}
        description={t("heroDescription")}
      />

      <div className="mt-8">
        <DisputesTable />
      </div>
    </section>
  );
}
