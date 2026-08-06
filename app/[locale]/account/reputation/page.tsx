import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { PageHero } from "@/components/page-hero";
import { LiveReputationPanel } from "@/components/account/live-reputation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "identity" });
  return { title: t("repMetaTitle"), description: t("repMetaDescription") };
}


/*
 * A `TIER_LADDER` stood here — Newcomer through Institutional, each
 * promising ad slots, priority placement and bond discounts, with a "← you"
 * marker against whichever tier the fixture claimed. It is gone rather than
 * relabelled: the protocol has no tiers, and nothing in this codebase grants
 * an ad slot or a bond discount for reputation. Presenting it beside real
 * counters would have made an unbuilt design read as current standing.
 */

export default function ReputationPage() {
  const t = useTranslations("identity");
  return (
    <section>
      <PageHero
        title={t("repMetaTitle")}
        description={t("repPageDescription")}
      />

      <div className="mt-8">
        <LiveReputationPanel />
      </div>


      <p className="mt-8 text-xs text-gray-500">
        {t("repEventsNote")}
      </p>

    </section>
  );
}
