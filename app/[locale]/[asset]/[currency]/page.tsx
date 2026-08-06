import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { alternatesFor } from "@/lib/seo";
import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";

import { AssetIcon } from "@/components/asset-icon";
import { P2PExchange } from "@/components/p2p/exchange";
import { PairConverter } from "@/components/pairs/converter";
import { formatNumber } from "@/lib/format";
import type { RateLookup } from "@/lib/live-oracle";
import { normalisePair } from "@/lib/pairs";
import { loadPairData } from "./pair-data";

interface Params {
  locale: string;
  asset: string;
  currency: string;
}

/**
 * A landing page per asset/fiat pair — /usdt/kes, /usdc/ngn.
 *
 * People search "convert USDT to KES", not "peer-to-peer exchange", and a
 * page titled for the query is the only thing that answers it. Each one
 * carries the rate, a converter, the live order book for that pair, the local
 * payment rails and prose written to the question rather than about the
 * product.
 *
 * # Dynamic, with no `generateStaticParams`
 *
 * The version this replaces pre-rendered one page per entry in `PAIRS`, a
 * constant crossing a markets fixture with fifteen hand-written exchange
 * rates. Those rates were the headline number, the converter's basis, the
 * meta description and the figure on the OpenGraph card — so a shared link
 * carried an invented price into somebody else's timeline.
 *
 * There is no build-time set to enumerate now, for the same reason
 * `/providers/[id]` has none: which pairs are priced is whatever oracles have
 * published and not yet let lapse, and on devnet a publish lasts three hours.
 * A list fixed at build time would be stale by the afternoon.
 *
 * A pair nobody prices still renders rather than 404ing, and says so. "No
 * oracle publishes this pair" and "this URL is not a pair" are different
 * answers; only the second is a 404, and `normalisePair` is what decides it.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { asset, currency, locale } = await params;
  const pair = await normalisePair(asset, currency);
  if (!pair) return {};

  const t = await getTranslations({ locale, namespace: "pair" });
  const { rate, advertisers, methods } = await loadPairData(pair);
  const canonical = { alternates: alternatesFor(`/${pair.slug}`, locale) };

  // No rate, no number in the description. A meta description is the one
  // string that outlives the page in a search result, so a figure here that
  // the page itself refuses to show would be the most durable version of
  // exactly the error this page was fixed for.
  if (rate.kind !== "current") {
    return {
      title: { absolute: t("metaTitleNoRate", { label: pair.label, currency: pair.currency }) },
      description: t("metaDescNoRate", { label: pair.label, currency: pair.currency }),
      ...canonical,
    };
  }

  const rails = methods.slice(0, 3).join(", ");
  const advertiserPhrase =
    advertisers > 0
      ? t("metaAdvertiserPhrase", { advertisers, rails: rails || "none" })
      : "";
  return {
    title: { absolute: t("metaTitle", { label: pair.label, currency: pair.currency }) },
    description: t("metaDesc", {
      label: pair.label,
      currency: pair.currency,
      rate: formatNumber(rate.rate),
      advertiserPhrase,
    }),
    ...canonical,
  };
}

export default async function PairPage({ params }: { params: Promise<Params> }) {
  const { asset, currency } = await params;
  const pair = await normalisePair(asset, currency);
  if (!pair) notFound();

  const data = await loadPairData(pair);
  return <PairView pair={pair} data={data} />;
}

type PairData = Awaited<ReturnType<typeof loadPairData>>;
type Pair = NonNullable<Awaited<ReturnType<typeof normalisePair>>>;

function PairView({ pair, data }: { pair: Pair; data: PairData }) {
  const t = useTranslations("pair");
  const { rate, advertisers, methods, countries, priced, unreachable } = data;

  const countryList = countries.slice(0, 4).join(", ");
  const more = countries.length - 4;
  /*
   * Sideways links, to pairs an oracle is currently pricing.
   *
   * `pricedPairs` upper-cases every base it returns, because an oracle's
   * `base` is a free string on a record rather than a name the node
   * resolved. `pair.asset` is the node's own spelling — `wSOL`, not `WSOL` —
   * so these two comparisons have to fold case or a page would offer itself
   * as one of its own "other assets".
   *
   * `pair.asset` and not `pair.label`: an oracle record's base is whatever
   * the feed publishes, which has nothing to do with what this app decided
   * to print, and matching on the printed name would make a page list
   * itself under "other assets" for the one mint where the two differ.
   */
  const sameAsset = (base: string) => base.toUpperCase() === pair.asset.toUpperCase();
  const otherAssets = priced.filter((p) => p.quote === pair.currency && !sameAsset(p.base));
  const otherCurrencies = priced.filter((p) => sameAsset(p.base) && p.quote !== pair.currency);

  return (
    <section>
      <nav className="text-sm text-gray-500">
        <Link href="/" className="hover:text-white">
          {t("breadcrumbExchange")}
        </Link>
        <span className="mx-2 text-gray-700">/</span>
        <span className="text-gray-400">
          {pair.label}/{pair.currency}
        </span>
      </nav>

      <h1 className="mt-3 flex flex-wrap items-center gap-2.5 text-xl font-semibold text-white">
        <AssetIcon asset={pair.label} size={22} />
        {t("convertHeading", { label: pair.label, currency: pair.currency })}
      </h1>

      {/* The answer, immediately — or, when there isn't one, which of the two
          reasons it is, since only one of them is worth waiting out. */}
      <Rate pair={pair} rate={rate} unreachable={unreachable} />

      {rate.kind === "current" && (
        <div className="mt-6 max-w-md">
          <PairConverter asset={pair.label} currency={pair.currency} rate={rate.rate} />
        </div>
      )}

      <div className="mt-8 max-w-3xl space-y-4 text-sm leading-relaxed text-gray-400">
        {advertisers > 0 ? (
          <p>
            {t("advertisersLine", {
              advertisers,
              label: pair.label,
              currency: pair.currency,
              methods: methods.length > 0 ? methods.slice(0, 3).join(", ") : "none",
              more: methods.length > 3 ? "yes" : "no",
            })}
          </p>
        ) : (
          <p>{t("noAdvertisersLine", { label: pair.label, currency: pair.currency })}</p>
        )}
        <p>{t("escrowLine", { label: pair.label, currency: pair.currency })}</p>
        {countries.length > 0 && (
          <p>
            {t("currencyLine", {
              currency: pair.currency,
              countries: countryList,
              more: more > 0 ? "yes" : "no",
              moreCount: more,
              isUsd: pair.currency === "USD" ? "yes" : "no",
            })}
          </p>
        )}
      </div>

      {/* The live book for exactly this pair. */}
      <div className="mt-10">
        <P2PExchange
          initialFiat={pair.currency}
          showHeading={false}
          savePreference={`pair-${pair.slug}`}
        />
      </div>

      <div className="mt-12 grid gap-8 border-t border-white/10 pt-8 sm:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
            {t("otherAssetsHeading", { currency: pair.currency })}
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {otherAssets.map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/${p.slug}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-sm text-gray-300 hover:border-white/25 hover:text-white"
                >
                  <AssetIcon asset={p.base} size={14} />
                  {p.base}/{p.quote}
                </Link>
              </li>
            ))}
            {otherAssets.length === 0 && (
              <li className="text-sm text-gray-500">
                {t("noOtherAssets", { currency: pair.currency })}
              </li>
            )}
          </ul>
        </div>

        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
            {t("otherCurrenciesHeading", { label: pair.label })}
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {otherCurrencies.map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/${p.slug}`}
                  className="rounded-md border border-white/10 px-2.5 py-1.5 text-sm text-gray-300 hover:border-white/25 hover:text-white"
                >
                  {p.base}/{p.quote}
                </Link>
              </li>
            ))}
            {otherCurrencies.length === 0 && (
              <li className="text-sm text-gray-500">
                {t("noOtherCurrencies", { label: pair.label })}
              </li>
            )}
          </ul>
        </div>
      </div>
    </section>
  );
}

/**
 * The headline number, or the reason there isn't one.
 *
 * Neither failure shows a figure. OFS-7000 §12 says expired data should not
 * be treated as current, and a last-known rate printed under a caption is
 * read as the rate no matter what the caption says — so a lapsed feed gets
 * words, not a number with an asterisk.
 */
function Rate({
  pair,
  rate,
  unreachable,
}: {
  pair: { label: string; currency: string };
  rate: RateLookup;
  unreachable: boolean;
}) {
  const t = useTranslations("pair");
  if (rate.kind === "current") {
    const median =
      rate.contributors === null
        ? t("rateMedianAll")
        : t("rateMedianN", { contributors: rate.contributors });
    return (
      <>
        <p className="mt-3 text-2xl font-semibold tabular-nums text-white">
          {t.rich("rateLine", {
            label: pair.label,
            rate: formatNumber(rate.rate),
            currency: pair.currency,
            v: (chunks) => <span className="text-brand-teal">{chunks}</span>,
          })}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          {/* Omitted rather than guessed when the answer did not carry it —
              see `RateLookup`. The median is still the median either way. */}
          {t("rateContext", { median, until: new Date(rate.expiresAt).toLocaleString() })}
        </p>
      </>
    );
  }

  if (unreachable) {
    return (
      <p className="mt-3 max-w-2xl text-sm text-amber-300">
        {t("unreachableRate", { label: pair.label, currency: pair.currency })}
      </p>
    );
  }

  if (rate.kind === "stale") {
    return (
      <p className="mt-3 max-w-2xl text-sm text-amber-300">
        {t("staleRate", {
          label: pair.label,
          currency: pair.currency,
          lapsed: rate.lapsedAt === null ? "none" : "yes",
          lapsedAt: rate.lapsedAt === null ? "" : new Date(rate.lapsedAt).toLocaleString(),
        })}
      </p>
    );
  }

  return (
    <p className="mt-3 max-w-2xl text-sm text-gray-400">
      {t("noOracleRate", { label: pair.label, currency: pair.currency })}
    </p>
  );
}
