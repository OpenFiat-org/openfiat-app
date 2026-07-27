import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CURRENT_USER, MERCHANTS, adCapacityFor, reputationFor } from "@/lib/data/merchants";
import { adsForMerchant, adPrice, paymentMethodsForMerchant } from "@/lib/data/ads";
import { getCountry } from "@/lib/data/countries";
import { formatCrypto, formatFiat, formatNumber, shortAddress } from "@/lib/format";
import { CopyButton } from "@/components/copy-button";
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
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-400">
            <span>
              {country?.flag} {country?.name ?? merchant.countryCode}
            </span>
            <span className="flex items-center gap-1.5 font-mono text-xs text-gray-500">
              {shortAddress(merchant.wallet)}
              <CopyButton value={merchant.wallet} />
            </span>
          </p>
        </div>
      </div>

      <div className="mt-8">
        <MetricStrip
          items={[
            { label: "Total orders", value: formatNumber(merchant.orders, 0) },
            { label: "Completion", value: `${merchant.completionRate}%` },
            { label: "30d volume", value: `${formatNumber(merchant.volume30d, 0)} USDT` },
            { label: "Avg ticket", value: `${formatNumber(merchant.avgTicket, 0)} USDT` },
            { label: "Settlement speed", value: merchant.settlementSpeed },
            { label: "Merchant age", value: merchant.merchantAge },
          ]}
        />
      </div>

      {/* Active advertisements */}
      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-gray-400">
        Active advertisements ({ads.length})
      </h2>
      <div className="mt-3">
        <DataTable
          minWidth={900}
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
              <Td className="font-medium text-gray-200">{ad.id}</Td>
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
                {ad.international ? "🌐 Any payment method" : ad.paymentMethods.join(", ")}
              </Td>
              <Td right>
                <Link
                  href={`/orders/new?ad=${ad.id}`}
                  className={`inline-block rounded-md px-4 py-1.5 text-xs font-semibold text-white ${
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
      </div>

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
    case "L2": return "Verified Merchant Identity";
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
