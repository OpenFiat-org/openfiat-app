import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

import { PageHero } from "@/components/page-hero";
import { LiveNetwork } from "@/components/network/live-network";
import { NodeOperations } from "@/components/network/node-operations";
import { NETWORK_LABEL } from "@/lib/node-endpoint";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "network" });
  return { title: t("metaTitle"), description: t("metaDescription") };
}

/**
 * This page used to render `lib/data/network.ts`: 128 nodes online, 3,412
 * peers, block height 312,445,902, epoch 742, and a table of ten nodes with
 * invented regions, versions and latencies — none of which existed. It also
 * carried a static "protocol event stream" of hand-written events, captioned
 * "a live node would stream these in real time" while sitting next to a live
 * node that could have done exactly that.
 *
 * Everything now comes from `knownNodes()` and a live request per node. The
 * event stream moved to /explorer, which already subscribes to the real feed
 * rather than describing one.
 */
export default function NetworkPage() {
  const t = useTranslations("network");
  return (
    <section>
      <PageHero
        variant="mesh"
        title={t("heroTitle")}
        description={t("heroDescription", { label: NETWORK_LABEL })}
      >
        <LiveNetwork />
      </PageHero>

      {/*
        * Below the cluster view rather than beside it, because it answers a
        * different question. Above is "which nodes exist and can I reach
        * them"; this is "what is the one I am talking to actually doing" —
        * its peers, and the snapshots it holds. Merging them would present
        * one node's discovery cache as the network's census.
        */}
      <NodeOperations />

      <p className="mt-10 text-sm text-gray-400">
        {t.rich("footerFeed", {
          ex: (chunks) => (
            <Link href="/explorer" className="text-brand-hover hover:underline">
              {chunks}
            </Link>
          ),
          sr: (chunks) => (
            <Link href="/providers" className="text-brand-hover hover:underline">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </section>
  );
}
