import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { alternatesFor } from "@/lib/seo";
import { Link } from "@/i18n/navigation";
import { PROVIDER_TYPES } from "@/lib/provider-display";
import type { ServiceType } from "@/lib/types";
import { PageHero } from "@/components/page-hero";
import { Panel } from "@/components/panel";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "providers" });
  return {
    title: t("regMetaTitle"),
    description: t("regMetaDescription"),
    alternates: alternatesFor("/providers/register", locale),
  };
}

/** OFS-1500 §5 identity prerequisites, §7 registration fields, and the five steps — keys only; copy is translated. */
const IDENTITY_KEYS = ["wallet", "nodeIdentity", "peerId", "publicKey"] as const;
const REGISTRATION_KEYS = [
  "serviceId", "serviceType", "providerIdentity", "networkEndpoints", "supportedVersions",
  "region", "capabilities", "branding", "pricing", "timestampSignature",
] as const;
const STEP_KEYS = ["runService", "identity", "signEvent", "healthUpdates", "getSelected"] as const;

export default function RegisterProviderPage() {
  const t = useTranslations("providers");
  return (
    <section>
      <PageHero
        variant="pulse"
        title={t("regHeroTitle")}
        description={t("regHeroDescription")}
      />

      <div className="mt-10 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <Panel title={t("stepsTitle")}>
            <ol className="divide-y divide-white/5">
              {STEP_KEYS.map((key, i) => (
                <li key={key} className="flex gap-4 px-4 py-4">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/15 text-xs tabular-nums text-gray-400">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-white">{t(`step.${key}.title`)}</p>
                    <p className="mt-1 text-sm leading-relaxed text-gray-400">{t(`step.${key}.body`)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel title={t("regEventTitle")}>
            <dl className="divide-y divide-white/5">
              {REGISTRATION_KEYS.map((key) => (
                <div key={key} className="px-4 py-3">
                  <dt className="text-sm font-medium text-gray-200">{t(`reg.${key}.label`)}</dt>
                  <dd className="mt-0.5 text-xs leading-relaxed text-gray-500">{t(`reg.${key}.detail`)}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title={t("identityTitle")}>
            <dl className="divide-y divide-white/5">
              {IDENTITY_KEYS.map((key) => (
                <div key={key} className="px-4 py-3">
                  <dt className="text-sm font-medium text-gray-200">{t(`identity.${key}.label`)}</dt>
                  <dd className="mt-0.5 text-xs leading-relaxed text-gray-500">{t(`identity.${key}.detail`)}</dd>
                </div>
              ))}
            </dl>
          </Panel>

          <Panel title={t("serviceTypesTitle")}>
            <ul className="divide-y divide-white/5">
              {(Object.keys(PROVIDER_TYPES) as ServiceType[]).map((type) => (
                <li key={type} className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="text-gray-300">{t(`providerType.${type}`)}</span>
                  <span className="shrink-0 text-xs text-gray-600">{type}</span>
                </li>
              ))}
            </ul>
            <p className="border-t border-white/10 px-4 py-2.5 text-[11px] leading-relaxed text-gray-500">
              {t("serviceTypesNote")}
            </p>
          </Panel>

          <Panel title={t("noStakeTitle")}>
            <p className="px-4 py-3 text-xs leading-relaxed text-gray-500">
              {t("noStakeBody")}
            </p>
          </Panel>

          <Link
            href="/providers"
            className="block rounded-md border border-white/10 px-4 py-3 text-center text-sm text-gray-300 hover:border-white/25 hover:text-white"
          >
            {t("seeRegistered")}
          </Link>
        </div>
      </div>
    </section>
  );
}
