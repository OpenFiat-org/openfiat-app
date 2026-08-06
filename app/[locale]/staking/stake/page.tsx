import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { StakeForm } from "@/components/staking/stake-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "staking" });
  return { title: t("stakeMetaTitle"), description: t("stakeMetaDescription") };
}

export default async function StakePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const role = Array.isArray(query.role) ? query.role[0] : query.role;

  return <StakePageBody role={role} />;
}

function StakePageBody({ role }: { role: string | undefined }) {
  const t = useTranslations("staking");
  return (
    <section className="max-w-2xl">
      <h1 className="text-xl font-semibold text-white">{t("stakeHeroTitle")}</h1>
      <p className="mt-1 text-sm text-gray-400">
        {t("stakeHeroIntro")}
      </p>
      <div className="mt-8">
        <StakeForm initialRole={role} />
      </div>
    </section>
  );
}
