import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { COUNTRIES, COUNTRIES_BY_SLUG } from "@/lib/data/countries";
import { paymentMethodsForCurrency } from "@/lib/data/ads";
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
  const methods = paymentMethodsForCurrency(country.currencyCode).slice(0, 3).join(", ");
  return {
    title: { absolute: `Buy & Sell USDT in ${country.name} — P2P Exchange | OpenFiat` },
    description: `Buy and sell USDT, USDC, USD1, and SOL with ${country.currencyName} (${country.currencyCode}) in ${country.name}. Pay with ${methods}. Escrow enforced by audited Solana programs — OpenFiat never takes custody of your fiat.`,
    alternates: { canonical: `/country/${country.slug}` },
  };
}

export default async function CountryP2PPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const country = COUNTRIES_BY_SLUG.get(slug);
  if (!country) notFound();

  const methods = paymentMethodsForCurrency(country.currencyCode);

  return (
    <section>
      <Link href="/countries" className="text-sm text-gray-500 hover:text-white">
        ← All countries
      </Link>
      <h1 className="mt-3 text-xl font-semibold text-white">
        P2P Exchange in {country.name} {country.flag}
      </h1>
      <p className="mt-1 max-w-3xl text-sm text-gray-400">
        Buy and sell USDT, USDC, USD1, and SOL with {country.currencyName} ({country.currencyCode}) in {country.name}.
        Local merchants accept {methods.join(", ")}
        {!country.isRecognized && (
          <span className="text-gray-500"> — OpenFiat serves {country.name} like every other market</span>
        )}
        . Escrow is locked on Solana before you pay and released only after fiat receipt is verified; OpenFiat never
        takes custody of your {country.currencyCode}.
      </p>
      <div className="mt-8">
        <P2PExchange initialFiat={country.currencyCode} showHeading={false} savePreference={country.slug} />
      </div>
    </section>
  );
}
