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
  const t = await getTranslations({ locale, namespace: "guide.merchant" });
  return {
    title: { absolute: t("metaTitle") },
    description: t("metaDescription"),
    alternates: alternatesFor("/guide/merchant", locale),
  };
}

export default function MerchantGuidePage() {
  const t = useTranslations("guide.merchant");
  const steps = t.raw("steps") as Array<[string, string]>;
  const obligations = t.raw("obligations") as string[];
  return (
    <section>
      <PageHero
        variant="bloom"
        title={t("heroTitle")}
        description={t("heroDescription")}
      />

      <div className="mt-10 max-w-3xl">
        <div className="rounded-md border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-gray-300">
          {t.rich("bondNote", {
            link: (chunks) => (
              <Link href="/staking" className="underline decoration-white/30 underline-offset-4">
                {chunks}
              </Link>
            ),
          })}
        </div>

        <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-gray-400">
          {t("stepByStep")}
        </h2>
        <div className="mt-3">
          <StepList steps={steps} />
        </div>

        <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-gray-400">
          {t("obligationsHeading")}
        </h2>
        <ul className="mt-3 space-y-2.5">
          {obligations.map((o) => (
            <li key={o} className="border-l-2 border-amber-400/50 pl-3 text-sm text-gray-300">
              {o}
            </li>
          ))}
        </ul>

        <div className="mt-10 flex flex-wrap gap-6 border-t border-white/10 pt-6 text-sm">
          <Link href="/become-a-merchant" className="text-brand hover:text-brand-hover">
            {t("checkStanding")}
          </Link>
          <Link href="/ads/new" className="text-brand hover:text-brand-hover">
            {t("postFirstAd")}
          </Link>
          <Link href="/staking" className="text-brand hover:text-brand-hover">
            {t("bondOpen")}
          </Link>
          <Link href="/wallet" className="text-brand hover:text-brand-hover">
            {t("fundVault")}
          </Link>
        </div>
      </div>
    </section>
  );
}
