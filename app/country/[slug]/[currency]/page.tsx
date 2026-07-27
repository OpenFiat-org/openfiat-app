import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { COUNTRIES, COUNTRIES_BY_SLUG, currenciesFor } from "@/lib/data/countries";
import { paymentMethodsForCurrency } from "@/lib/data/ads";
import { P2PExchange } from "@/components/p2p/exchange";

interface Params {
  slug: string;
  currency: string;
}

/**
 * The order book for a country's *second* currency.
 *
 * A sub-route rather than a `?fiat=` parameter on the country page. The
 * parameter version worked, but reading searchParams turned that route dynamic
 * and cost the prerendering on all 253 country pages — which are this app's
 * main indexable surface. A path is also the better shape on its own merits:
 * "buy USDT with USD in Zimbabwe" is a distinct thing people search for, and
 * in a dollarised economy it is frequently the larger book of the two.
 */
export function generateStaticParams(): Params[] {
  return COUNTRIES.flatMap((c) =>
    currenciesFor(c)
      .slice(1)
      .map((code) => ({ slug: c.slug, currency: code.toLowerCase() })),
  );
}

function resolve(slug: string, currency: string) {
  const country = COUNTRIES_BY_SLUG.get(slug);
  if (!country) return null;
  const code = currency.toUpperCase();
  // Only a currency this country actually trades in — otherwise any URL could
  // conjure a market that does not exist here.
  if (!currenciesFor(country).slice(1).includes(code)) return null;
  return { country, code };
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug, currency } = await params;
  const found = resolve(slug, currency);
  if (!found) return {};
  const { country, code } = found;
  const methods = paymentMethodsForCurrency(code).slice(0, 3).join(", ");
  return {
    title: {
      absolute: `Buy & Sell USDT with ${code} in ${country.name} — P2P Exchange | OpenFiat`,
    },
    description: `Buy and sell USDT, USDC, USD1, and SOL with ${code} in ${country.name}. Pay with ${methods}. Escrow enforced by audited Solana programs — OpenFiat never takes custody of your fiat.`,
    alternates: { canonical: `/country/${country.slug}/${code.toLowerCase()}` },
  };
}

export default async function CountryCurrencyPage({ params }: { params: Promise<Params> }) {
  const { slug, currency } = await params;
  const found = resolve(slug, currency);
  if (!found) notFound();
  const { country, code } = found;
  const methods = paymentMethodsForCurrency(code);

  return (
    <section>
      <Link href={`/country/${country.slug}`} className="text-sm text-gray-500 hover:text-white">
        ← {country.name} ({country.currencyCode})
      </Link>
      <h1 className="mt-3 text-xl font-semibold text-white">
        P2P Exchange in {country.name} — {code} {country.flag}
      </h1>
      <p className="mt-1 max-w-3xl text-sm text-gray-400">
        {code} circulates in {country.name} alongside {country.currencyName} ({country.currencyCode}), and often carries
        the deeper book of the two. Local merchants accept {methods.join(", ")}. Escrow is locked on Solana before you
        pay and released only after receipt is verified; OpenFiat never takes custody of your {code}.
      </p>

      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-400">
        <span className="text-gray-500">Other markets here:</span>
        {currenciesFor(country)
          .filter((c) => c !== code)
          .map((other) => (
            <Link
              key={other}
              href={
                other === country.currencyCode
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
