import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { EarningsConsole } from "@/components/earnings/earnings-console";
import { RewardObservations } from "@/components/earnings/reward-observations";
import { PageHero } from "@/components/page-hero";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "earnings" });
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default function EarningsPage() {
  const t = useTranslations("earnings");
  return (
    <section>
      <PageHero
        variant="bloom"
        title={t("heroTitle")}
        description={t("heroDescription")}
      />

      <div className="mt-8">
        <EarningsConsole />
      </div>

      {/*
        * A node operator is not a registered service and has no statement
        * to sign for, so the console above answers nothing for them. This
        * does, and it needs no wallet: OFS-4100 §9.4 makes the observations
        * public precisely so the schedule computed from them can be checked
        * by anyone.
        */}
      <RewardObservations />
    </section>
  );
}
