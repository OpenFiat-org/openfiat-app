import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";

import { NewProposalForm } from "@/components/governance/new-proposal-form";
import { PageHero } from "@/components/page-hero";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "governance" });
  return { title: t("newMetaTitle"), description: t("newMetaDescription") };
}

export default function NewProposalPage() {
  const t = useTranslations("governance");
  return (
    <section>
      <PageHero
        variant="ballot"
        title={t("newHeroTitle")}
        description={t("newHeroDescription")}
      />

      <div className="mt-10">
        <NewProposalForm />
      </div>
    </section>
  );
}
