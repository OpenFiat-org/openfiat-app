import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { StakingRolesPanel } from "@/components/staking/staking-roles-panel";
import { PageHero } from "@/components/page-hero";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "staking" });
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default function StakingPage() {
  const t = useTranslations("staking");
  return (
    <section>
      <PageHero
        variant="bloom"
        title={t("heroTitle")}
        description={t("heroDescription")}
      />
      {/*
        * A metric strip stating "Unstake cooldown — 7 days" used to sit
        * here, with a comment arguing it was "a fixed protocol parameter,
        * not a per-request live value, so it's safe to state directly
        * rather than fetch". It was not fixed: `StakingConfig` replaced the
        * flat `unbonding_period_secs` with a per-role array, and this
        * cluster now holds 24 hours for a merchant, 3 days for an
        * arbitrator and 7 days for everyone else. The claim was wrong for
        * two of the roles on the page listing them.
        *
        * The general lesson is worth keeping over the specific number: a
        * governance-updatable on-chain field is never safe to state
        * directly, because nothing tells this app when it moves. Each row
        * below carries its own period, read from the same account as its
        * minimum.
        */}

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-gray-400">{t("stakeByRole")}</h2>
      <div className="mt-3">
        <StakingRolesPanel />
      </div>

      <p className="mt-6 border-l-2 border-white/15 px-4 py-2 text-sm text-gray-400">
        {t.rich("unstakingFootnote", {
          code: (chunks) => <code className="text-gray-300">{chunks}</code>,
        })}
      </p>
    </section>
  );
}
