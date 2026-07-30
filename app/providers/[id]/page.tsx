import type { Metadata } from "next";

import { PageHero } from "@/components/page-hero";
import { ProviderDetail } from "@/components/providers/provider-detail";

export const metadata: Metadata = {
  title: "Service",
  description:
    "One entry in the OpenFiat Service Registry (OFS-1500), read live from your access node.",
};

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
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <section className="max-w-3xl">
      <PageHero
        title={decodeURIComponent(id)}
        description="A Service Registry entry (OFS-1500), read live from your access node. Every field below is one the registry actually carries."
      />
      <div className="mt-8">
        <ProviderDetail serviceId={decodeURIComponent(id)} />
      </div>
    </section>
  );
}
