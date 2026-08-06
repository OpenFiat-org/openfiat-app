import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";

import { IdentityClaimsPanel } from "@/components/account/identity-claims";
import { LiveReputationPanel } from "@/components/account/live-reputation";
import { PageHero } from "@/components/page-hero";
import { Panel } from "@/components/panel";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "identity" });
  return { title: t("metaTitle"), description: t("metaDescription") };
}

/**
 * Identity levels as OFS-5000 §8 defines them — a description of what a
 * wallet has chosen to publish, and nothing else.
 *
 * This is documentation, not a claim about the reader. Nothing here is
 * presented as their standing, because no level is stored anywhere: see
 * `components/account/identity-claims.tsx` for what the registry does hold
 * and what the table this replaced was inventing.
 *
 * The wording of each level follows the specification closely on purpose.
 * The previous version paraphrased it into requirements — a company
 * registration number and a beneficial-owner check at Level 2, an uptime
 * percentage and a token bond at Level 3 — none of which the specification
 * asks for and none of which anything in this codebase performs.
 */
/** The four OFS-5000 §8 levels, by index. Titles and bodies are localized copy. */
const LEVEL_INDEXES = [0, 1, 2, 3];

export default function IdentityPage() {
  const t = useTranslations("identity");
  return (
    <section>
      <PageHero
        title={t("heroTitle")}
        description={t("heroDescription")}
      />

      <div className="mt-8">
        <IdentityClaimsPanel />
      </div>

      <div className="mt-8">
        <LiveReputationPanel />
      </div>

      <div className="mt-8">
        <Panel title={t("levelsTitle")}>
          <ol className="divide-y divide-white/5">
            {LEVEL_INDEXES.map((n) => (
              <li key={n} className="px-4 py-4">
                <p className="text-sm text-gray-200">
                  <span className="text-gray-500">{t("levelLabel", { n })}</span> · {t(`levels.${n}.title`)}
                </p>
                <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gray-500">{t(`levels.${n}.body`)}</p>
              </li>
            ))}
          </ol>
          <p className="border-t border-white/10 px-4 py-2.5 text-[11px] text-gray-600">
            {t("levelsFooter")}
          </p>
        </Panel>
      </div>
    </section>
  );
}
