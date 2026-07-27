import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PAIRS, findPair, siblingsByAsset, siblingsByCurrency } from "@/lib/pairs";
import { formatNumber } from "@/lib/format";
import { AssetIcon } from "@/components/asset-icon";
import { P2PExchange } from "@/components/p2p/exchange";
import { PairConverter } from "@/components/pairs/converter";

interface Params {
  asset: string;
  currency: string;
}

/**
 * A landing page per asset/fiat pair — /usdt/kes, /sol/kes, /usdc/usd.
 *
 * People search "convert USDT to KES", not "peer-to-peer exchange", and a page
 * titled for the query is the only thing that answers it. Each one carries the
 * rate, a converter, the live order book for that pair, the local payment rails
 * and prose written to the question rather than about the product.
 *
 * Only pairs with advertisements get a page — see lib/pairs.ts. Generating every
 * asset against every currency would be a thousand-odd mostly-empty pages, which
 * dilutes the ones that matter.
 */
export function generateStaticParams(): Params[] {
  return PAIRS.map((p) => ({
    asset: p.asset.toLowerCase(),
    currency: p.currency.toLowerCase(),
  }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { asset, currency } = await params;
  const pair = findPair(asset, currency);
  if (!pair) return {};
  const methods = pair.methods.slice(0, 3).join(", ");
  return {
    title: {
      absolute: `Convert ${pair.asset} to ${pair.currency} — ${pair.asset}/${pair.currency} P2P Rate | OpenFiat`,
    },
    description: `Convert ${pair.asset} to ${pair.currency} peer-to-peer at ${formatNumber(pair.rate)} ${pair.currency} per ${pair.asset}. ${pair.ads} live advertisers, paying by ${methods}. Escrow enforced by audited Solana programs — OpenFiat never takes custody of your ${pair.currency}.`,
    alternates: { canonical: `/${pair.asset.toLowerCase()}/${pair.currency.toLowerCase()}` },
  };
}

export default async function PairPage({ params }: { params: Promise<Params> }) {
  const { asset, currency } = await params;
  const pair = findPair(asset, currency);
  if (!pair) notFound();

  const countryList = pair.countries.slice(0, 4).join(", ");
  const more = pair.countries.length - 4;
  return (
    <section>
      <nav className="text-sm text-gray-500">
        <Link href="/" className="hover:text-white">
          Exchange
        </Link>
        <span className="mx-2 text-gray-700">/</span>
        <span className="text-gray-400">
          {pair.asset}/{pair.currency}
        </span>
      </nav>

      <h1 className="mt-3 flex flex-wrap items-center gap-2.5 text-xl font-semibold text-white">
        <AssetIcon asset={pair.asset} size={22} />
        Convert {pair.asset} to {pair.currency}
      </h1>

      {/* The answer, immediately. Someone arriving from "usdt to kes" wants the
          number before anything else. */}
      <p className="mt-3 text-2xl font-semibold tabular-nums text-white">
        1 {pair.asset} ={" "}
        <span className="text-brand-teal">
          {formatNumber(pair.rate)} {pair.currency}
        </span>
      </p>
      <p className="mt-1 text-xs text-gray-500">
        Oracle mid across providers. Advertisers price above or below it, so the rate you get is the
        one on the offer you accept — compare below.
      </p>

      <div className="mt-6 max-w-md">
        <PairConverter asset={pair.asset} currency={pair.currency} rate={pair.rate} />
      </div>

      <div className="mt-8 max-w-3xl space-y-4 text-sm leading-relaxed text-gray-400">
        <p>
          {pair.ads} advertiser{pair.ads === 1 ? "" : "s"} are trading {pair.asset} against{" "}
          {pair.currency} right now. There is no exchange in the middle: you pick someone whose
          price and limits suit you, and the {pair.currency} moves between your own accounts using{" "}
          {pair.methods.slice(0, 3).join(", ")}
          {pair.methods.length > 3 ? " and others" : ""}.
        </p>
        <p>
          Your {pair.asset} is locked in a Solana escrow program before any {pair.currency} is sent.
          It releases when the receiving side confirms the money arrived, and if they do not,
          independent arbitrators who have staked OPEN decide it. Nobody at OpenFiat can release
          escrow early, freeze it, or take custody of your {pair.currency} at any point.
        </p>
        {pair.countries.length > 0 && (
          <p>
            {pair.currency} is the currency of {countryList}
            {more > 0 ? ` and ${more} more` : ""}.{" "}
            {pair.currency === "USD"
              ? "Advertisers pricing in dollars often accept any currency, so this pair is usually the deepest book on the network."
              : `Local rails mean settlement in minutes rather than the days a cross-border transfer takes.`}
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
            Other assets in {pair.currency}
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {siblingsByCurrency(pair).map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/${p.slug}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-sm text-gray-300 hover:border-white/25 hover:text-white"
                >
                  <AssetIcon asset={p.asset} size={14} />
                  {p.asset}/{p.currency}
                </Link>
              </li>
            ))}
            {siblingsByCurrency(pair).length === 0 && (
              <li className="text-sm text-gray-500">
                {pair.asset} is the only asset trading against {pair.currency} so far.
              </li>
            )}
          </ul>
        </div>

        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
            {pair.asset} in other currencies
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {siblingsByAsset(pair).map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/${p.slug}`}
                  className="rounded-md border border-white/10 px-2.5 py-1.5 text-sm text-gray-300 hover:border-white/25 hover:text-white"
                >
                  {p.asset}/{p.currency}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
