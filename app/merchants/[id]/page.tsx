import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CURRENT_USER, MERCHANTS, adCapacityFor, reputationFor } from "@/lib/data/merchants";
import { reviewsFor } from "@/lib/data/reviews";
import { compositeScore } from "@/lib/reputation";
import { ProfileTabs } from "@/components/merchants/profile-tabs";
import {
  lifetimeOrders,
  ratingFor,
  recentOrders,
  releaseTime,
  verifications,
} from "@/lib/merchant-profile";
import { adsForMerchant, adPrice, paymentMethodsForMerchant } from "@/lib/data/ads";
import { getCountry } from "@/lib/data/countries";
import { formatCrypto, formatFiat, formatNumber, shortAddress } from "@/lib/format";
import { CopyButton } from "@/components/copy-button";
import { TradedBadge } from "@/components/counterparties/traded-badge";
import { DataTable, Td, Th, Tr } from "@/components/data-table";
import { MerchantAvatar } from "@/components/merchant-avatar";
import { MetricStrip } from "@/components/metrics";
import { Panel } from "@/components/panel";
import { StatusPill } from "@/components/status-pill";
import { TierBadge } from "@/components/tier-badge";

interface Params {
  id: string;
}

export function generateStaticParams(): Params[] {
  return [...MERCHANTS.map((m) => ({ id: m.id })), { id: CURRENT_USER.id }];
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params;
  const merchant = [...MERCHANTS, CURRENT_USER].find((m) => m.id === id);
  if (!merchant) return {};
  return {
    title: `${merchant.name} — Merchant Profile`,
    description: `${merchant.name} on OpenFiat: ${merchant.tier} tier, ${formatNumber(merchant.orders, 0)} orders, ${merchant.completionRate}% completion, ${merchant.settlementSpeed} settlement.`,
  };
}

