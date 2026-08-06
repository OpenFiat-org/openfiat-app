import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { DepositForm } from "@/components/wallet/deposit-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "walletForms" });
  return { title: t("depMetaTitle"), description: t("depMetaDescription") };
}

export default async function DepositPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  // A mint address, not an asset ticker. Vaults are keyed by mint on chain
  // and two mints can share a ticker, so the vault table links with the real
  // address and this page never has to guess which one was meant.
  const mint = Array.isArray(query.mint) ? query.mint[0] : query.mint;

  return <DepositPageBody mint={mint} />;
}

function DepositPageBody({ mint }: { mint: string | undefined }) {
  const t = useTranslations("walletForms");
  return (
    <section className="max-w-2xl">
      <h1 className="text-xl font-semibold text-white">{t("depHeroTitle")}</h1>
      <p className="mt-1 text-sm text-gray-400">
        {t("depHeroIntro")}
      </p>
      <div className="mt-8">
        <DepositForm initialMint={mint} />
      </div>
    </section>
  );
}
