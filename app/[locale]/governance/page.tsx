import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

import { GovernanceProposalsPanel } from "@/components/governance/governance-proposals-panel";
import { NetworkProposalsPanel } from "@/components/governance/network-proposals-panel";
import { PageHero } from "@/components/page-hero";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "governance" });
  return { title: t("metaTitle"), description: t("metaDescription") };
}

/**
 * Governance, in the two registers it actually exists in.
 *
 * This page used to show one of them — the `openfiat-governance` program's
 * `Proposal` accounts — and so could only ever show fingerprints, because
 * the program stores the title and summary as SHA-256 hashes and nothing
 * else. The words live in the off-chain records every node gossips, which
 * nothing in this app could read or write.
 *
 * Both are here, kept apart and labelled, because they are not the same
 * list and a merged one would have to invent a correspondence. Where a
 * correspondence really exists it is a two-sided, signed claim, and a
 * proposal's own page reports it — including the case where the two
 * records disagree, which is the case a single-register view could never
 * surface.
 */
export default function GovernancePage() {
  const t = useTranslations("governance");
  return (
    <section>
      <PageHero
        variant="ballot"
        title={t("heroTitle")}
        description={t("heroDescription")}
      />

      <div className="mt-10 space-y-12">
        <div>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-white">{t("networkProposalsHeading")}</h2>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-gray-500">
                {t("networkProposalsNote")}
              </p>
            </div>
            <Link
              href="/governance/new"
              className="shrink-0 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
            >
              {t("fileProposal")}
            </Link>
          </div>
          <div className="mt-5">
            <NetworkProposalsPanel />
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-white">{t("onchainProposalsHeading")}</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-gray-500">
            {t.rich("onchainProposalsNote", { code: (c) => <code>{c}</code> })}
          </p>
          <div className="mt-5">
            <GovernanceProposalsPanel />
          </div>
        </div>
      </div>
    </section>
  );
}
