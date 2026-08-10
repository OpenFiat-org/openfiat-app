import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { NETWORK_LABEL, SOLANA_CLUSTER, TOKENS_ARE_WORTHLESS } from "@/lib/node-endpoint";
import { BalancesPanel } from "@/components/wallet/balances-panel";
import { PageHero } from "@/components/page-hero";
import { VaultsPanel } from "@/components/wallet/vaults-panel";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "wallet" });
  return {
    title: t("title"),
    description: t("metaDescription"),
  };
}

/**
 * Everything on this page is read from Solana devnet for the connected
 * wallet. Nothing renders without one, which is the point: the version
 * this replaced showed four funded vaults and $9,428 of balances to every
 * visitor, wallet or no wallet, working cluster or not.
 */
export default function WalletPage() {
  const t = useTranslations("wallet");
  // Own namespace, not `wallet`'s: `bridgeFunds` is new (SP-C Task 2) and
  // not yet translated into every locale `wallet` itself already is —
  // keeping this one key under its own namespace, rather than adding it to
  // `wallet`, avoids requiring every locale that already has `wallet` to
  // gain this key too (`tests/messages.test.ts` enforces every namespace a
  // locale touches at all is complete, never half-translated).
  const tFunds = useTranslations("bridgeFunds");
  return (
    <section>
      <PageHero
        variant="bloom"
        title={t("title")}
        description={
          t("heroDescription", { cluster: SOLANA_CLUSTER }) +
          (TOKENS_ARE_WORTHLESS ? t("worthlessSuffix", { network: NETWORK_LABEL }) : "")
        }
      >
        <div className="flex gap-2.5">
          <Link
            href="/wallet/deposit"
            className="rounded-md bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            {t("deposit")}
          </Link>
          <Link
            href="/wallet/withdraw"
            className="rounded-md border border-white/15 px-5 py-2 text-sm font-medium text-gray-200 hover:bg-white/5"
          >
            {t("withdraw")}
          </Link>
          <Link
            href="/wallet/funds"
            className="rounded-md border border-white/15 px-5 py-2 text-sm font-medium text-gray-200 hover:bg-white/5"
          >
            {tFunds("walletPageLink")}
          </Link>
        </div>
      </PageHero>

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-gray-400">{t("vaultsHeading")}</h2>
      <p className="mt-1 max-w-3xl text-sm text-gray-500">
        {t("vaultsIntro")}
      </p>
      <div className="mt-4">
        <VaultsPanel />
      </div>

      <h2 className="mt-12 text-sm font-semibold uppercase tracking-wider text-gray-400">{t("balancesHeading")}</h2>
      <p className="mt-1 max-w-3xl text-sm text-gray-500">
        {t("balancesIntro")}
      </p>
      <div className="mt-4">
        <BalancesPanel />
      </div>
    </section>
  );
}
