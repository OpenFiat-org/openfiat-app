import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { WithdrawForm } from "@/components/wallet/withdraw-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "walletForms" });
  return { title: t("wdMetaTitle"), description: t("wdMetaDescription") };
}

export default async function WithdrawPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const mint = Array.isArray(query.mint) ? query.mint[0] : query.mint;

  return <WithdrawPageBody mint={mint} />;
}

function WithdrawPageBody({ mint }: { mint: string | undefined }) {
  const t = useTranslations("walletForms");
  return (
    <section className="max-w-2xl">
      <h1 className="text-xl font-semibold text-white">{t("wdHeroTitle")}</h1>
      <p className="mt-1 text-sm text-gray-400">
        {t("wdHeroIntro")}
      </p>
      <div className="mt-8">
        <WithdrawForm initialMint={mint} />
      </div>
    </section>
  );
}
