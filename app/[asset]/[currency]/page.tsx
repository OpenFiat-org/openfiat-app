import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AssetIcon } from "@/components/asset-icon";
import { P2PExchange } from "@/components/p2p/exchange";
import { PairConverter } from "@/components/pairs/converter";
import { formatNumber } from "@/lib/format";
import type { RateLookup } from "@/lib/live-oracle";
import { normalisePair } from "@/lib/pairs";
import { loadPairData } from "./pair-data";

interface Params {
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
  const { asset, currency } = await params;
  const pair = normalisePair(asset, currency);
  if (!pair) return {};

  const { rate, advertisers, methods } = await loadPairData(pair);
  const canonical = { alternates: { canonical: `/${pair.slug}` } };

  // No rate, no number in the description. A meta description is the one
  // string that outlives the page in a search result, so a figure here that
  // the page itself refuses to show would be the most durable version of
  // exactly the error this page was fixed for.
  if (rate.kind !== "current") {
    return {
      title: {
        absolute: `Convert ${pair.asset} to ${pair.currency} — P2P Exchange | OpenFiat`,
      },
      description: `Buy and sell ${pair.asset} for ${pair.currency} peer-to-peer on OpenFiat. Escrow enforced by Solana programs — OpenFiat never takes custody of your ${pair.currency}.`,
      ...canonical,
    };
  }

  const rails = methods.slice(0, 3).join(", ");
  const advertiserPhrase =
    advertisers > 0
      ? ` ${advertisers} live advertiser${advertisers === 1 ? "" : "s"}${rails ? `, paying by ${rails}` : ""}.`
      : "";
  return {
    title: {
      absolute: `Convert ${pair.asset} to ${pair.currency} — ${pair.asset}/${pair.currency} P2P Rate | OpenFiat`,
    },
    description: `Convert ${pair.asset} to ${pair.currency} peer-to-peer at ${formatNumber(rate.rate)} ${pair.currency} per ${pair.asset}.${advertiserPhrase} Escrow enforced by Solana programs — OpenFiat never takes custody of your ${pair.currency}.`,
    ...canonical,
  };
}

export default async function PairPage({ params }: { params: Promise<Params> }) {
  const { asset, currency } = await params;
  const pair = normalisePair(asset, currency);
  if (!pair) notFound();

  const { rate, advertisers, methods, countries, priced, unreachable } = await loadPairData(pair);

  const countryList = countries.slice(0, 4).join(", ");
  const more = countries.length - 4;
  const otherAssets = priced.filter((p) => p.quote === pair.currency && p.base !== pair.asset);
  const otherCurrencies = priced.filter((p) => p.base === pair.asset && p.quote !== pair.currency);

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

      {/* The answer, immediately — or, when there isn't one, which of the two
          reasons it is, since only one of them is worth waiting out. */}
      <Rate pair={pair} rate={rate} unreachable={unreachable} />

      {rate.kind === "current" && (
        <div className="mt-6 max-w-md">
          <PairConverter asset={pair.asset} currency={pair.currency} rate={rate.rate} />
        </div>
      )}

      <div className="mt-8 max-w-3xl space-y-4 text-sm leading-relaxed text-gray-400">
        {advertisers > 0 ? (
          <p>
            {advertisers} advertiser{advertisers === 1 ? "" : "s"} are trading {pair.asset} against{" "}
            {pair.currency} right now. There is no exchange in the middle: you pick someone whose
            price and limits suit you, and the {pair.currency} moves between your own accounts
            {methods.length > 0 && <> using {methods.slice(0, 3).join(", ")}</>}
            {methods.length > 3 ? " and others" : ""}.
          </p>
        ) : (
          <p>
            Nobody is advertising {pair.asset} against {pair.currency} on this node right now. A
            node counts only the advertisements it has replicated, so a node that joined recently
            knows about fewer than exist — and an empty corridor is an opening rather than a
            closure: the first merchant in one sets the price.
          </p>
        )}
        <p>
          Your {pair.asset} is locked in a Solana escrow program before any {pair.currency} is sent.
          It releases when the receiving side confirms the money arrived, and if they do not,
          independent arbitrators who have staked OPEN decide it. Nobody at OpenFiat can release
          escrow early, freeze it, or take custody of your {pair.currency} at any point.
        </p>
        {countries.length > 0 && (
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
                No other asset is priced against {pair.currency} right now.
              </li>
            )}
          </ul>
        </div>

        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
            {pair.asset} in other currencies
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
                {pair.asset} is not priced in any other currency right now.
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
  pair: { asset: string; currency: string };
  rate: RateLookup;
  unreachable: boolean;
}) {
  if (rate.kind === "current") {
    return (
      <>
        <p className="mt-3 text-2xl font-semibold tabular-nums text-white">
          1 {pair.asset} ={" "}
          <span className="text-brand-teal">
            {formatNumber(rate.rate)} {pair.currency}
          </span>
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Median across {rate.contributors} oracle{rate.contributors === 1 ? "" : "s"} (OFS-7000
          §11), good until {new Date(rate.expiresAt).toLocaleString()}. Advertisers price above or
          below it, so the rate you get is the one on the offer you accept — compare below.
        </p>
      </>
    );
  }

  if (unreachable) {
    return (
      <p className="mt-3 max-w-2xl text-sm text-amber-300">
        The access node could not be reached, so there is no rate to show. This says nothing about
        whether {pair.asset}/{pair.currency} is priced — only that we could not ask.
      </p>
    );
  }

  if (rate.kind === "stale") {
    return (
      <p className="mt-3 max-w-2xl text-sm text-amber-300">
        The {pair.asset}/{pair.currency} feed has lapsed — the last record expired{" "}
        {new Date(rate.lapsedAt).toLocaleString()}, and expired data is not a rate (OFS-7000 §12).
        A provider publishes this pair, so a fresh reading should appear once they publish again.
      </p>
    );
  }

  return (
    <p className="mt-3 max-w-2xl text-sm text-gray-400">
      No oracle publishes {pair.asset}/{pair.currency} on this node, so there is no median rate for
      it. That is not a temporary outage: it is a corridor nobody prices yet. Merchants can still
      advertise the pair at a fixed price of their own choosing.
    </p>
  );
}
