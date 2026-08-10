import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { BridgeFunds } from "@/components/funds/bridge-funds";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "bridgeFunds" });
  return { title: t("title") };
}

/**
 * Non-custodial USDC/USDT deposit and withdraw between another chain and
 * the user's own Solana wallet, via deBridge's DLN — SP-C Task 2. Distinct
 * from `/wallet/deposit`/`/wallet/withdraw`, which move tokens between a
 * connected Solana wallet and this app's own liquidity vaults; this page
 * never touches an OpenFiat program at all (see `components/funds/bridge-funds.tsx`'s
 * own doc for why).
 */
export default function FundsPage() {
  const t = useTranslations("bridgeFunds");
  return (
    <section className="max-w-2xl">
      <h1 className="text-xl font-semibold text-white">{t("title")}</h1>
      <div className="mt-8">
        <BridgeFunds />
      </div>
    </section>
  );
}
