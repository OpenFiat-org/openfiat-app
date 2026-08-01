import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { COUNTRIES, COUNTRIES_BY_SLUG, currenciesFor } from "@/lib/data/countries";
import { CurrencyPaymentMethods } from "@/components/p2p/currency-payment-methods";
import { P2PExchange } from "@/components/p2p/exchange";

interface Params {
  slug: string;
}

/** One statically-prerendered SEO page per country/territory in the registry. */
export function generateStaticParams(): Params[] {
  return COUNTRIES.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const country = COUNTRIES_BY_SLUG.get(slug);
  if (!country) return {};
  return {
    title: { absolute: `Buy & Sell Stablecoins in ${country.name} — P2P Exchange | OpenFiat` },
    // No payment rails and no asset tickers here. Both used to be stated —
    // "Pay with M-Pesa, Equity Bank, KCB", "USDT, USDC, USD1, and SOL" —
    // out of a hand-written table in `lib/data/ads.ts`, on all 253 country
    // pages, whether or not a single advertisement existed. A description is
    // the one piece of a page that travels without it, so it must not
    // contain a claim the page itself would have to hedge.
    description: `Buy and sell stablecoins with ${country.currencyName} (${country.currencyCode}) in ${country.name}, peer to peer. Escrow enforced by Solana programs — OpenFiat never takes custody of your fiat.`,
    alternates: { canonical: `/country/${country.slug}` },
  };
}

export default async function CountryP2PPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const country = COUNTRIES_BY_SLUG.get(slug);
  if (!country) notFound();

  const active = country.currencyCode;

  return (
    <section>
      <Link href="/countries" className="text-sm text-gray-500 hover:text-white">
        ← All countries
      </Link>
      <h1 className="mt-3 text-xl font-semibold text-white">
        P2P Exchange in {country.name} {country.flag}
      </h1>
      <p className="mt-1 max-w-3xl text-sm text-gray-400">
        Buy and sell stablecoins with {country.currencyName} ({country.currencyCode}) in {country.name}
        {!country.isRecognized && (
          <span className="text-gray-500"> — OpenFiat serves {country.name} like every other market</span>
        )}
        . Escrow is locked on Solana before you pay and released only after fiat receipt is verified; OpenFiat never
        takes custody of your {country.currencyCode}.
      </p>
      {/* Which rails are on offer is a fact about the book, so it is read
          from the book rather than written into the page. */}
      <CurrencyPaymentMethods currency={active} />

      {/* Countries where a second currency genuinely circulates. In a
          dollarised economy the USD book is often the larger one, so linking
          it matters more than a footnote would suggest. */}
      {country.altCurrencies && country.altCurrencies.length > 0 && (
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-400">
          <span className="text-gray-500">Also traded here:</span>
          {currenciesFor(country)
            .slice(1)
            .map((code) => (
              <Link
                key={code}
                href={`/country/${country.slug}/${code.toLowerCase()}`}
                className="rounded border border-white/10 px-2 py-0.5 font-mono text-xs text-gray-300 hover:border-white/25 hover:text-white"
              >
                {code}
              </Link>
            ))}
          <span className="text-xs text-gray-600">
            {country.currencyCode} is the primary market
          </span>
        </p>
      )}
      <div className="mt-8">
        <P2PExchange initialFiat={active} showHeading={false} savePreference={country.slug} />
      </div>
    </section>
  );
}
