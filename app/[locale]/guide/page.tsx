import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { alternatesFor } from "@/lib/seo";
import { Link } from "@/i18n/navigation";
import { PageHero } from "@/components/page-hero";
import { Panel } from "@/components/panel";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "guide.index" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: alternatesFor("/guide", locale),
  };
}

export default function GuidePage() {
  const t = useTranslations("guide.index");
  const glossary = t.raw("glossary") as Array<[string, string]>;
  const safetyTips = t.raw("safetyTips") as string[];
  return (
    <section>
      <PageHero
        variant="flow"
        title={t("heroTitle")}
        description={t("heroDescription")}
      />

      <div className="mt-10 max-w-3xl">
        {/* On-ramp / off-ramp deep-dives */}
        <div className="divide-y divide-white/5 border-y border-white/5">
          <Link href="/guide/buy" className="group flex items-center justify-between gap-4 py-5">
            <div>
              <p className="font-medium text-white group-hover:text-brand-hover">
                {t("onrampTitle")}
              </p>
              <p className="mt-1 text-sm text-gray-400">
                {t("onrampDesc")}
              </p>
            </div>
            <span className="text-gray-600 group-hover:text-brand-hover">→</span>
          </Link>
          <Link href="/guide/sell" className="group flex items-center justify-between gap-4 py-5">
            <div>
              <p className="font-medium text-white group-hover:text-brand-hover">
                {t("offrampTitle")}
              </p>
              <p className="mt-1 text-sm text-gray-400">
                {t("offrampDesc")}
              </p>
            </div>
            <span className="text-gray-600 group-hover:text-brand-hover">→</span>
          </Link>
          <Link href="/guide/merchant" className="group flex items-center justify-between gap-4 py-5">
            <div>
              <p className="font-medium text-white group-hover:text-brand-hover">
                {t("merchantTitle")}
              </p>
              <p className="mt-1 text-sm text-gray-400">
                {t("merchantDesc")}
              </p>
            </div>
            <span className="text-gray-600 group-hover:text-brand-hover">→</span>
          </Link>
        </div>

        {/* What is P2P */}
        <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-gray-400">{t("whatIsHeading")}</h2>
        <p className="mt-3 text-sm leading-relaxed text-gray-300">
          {t("whatIsBody")}
        </p>

        {/* Glossary */}
        <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-gray-400">{t("keyTermsHeading")}</h2>
        <div className="mt-3">
          <Panel>
            <ol className="divide-y divide-white/5">
              {glossary.map(([term, def]) => (
                <li key={term} className="px-4 py-3.5 text-sm">
                  <span className="font-medium text-white">{term}</span>
                  <span className="mt-0.5 block text-gray-400">{def}</span>
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        {/* Safety tips */}
        <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-gray-400">{t("safetyHeading")}</h2>
        <ul className="mt-3 space-y-2.5">
          {safetyTips.map((tip) => (
            <li key={tip} className="flex gap-2.5 border-l-2 border-amber-400/50 pl-3 text-sm text-gray-300">
              {tip}
            </li>
          ))}
        </ul>

        <div className="mt-10 flex flex-wrap gap-6 border-t border-white/10 pt-6 text-sm">
          <Link href="/" className="text-brand hover:text-brand-hover">{t("startTrading")}</Link>
          <Link href="/orders" className="text-brand hover:text-brand-hover">{t("yourOrders")}</Link>
          <Link href="/disputes" className="text-brand hover:text-brand-hover">{t("appealsDisputes")}</Link>
        </div>
      </div>
    </section>
  );
}
