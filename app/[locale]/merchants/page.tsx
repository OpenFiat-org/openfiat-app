import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";

import { MerchantsDirectory } from "@/components/merchants/merchants-directory";
import { PageHero } from "@/components/page-hero";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "merchants" });
  return { title: t("metaTitle"), description: t("metaDescription") };
}

/**
 * The merchant directory.
 *
 * There was no way to browse merchants at all: the order book showed whoever
 * was quoting the pair you were already looking at, and `/merchants/<id>` was
 * reachable only from the fixture data that generated its links.
 *
 * What "merchant" means here, and why the page shows what it shows, is argued
 * in `lib/live-merchants.ts`. The short version: a merchant is a wallet with a
 * live advertisement, because that is the only definition of the set that both
 * a node will enumerate and this protocol is willing to make public.
 */
export default function MerchantsPage() {
  const t = useTranslations("merchants");
  return (
    <section>
      <PageHero
        variant="globe"
        title={t("heroTitle")}
        description={t("heroDescription")}
      />

      <div className="mt-10">
        <MerchantsDirectory />
      </div>
    </section>
  );
}
