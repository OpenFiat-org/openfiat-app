import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

import { AdWizard } from "@/components/ads/ad-wizard";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "ads" });
  return { title: t("newMetaTitle"), description: t("newMetaDescription") };
}

export default function NewAdPage() {
  const t = useTranslations("ads");
  return (
    <section>
      <h1 className="text-xl font-semibold text-white">{t("newHeroTitle")}</h1>
      <p className="mt-1 max-w-2xl text-sm text-gray-400">
        {t.rich("newHeroIntro", {
          link: (chunks) => (
            <Link href="/become-a-merchant" className="text-brand hover:text-brand-hover">
              {chunks}
            </Link>
          ),
        })}
      </p>
      <div className="mt-8">
        <AdWizard />
      </div>
    </section>
  );
}