export default async function MerchantProfilePage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const merchant = [...MERCHANTS, CURRENT_USER].find((m) => m.id === id);
  if (!merchant) notFound();

  const country = getCountry(merchant.countryCode);
  const ads = adsForMerchant(merchant.id);
  const methods = paymentMethodsForMerchant(merchant.id);
  const reputation = reputationFor(merchant);
  const recent = recentOrders(merchant);
  const lifetime = lifetimeOrders(merchant);
  const rating = ratingFor(merchant);
  const reviews = reviewsFor(merchant.id);
  const capacity = adCapacityFor(merchant);

  return (
    <section>
      <Link href="/" className="text-sm text-gray-500 hover:text-white">
        ← Back to the exchange
      </Link>

      {/* Header */}
      <div className="mt-6 flex flex-wrap items-center gap-5">
        <MerchantAvatar name={merchant.name} tier={merchant.tier} size="md" />
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-semibold text-white">{merchant.name}</h1>
            <TierBadge tier={merchant.tier} />
            <StatusPill status={merchant.availability} />
            {merchant.international && (
              <span className="rounded-full border border-brand-teal/40 bg-brand-teal/10 px-2.5 py-0.5 text-xs text-brand-teal">
                🌐 International
              </span>
            )}
          </div>
          {/* What was actually checked, rather than a level code. "L2" means
              nothing to someone deciding whether to send money. */}
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
            {verifications(merchant).map((v) => (
              <span
                key={v.label}
                title={v.verified ? v.hint : `Not verified. ${v.hint}`}
                className={`cursor-help ${v.verified ? "text-emerald-300" : "text-gray-600 line-through"}`}
              >
                {v.verified ? "✓" : "○"} {v.label}
              </span>
            ))}
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-400">
            <span>
              {country?.flag} {country?.name ?? merchant.countryCode}
            </span>
            <span className="flex items-center gap-1.5 font-mono text-xs text-gray-500">
              {shortAddress(merchant.wallet)}
              <CopyButton value={merchant.wallet} />
            </span>
            {/* Your own history with this wallet, if you have read it. Every
                other figure on this page is the same for every visitor;
                this one is only ever yours, and renders nothing at all
                unless you are signed in and have traded with them. */}
            <TradedBadge wallet={merchant.wallet} />
          </p>
        </div>
      </div>

      <div className="mt-8">
        <MetricStrip
          items={[
            /* Reputation first. This is the page someone opens to decide
               whether to trade with a stranger, and it was the one place
               showing every input to the score except the score. */
            {
              label: "Reputation",
              value: `${compositeScore(merchant)}/100`,
              sub: `${merchant.tier} tier · conduct only`,
            },
            {
              label: "Orders, 30 days",
              value: formatNumber(recent.total, 0),
              sub: `Buy ${formatNumber(recent.buy, 0)} · Sell ${formatNumber(recent.sell, 0)}`,
            },
            {
              label: "Orders, all time",
              value: formatNumber(lifetime.total, 0),
              sub: `Buy ${formatNumber(lifetime.buy, 0)} · Sell ${formatNumber(lifetime.sell, 0)}`,
            },
            { label: "Completion", value: `${merchant.completionRate}%` },
            {
              label: "Positive ratings",
              value: `${rating.goodPct}%`,
              sub: `${formatNumber(rating.up, 0)} up · ${formatNumber(rating.down, 0)} down`,
            },
            { label: "Avg release time", value: releaseTime(merchant) },
            { label: "30d volume", value: `${formatNumber(merchant.volume30d, 0)} USDT` },
            { label: "Merchant age", value: merchant.merchantAge },
          ]}
        />
      </div>

      {/* Active advertisements */}
      {/* Ads and reviews as tabs, per the reference layout. The table is passed
          in rather than rendered inside the client component, so it stays a
          server component and the ad data never crosses the boundary. */}
      <ProfileTabs
        adCount={ads.length}
        ratingCount={rating.count}
        reviews={reviews}
        ads={
        <DataTable
          minWidth={1040}
          head={
            <tr>
              <Th>Ad</Th>
              <Th>Direction</Th>
              <Th>Pair</Th>
              <Th right>Price</Th>
              <Th right>Limits</Th>
              <Th right>Liquidity</Th>
              <Th>Payment</Th>
              <Th right>Trade</Th>
            </tr>
          }
        >
          {ads.map((ad) => (
            <Tr key={ad.id}>
              <Td className="whitespace-nowrap font-medium text-gray-200">{ad.id}</Td>
              <Td className={`font-medium ${ad.direction === "Sell" ? "text-orange-400" : "text-emerald-400"}`}>
                {ad.direction}
              </Td>
              <Td className="text-gray-300">{ad.asset}/{ad.fiatCurrency}</Td>
              <Td right num className="text-gray-200">
                {formatNumber(adPrice(ad))}
                <span className="block text-[11px] text-gray-600">
                  {ad.pricing.type === "Floating" ? `Floating ${ad.pricing.premiumPct >= 0 ? "+" : ""}${ad.pricing.premiumPct}%` : "Fixed"}
                </span>
              </Td>
              <Td right num className="text-gray-400">
                {formatFiat(ad.minTrade, ad.fiatCurrency, 0)} – {formatFiat(ad.maxTrade, ad.fiatCurrency, 0)}
              </Td>
              <Td right num className="text-gray-300">{formatCrypto(ad.availableLiquidity, ad.asset)}</Td>
              <Td className="text-xs text-gray-400">
                {ad.international ? (
                  <span className="border-l-2 border-brand-teal pl-1.5">🌐 Any payment method</span>
                ) : (
                  /* One per line with its own marker. Comma-joined, a
                     four-method list reads as one long string and you cannot
                     scan for the rail you hold. */
                  <span className="flex flex-col gap-1">
                    {ad.paymentMethods.map((m) => (
                      <span key={m} className="border-l-2 border-amber-400/60 pl-1.5">
                        {m}
                      </span>
                    ))}
                  </span>
                )}
              </Td>
              <Td right>
                <Link
                  href={`/orders/new?ad=${ad.id}`}
                  /* whitespace-nowrap and a floor on the width: "Buy USDT"
                     was wrapping to two lines, which made every row a
                     different height and the buttons different sizes. */
                  className={`inline-block min-w-[6.5rem] whitespace-nowrap rounded-md px-4 py-1.5 text-center text-xs font-semibold text-white ${
                    ad.direction === "Sell" ? "bg-emerald-600 hover:bg-emerald-500" : "bg-orange-600 hover:bg-orange-500"
                  }`}
                >
                  {ad.direction === "Sell" ? "Buy" : "Sell"} {ad.asset}
                </Link>
              </Td>
            </Tr>
          ))}
          {ads.length === 0 && (
            <tr>
              <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-500">
                No active advertisements right now.
              </td>
            </tr>
          )}
        </DataTable>
        }
      />

      <div className="mt-10 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* Reputation */}
        <Panel title="Reputation — 8 dimensions">
          <ol className="divide-y divide-white/5">
            {reputation.map((d) => (
              <li key={d.label} className="flex items-center gap-4 px-4 py-3 text-sm">
                <span className="w-40 shrink-0 text-gray-300">{d.label}</span>
                <span className="h-1 flex-1 rounded-full bg-white/10">
                  <span className="block h-1 rounded-full bg-brand" style={{ width: `${d.score}%` }} />
                </span>
                <span className="w-44 shrink-0 text-right text-xs tabular-nums text-gray-500">{d.display}</span>
              </li>
            ))}
          </ol>
          <p className="border-t border-white/10 px-4 py-3 text-xs text-gray-500">
            Reputation is wallet-bound and portable across all OpenFiat apps.
          </p>
        </Panel>

        <div className="space-y-6">
          <Panel title="Identity & stake">
            <div className="divide-y divide-white/5 px-4">
              <Row label="Identity level" value={`${merchant.identityLevel} — ${identityLabel(merchant.identityLevel)}`} />
              <Row label="Staked OPEN" value={`${formatNumber(merchant.stake, 0)} OPEN`} />
              <Row label="Ad capacity" value={`${ads.length} of ${capacity} slots used`} />
              <Row label="Availability" value={merchant.availability} />
            </div>
          </Panel>

          <Panel title="Payment methods supported">
            <div className="flex flex-wrap gap-2 px-4 py-4">
              {methods.map((m) => (
                <span key={m} className="border-l-2 border-amber-400/60 pl-1.5 text-xs text-gray-300">
                  {m}
                </span>
              ))}
              {methods.length === 0 && <p className="text-sm text-gray-500">No payment methods published.</p>}
            </div>
          </Panel>
        </div>
      </div>
    </section>
  );
}

function identityLabel(level: string): string {
  switch (level) {
    case "L0": return "Wallet Identity";
    case "L1": return "Verified Contact";
    case "L2": return "Merchant Business Profile";
    default: return "Trusted Infrastructure Provider";
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-right tabular-nums text-gray-200">{value}</span>
    </div>
  );
}
