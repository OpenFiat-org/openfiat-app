import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { alternatesFor } from "@/lib/seo";
import { Link } from "@/i18n/navigation";
import { PageHero } from "@/components/page-hero";
import { StepList } from "@/components/guide/step-list";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "guide.buy" });
  return {
    title: { absolute: t("metaTitle") },
    description: t("metaDescription"),
    alternates: alternatesFor("/guide/buy", locale),
  };
}

export default function BuyGuidePage() {
  const t = useTranslations("guide.buy");
  const steps = t.raw("steps") as Array<[string, string]>;
  const goodToKnow = t.raw("goodToKnow") as string[];
  return (
    <section>
      <PageHero
        variant="flow"
        title={t("heroTitle")}
        description={t("heroDescription")}
      />

      <div className="mt-10 max-w-3xl">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">{t("stepByStep")}</h2>
        <div className="mt-3">
          <StepList steps={steps} />
        </div>

        <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-gray-400">{t("goodToKnowHeading")}</h2>
        <ul className="mt-3 space-y-2.5">
          {goodToKnow.map((tip) => (
            <li key={tip} className="flex gap-2.5 border-l-2 border-brand-teal/60 pl-3 text-sm text-gray-300">
              {tip}
            </li>
          ))}
        </ul>

        <div className="mt-10 flex flex-wrap gap-6 border-t border-white/10 pt-6 text-sm">
          <Link href="/" className="text-brand hover:text-brand-hover">{t("startBuying")}</Link>
          <Link href="/guide/sell" className="text-brand hover:text-brand-hover">{t("sellingInstead")}</Link>
        </div>
      </div>
    </section>
  );
}
