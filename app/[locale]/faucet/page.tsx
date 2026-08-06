import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { FaucetForm } from "@/components/faucet/faucet-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "faucet" });
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default function FaucetPage() {
  const t = useTranslations("faucet");
  return (
    <section className="max-w-2xl">
      <h1 className="text-xl font-semibold text-white">{t("heroTitle")}</h1>
      <p className="mt-1 text-sm text-gray-400">
        {t("heroIntro")}
      </p>
      {/*
       * The top bar already carries a persistent devnet/no-value banner
       * (components/top-nav.tsx) — this doesn't repeat that wording, but
       * adds the one fact specific to this page: these are not real USDC or
       * USDT, just devnet-only mints this faucet controls, and they cannot
       * be redeemed for or converted into anything.
       */}
      <p className="mt-3 rounded-md border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs text-amber-200/90">
        {t("notReal")}
      </p>
      <p className="mt-1 text-[11px] text-gray-600">
        {t("separateService")}
      </p>
      <div className="mt-8">
        <FaucetForm />
      </div>
    </section>
  );
}
