import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { MerchantProfile } from "@/components/merchants/merchant-profile";

interface Params {
  locale: string;
  id: string;
}

/**
 * One merchant's profile, keyed by the only identity the protocol carries
 * for them: their PeerId, base58, exactly as it appears on every row of the
 * order book.
 *
 * # Why there is no `generateStaticParams` any more
 *
 * There used to be one, enumerating a fixture of 68 invented merchants and
 * prerendering a page for each. There is no roster to enumerate: the
 * protocol has no merchant register, and the set of wallets advertising is
 * a live answer from a node that changes as merchants publish and withdraw.
 * So this is a dynamic route with no build-time list, and `/merchants` is
 * the one indexable entry point (see `app/sitemap.ts`).
 *
 * # Metadata says nothing about the merchant
 *
 * Deliberately. A description here would have to be built at request time
 * from a node read, and a title claiming a trading record would then be a
 * claim this app made about a stranger in somebody else's search results.
 * The page itself says what the node holds, with each figure attributed.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "merchants" });
  return {
    title: t("profileMetaTitle", { short: id.slice(-6) }),
    description: t("profileMetaDescription"),
    // Not indexed. Which wallets are merchants is a live answer from a node,
    // and a crawler has none — it would index whoever happened to be
    // advertising when it called, under a URL that may later describe nobody.
    robots: { index: false, follow: true },
  };
}

export default async function MerchantProfilePage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  return <MerchantProfile peerId={id} />;
}
