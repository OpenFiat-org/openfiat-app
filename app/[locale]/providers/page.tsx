import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { PageHero } from "@/components/page-hero";
import {
  ProvidersDirectory,
  ProvidersMetrics,
} from "@/components/providers/providers-directory";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "providers" });
  return { title: t("metaTitle"), description: t("metaDescription") };
}

/**
 * Counts and rows both come from the registry the selected node reports.
 * They were a fixture: a hand-written directory of invented providers,
 * with an "Avg uptime" averaged over a field the protocol does not have.
 */
export default function ProvidersPage() {
  const t = useTranslations("providers");
  return (
    <section>
      <PageHero
        variant="pulse"
        title={t("heroTitle")}
        description={t("heroDescription")}
        below={
          /* The page said registration was permissionless and then offered no
             way to do it, which is the same as saying nothing. */
          <Link
            href="/providers/register"
            className="inline-block rounded-md bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-hover"
          >
            {t("registerCta")}
          </Link>
        }
      >
        <ProvidersMetrics />
      </PageHero>

      <div className="mt-10">
        <ProvidersDirectory />
      </div>
    </section>
  );
}
