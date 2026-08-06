import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { alternatesFor } from "@/lib/seo";
import { Link } from "@/i18n/navigation";
import { OPEN_PRICE_USDC, SALE_PHASES } from "@/lib/sale-terms";
import { DataTable, Td, Th, Tr } from "@/components/data-table";
import { BuyOpen } from "@/components/open/buy-open";
import { PageHero } from "@/components/page-hero";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "open" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: alternatesFor("/open", locale),
  };
}

/** Stable keys for the three specification-fixed sale phases (order fixed in lib). */
const PHASE_KEYS = ["communityPresale", "publicSale", "mainnet"] as const;

/** Stable keys for the four utility rows (order fixed below). */
const UTILITY_KEYS = ["merchantBonds", "staking", "governanceVoting", "protocolFees"] as const;
const UTILITY_HREFS = ["/staking", "/staking", "/governance", "/governance"] as const;

/**
 * What OPEN is for.
 *
 * No figures. Three of these lines used to carry them — "a 5,000 OPEN bond",
 * "1 ad slot per 5,000 OPEN", "arbitrators bond 50,000 OPEN" — and every one
 * was wrong against the deployed `StakingConfig`, which sets the merchant and
 * arbitrator floors at 500 OPEN each. They were not stale by a little: the
 * arbitrator figure was a hundred times the real minimum, on the page whose
 * job is to tell somebody what the token is worth having.
 *
 * The minimums are a governance-updatable on-chain parameter, so any copy of
 * them here is a copy that goes stale silently. `/staking` reads them off the
 * chain and each line links to it.
 */
export default function OpenTokenPage() {
  const t = useTranslations("open");
  return (
    <section>
      <PageHero
        variant="flow"
        title={t("heroTitle")}
        description={t("heroDescription")}
      >
        {/* No "Live" pill. It was a constant, so the page said the sale was
            live whether or not a SaleConfig existed — and none does on this
            cluster. Whether a sale is running is a fact about the chain, and
            `BuyOpen` below is the one place that reads it. The price is a
            [CONFIRMED] specification figure the deployed program enforces,
            so it is safe to state without a chain read. */}
        <p className="font-mono text-sm tabular-nums text-gray-200">
          1 OPEN = {OPEN_PRICE_USDC} USDC
        </p>
      </PageHero>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <BuyOpen />

          <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-gray-400">{t("salePhases")}</h2>
          <div className="mt-3">
            <DataTable
              minWidth={560}
              head={
                <tr>
                  <Th>{t("colPhase")}</Th>
                  <Th right>{t("colPrice")}</Th>
                  <Th right>{t("colAllocation")}</Th>
                </tr>
              }
            >
              {SALE_PHASES.map((p, i) => (
                <Tr key={p.name}>
                  <Td py="py-5" className="font-medium text-white">
                    {t(`phaseName.${PHASE_KEYS[i]}`)}
                    <span className="mt-1 block max-w-md text-xs font-normal text-gray-500">
                      {t(`phaseNote.${PHASE_KEYS[i]}`)}
                    </span>
                  </Td>
                  {/* Null price means market priced — there is no fixed rate
                      after the sale phases, so a figure would be invented. */}
                  <Td py="py-5" right num className="text-gray-200">
                    {p.priceUsdc === null ? "—" : `$${p.priceUsdc.toFixed(2)}`}
                  </Td>
                  <Td py="py-5" right num className="text-gray-400">{t(`phaseAllocation.${PHASE_KEYS[i]}`)}</Td>
                </Tr>
              ))}
            </DataTable>
            {/* The Status column is gone. It held "Live" / "Upcoming" /
                "Upcoming" as constants, which is a claim about the chain
                made without reading it. `BuyOpen` above states whether a
                sale exists, once, from the account itself. */}
            <p className="mt-3 max-w-2xl text-xs leading-relaxed text-gray-500">
              {t("phasesNote")}
            </p>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">{t("whatOpenDoes")}</h2>
          <div className="mt-3 divide-y divide-white/5 border-y border-white/5">
            {UTILITY_KEYS.map((k, i) => (
              <div key={k} className="py-4">
                <p className="font-medium text-white">{t(`utility.${k}.title`)}</p>
                <p className="mt-1 text-sm text-gray-400">{t(`utility.${k}.description`)}</p>
                <Link href={UTILITY_HREFS[i]} className="mt-1.5 inline-block text-xs text-brand hover:text-brand-hover">
                  {t(`utility.${k}.link`)} →
                </Link>
              </div>
            ))}
          </div>
          <p className="mt-4 border-l-2 border-amber-400/50 bg-amber-400/5 px-4 py-2.5 text-xs text-amber-200">
            {t("scamWarning")}
          </p>
        </div>
      </div>
    </section>
  );
}
