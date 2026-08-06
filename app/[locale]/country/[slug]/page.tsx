import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

import { countryBySlug, countryViews, currenciesFor, flagForCountry } from "@/lib/countries";
import { localizedCurrencyName } from "@/lib/display-names";
import { alternatesFor } from "@/lib/seo";

import { referenceForRender } from "@/lib/server-reference";
import { CurrencyPaymentMethods } from "@/components/p2p/currency-payment-methods";
import { P2PExchange } from "@/components/p2p/exchange";

interface Params {
  locale: string;
  slug: string;
}

/**
 * One page per country the node lists.
 *
 * # Prerendered from the node, not from a table
 *
 * The list used to be `lib/data/countries.ts` — 253 rows compiled into this
 * bundle, with their own currencies and their own second currencies. It is
 * gone (see `lib/countries.ts`), so the params come from the node at build
 * time and the slug is `countrySlug(name)`, which is what that table
 * computed anyway.
 *
 * A build that cannot reach a node prerenders none of these. The route still
 * works — it renders on demand — and the page below says it could not reach
 * a node rather than reporting that the country does not exist. That
 * distinction is the whole reason this returns `[]` instead of falling back
 * to a list: a 404 is this app stating "there is no such country", and a
 * failed request is no grounds for stating it.
 */
// Only this segment's own param. Next composes `locale` from the parent
// `[locale]` layout's `generateStaticParams`, so returning `locale` here too
// would be both redundant and the wrong shape.
export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const reference = await referenceForRender();
  if (!reference) return [];
  return countryViews(reference).map((country) => ({ slug: country.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug, locale } = await params;
  const reference = await referenceForRender();
  const country = reference ? countryBySlug(reference, slug, locale) : undefined;
  if (!country) return {};
  const t = await getTranslations({ locale, namespace: "countries" });
  const currencyName = localizedCurrencyName(
    country.currency,
    reference?.currencies.find((c) => c.code === country.currency)?.name ?? country.currency,
    locale,
  );
  return {
    // Localized name in the title/description, since a search result is exactly
    // where a reader searching in their own language needs to recognize the
    // market.
    title: { absolute: t("slugMetaTitle", { country: country.displayName }) },
    description: t("slugMetaDescription", {
      currencyName,
      currency: country.currency,
      country: country.displayName,
    }),
    // Self-referential canonical for this locale plus the full hreflang set, so
    // search engines learn this page exists in all 27 languages.
    alternates: alternatesFor(`/country/${country.slug}`, locale),
  };
}

export default async function CountryP2PPage({ params }: { params: Promise<Params> }) {
  const { slug, locale } = await params;
  const t = await getTranslations({ locale, namespace: "countries" });
  const reference = await referenceForRender();

  /*
   * Three outcomes, and only one of them is a 404.
   *
   * A node that answered and does not list this slug means the country does
   * not exist on this network, which is a real "not found". A node that
   * could not be reached means nothing of the kind, and rendering the same
   * page for both would turn every outage into 253 pages claiming the
   * network does not serve anywhere.
   */
  if (!reference) {
    return (
      <section>
        <Link href="/countries" className="text-sm text-gray-500 hover:text-white">
          {t("allCountries")}
        </Link>
        <h1 className="mt-3 text-xl font-semibold text-white">{t("couldNotReachNode")}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-400">
          {t("couldNotReachBody")}
        </p>
      </section>
    );
  }

  const country = countryBySlug(reference, slug, locale);
  if (!country) {
    return (
      <section>
        <Link href="/countries" className="text-sm text-gray-500 hover:text-white">
          {t("allCountries")}
        </Link>
        <h1 className="mt-3 text-xl font-semibold text-white">{t("noSuchMarket")}</h1>
        <p className="mt-2 max-w-2xl text-sm text-gray-400">
          {t("noSuchMarketBody")}
        </p>
      </section>
    );
  }

  const currencyName = localizedCurrencyName(
    country.currency,
    reference.currencies.find((c) => c.code === country.currency)?.name ?? country.currency,
    locale,
  );
  const alternates = currenciesFor(country).slice(1);

  return (
    <section>
      <Link href="/countries" className="text-sm text-gray-500 hover:text-white">
        {t("allCountries")}
      </Link>
      <h1 className="mt-3 text-xl font-semibold text-white">
        {t("slugHeading", { country: country.displayName })} {flagForCountry(country.code)}
      </h1>
      <p className="mt-1 max-w-3xl text-sm text-gray-400">
        {t("slugBody", {
          currencyName,
          currency: country.currency,
          country: country.displayName,
        })}
      </p>
      {/* Which rails are on offer is a fact about the book, so it is read
          from the book rather than written into the page. */}
      <CurrencyPaymentMethods currency={country.currency} />

      {/* Countries where a second currency genuinely circulates. In a
          dollarised economy the USD book is often the larger one, so linking
          it matters more than a footnote would suggest. The node says which
          they are. */}
      {alternates.length > 0 && (
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-400">
          <span className="text-gray-500">{t("alsoTradedHere")}</span>
          {alternates.map((code) => (
            <Link
              key={code}
              href={`/country/${country.slug}/${code.toLowerCase()}`}
              className="rounded border border-white/10 px-2 py-0.5 font-mono text-xs text-gray-300 hover:border-white/25 hover:text-white"
            >
              {code}
            </Link>
          ))}
          <span className="text-xs text-gray-600">{t("primaryMarket", { currency: country.currency })}</span>
        </p>
      )}
      <div className="mt-8">
        <P2PExchange
          initialFiat={country.currency}
          showHeading={false}
          savePreference={country.slug}
        />
      </div>
    </section>
  );
}
