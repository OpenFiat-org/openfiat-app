import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { P2PExchange } from "@/components/p2p/exchange";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "exchange" });
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default function P2PPage() {
  // Server render is always the deterministic International view; the
  // remembered country preference (localStorage) is applied post-mount.
  return <P2PExchange rememberPreference showExplainer />;
}
