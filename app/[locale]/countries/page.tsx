import type { Metadata } from "next";
import { alternatesFor } from "@/lib/seo";
import { CountryIndex } from "@/components/p2p/country-index";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
  title: "P2P Exchange by Country",
  description:
    "Buy and sell USDT, USDC, USD1, and SOL peer-to-peer in every country — local currencies, local payment methods, escrow enforced by Solana programs.",
    alternates: alternatesFor("/countries", locale),
  };
}

export default function P2PIndexPage() {
  return <CountryIndex />;
}
