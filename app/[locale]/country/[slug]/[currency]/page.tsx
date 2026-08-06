import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { alternatesFor } from "@/lib/seo";
import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import type { ReferenceData } from "@openfiat/sdk";

import {
  countryBySlug,
  countryViews,
  currenciesFor,
  flagForCountry,
  type CountryView,
} from "@/lib/countries";

import { referenceForRender } from "@/lib/server-reference";
import { CurrencyPaymentMethods } from "@/components/p2p/currency-payment-methods";
import { P2PExchange } from "@/components/p2p/exchange";

interface Params {
  locale: string;
  slug: string;
  currency: string;
}

/**
 * The order book for a country's *second* currency.
 *
 * A sub-route rather than a `?fiat=` parameter on the country page. The
 * parameter version worked, but reading searchParams turned that route
 * dynamic and cost the prerendering on all 253 country pages — which are
 * this app's main indexable surface. A path is also the better shape on its
 * own merits: "buy USDT with USD in Zimbabwe" is a distinct thing people
 * search for, and in a dollarised economy it is frequently the larger book.
 *
 * Which countries have a second currency is the node's answer now, from
 * `alt_currencies`, and no longer a hand-kept map in this repository.
 */
export async function generateStaticParams(): Promise<{ slug: string; currency: string }[]> {
  const reference = await referenceForRender();
  if (!reference) return [];
  return countryViews(reference).flatMap((country) =>
    currenciesFor(country)
      .slice(1)
      .map((code) => ({ slug: country.slug, currency: code.toLowerCase() })),
  );
}

function resolve(
  reference: ReferenceData,
  slug: string,
  currency: string,
): { country: CountryView; code: string } | null {
  const country = countryBySlug(reference, slug);
  if (!country) return null;
  const code = currency.toUpperCase();
  // Only a currency this country actually trades in — otherwise any URL
  // could conjure a market that does not exist here.
  if (!currenciesFor(country).slice(1).includes(code)) return null;
  return { country, code };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug, currency, locale } = await params;
  const reference = await referenceForRender();
  const found = reference ? resolve(reference, slug, currency) : null;
  if (!found) return {};
  const { country, code } = found;
  const t = await getTranslations({ locale, namespace: "countries" });
  return {
    title: { absolute: t("currencyMetaTitle", { code, country: country.name }) },
    // See `app/country/[slug]/page.tsx` on why no rails and no tickers.
    description: t("currencyMetaDescription", { code, country: country.name }),
    alternates: alternatesFor(`/country/${country.slug}/${code.toLowerCase()}`, locale),
  };
}

export default async function CountryCurrencyPage({ params }: { params: Promise<Params> }) {
  const { slug, currency, locale } = await params;
  const t = await getTranslations({ locale, namespace: "countries" });
  const reference = await referenceForRender();

  // A node that could not be reached is not a 404 — see the sibling route's
  // note. A `notFound()` here would claim this market does not exist on the
  // strength of a failed request.
  if (!reference) {
    return (
      <section>
        <Link href="/countries" className="text-sm text-gray-500 hover:text-white">
          {t("allCountries")}
        </Link>
        <h1 className="mt-3 text-xl font-semibold text-white">{t("couldNotReachNode")}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-400">
          {t("couldNotReachBodyCurrency")}
        </p>
      </section>
    );
  }

  const found = resolve(reference, slug, currency);
  if (!found) notFound();
  const { country, code } = found;
  const primaryName =
    reference.currencies.find((c) => c.code === country.currency)?.name ?? country.currency;

  return (
    <section>
      <Link href={`/country/${country.slug}`} className="text-sm text-gray-500 hover:text-white">
        ← {country.name} ({country.currency})
      </Link>
      <h1 className="mt-3 text-xl font-semibold text-white">
        {t("currencyHeading", { country: country.name, code })} {flagForCountry(country.code)}
      </h1>
      <p className="mt-1 max-w-3xl text-sm text-gray-400">
        {t("currencyBody", {
          code,
          country: country.name,
          primaryName,
          currency: country.currency,
        })}
      </p>
      <CurrencyPaymentMethods currency={code} />

      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-400">
        <span className="text-gray-500">{t("otherMarketsHere")}</span>
        {currenciesFor(country)
          .filter((c) => c !== code)
          .map((other) => (
            <Link
              key={other}
              href={
                other === country.currency
                  ? `/country/${country.slug}`
                  : `/country/${country.slug}/${other.toLowerCase()}`
              }
              className="rounded border border-white/10 px-2 py-0.5 font-mono text-xs text-gray-300 hover:border-white/25 hover:text-white"
            >
              {other}
            </Link>
          ))}
      </p>

      <div className="mt-8">
        <P2PExchange
          initialFiat={code}
          showHeading={false}
          savePreference={`${country.slug}-${code.toLowerCase()}`}
        />
      </div>
    </section>
  );
}
