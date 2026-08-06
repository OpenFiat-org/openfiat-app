import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHero } from "@/components/page-hero";
import { ProviderDetail } from "@/components/providers/provider-detail";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "providers" });
  return { title: t("idMetaTitle"), description: t("idMetaDescription") };
}

/**
 * Dynamic, with no `generateStaticParams`.
 *
 * The version this replaces pre-rendered one page per entry in a fixture,
 * which is how nineteen invented services ended up in the sitemap and in
 * search results. There is no build-time set of ids to enumerate: the
 * registry changes as providers register and expire, and it belongs to
 * whichever node the visitor selected — two visitors on different access
 * nodes can legitimately see different sets.
 *
 * So the id is resolved in the browser against the selected node, and a
 * service the registry does not have says so rather than 404ing, because
 * "this node has not replicated it" and "it does not exist" are different
 * answers and only the node can tell them apart.
 */
export default async function ProviderPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "providers" });

  return (
    <>
      {/* Outside the reading column: `PageHero` is a full-bleed band that
          escapes its parent assuming the parent is the page's centred content
          column, so nesting it in the `max-w-3xl` below dragged it off the
          left edge and cut the service id out of view. Same defect as
          `app/settings/page.tsx`, which is where it was found. */}
      <PageHero
        title={decodeURIComponent(id)}
        description={t("idHeroDescription")}
      />
      <section className="mt-10 max-w-3xl">
        <ProviderDetail serviceId={decodeURIComponent(id)} />
      </section>
    </>
  );
}
