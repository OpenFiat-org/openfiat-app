import type { Metadata } from "next";
import { CountryIndex } from "@/components/p2p/country-index";

export const metadata: Metadata = {
  title: "P2P Exchange by Country",
  description:
    "Buy and sell USDT, USDC, USD1, and SOL peer-to-peer in every country — local currencies, local payment methods, escrow enforced by Solana programs.",
  alternates: { canonical: "/countries" },
};

export default function P2PIndexPage() {
  return <CountryIndex />;
}
