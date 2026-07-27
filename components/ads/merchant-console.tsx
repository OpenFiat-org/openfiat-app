"use client";

import Link from "next/link";
import { useState } from "react";
import type { Advertisement } from "@/lib/types";
import { MY_ADS, adPrice } from "@/lib/data/ads";
import { CURRENT_USER } from "@/lib/data/merchants";
import { formatCrypto, formatFiat, formatNumber } from "@/lib/format";
import { AssetIcon } from "@/components/asset-icon";
import { DataTable, Td, Th, Tr } from "@/components/data-table";
import { MetricStrip } from "@/components/metrics";
import { StatusPill } from "@/components/status-pill";

/**
 * Merchant console. Online/Paused toggles are simulated client-side only —
 * a live node would persist AdvertisementUpdated events.
 */
export function MerchantConsole() {
  const [ads, setAds] = useState<Advertisement[]>(MY_ADS);

  const activeCount = ads.filter((a) => a.status === "Online").length;
  const totalLiquidity = ads.reduce((sum, a) => sum + a.availableLiquidity, 0);

  function toggleStatus(id: string) {
    setAds((list) =>
      list.map((a) => (a.id === id ? { ...a, status: a.status === "Online" ? "Paused" : "Online" } : a)),
    );
  }

  return (
    <div>
      <MetricStrip
        items={[
          { label: "Active ads", value: String(activeCount), sub: `${ads.length} total` },
          { label: "Total liquidity", value: formatNumber(totalLiquidity, 0), sub: "across all assets" },
          { label: "30d volume", value: "84,210 USDT", sub: "simulated" },
          { label: "Completion", value: `${CURRENT_USER.completionRate}%`, sub: `${formatNumber(CURRENT_USER.orders, 0)} orders` },
        ]}
      />

      {/*
        * The "Post advertisement" call to action used to live inside the last
        * table header cell, which forced that column wide enough to wrap the
        * label over two lines and squeezed every other column to compensate. A
        * primary action is not a column heading — it belongs in a toolbar above
        * the table, where it can size to its own text.
        */}
      <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
        <h2 className="text-sm font-semibold text-white">
          Your advertisements
          <span className="ml-2 font-normal text-gray-500">{ads.length}</span>
        </h2>
        <Link
          href="/ads/new"
          className="shrink-0 whitespace-nowrap rounded-md bg-brand px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
        >
          Post advertisement
        </Link>
      </div>

      <div>
        <DataTable
          minWidth={960}
          head={
            <tr>
              <Th>Ad</Th>
              <Th>Direction</Th>
              <Th>Pair</Th>
              <Th right>Price</Th>
              <Th right>Limits</Th>
              <Th right>Liquidity</Th>
              <Th>Payment methods</Th>
              <Th right>Status</Th>
            </tr>
          }
        >
          {ads.map((ad) => (
            <Tr key={ad.id}>
              <Td className="whitespace-nowrap font-mono font-medium text-gray-200">{ad.id}</Td>
              <Td
                className={`whitespace-nowrap font-medium ${
                  ad.direction === "Sell" ? "text-orange-400" : "text-emerald-400"
                }`}
              >
                {ad.direction}
              </Td>
              <Td className="whitespace-nowrap text-gray-300">
                <span className="flex items-center gap-2">
                  <AssetIcon asset={ad.asset} size={18} />
                  {ad.asset}/{ad.fiatCurrency}
                </span>
              </Td>
              <Td right num>
                <span className="text-gray-200">{formatNumber(adPrice(ad))}</span>
                <span className="block text-[11px] text-gray-600">
                  {ad.pricing.type === "Floating"
                    ? `Floating ${ad.pricing.premiumPct >= 0 ? "+" : ""}${ad.pricing.premiumPct}%`
                    : "Fixed"}
                </span>
              </Td>
              <Td right num className="text-gray-400">
                {formatFiat(ad.minTrade, ad.fiatCurrency, 0)} – {formatFiat(ad.maxTrade, ad.fiatCurrency, 0)}
              </Td>
              <Td right num className="text-gray-300">
                {formatCrypto(ad.availableLiquidity, ad.asset)}
              </Td>
              {/* One rail plus a count, full list on hover. Rail names run long
                  ("Mpesa Pochi la Biashara"), so listing them all wrapped the
                  cell and made that row taller than its neighbours — and
                  truncating a joined string cut the second name mid-word. A
                  count reads as deliberate where a clipped word does not. */}
              <Td className="whitespace-nowrap text-xs text-gray-400">
                <span className="flex items-center gap-1.5" title={ad.paymentMethods.join(", ")}>
                  {ad.paymentMethods[0]}
                  {ad.paymentMethods.length > 1 && (
                    <span className="shrink-0 rounded border border-white/10 px-1.5 py-0.5 text-[11px] text-gray-500">
                      +{ad.paymentMethods.length - 1}
                    </span>
                  )}
                </span>
              </Td>
              <Td right>
                <button
                  onClick={() => toggleStatus(ad.id)}
                  className="rounded-full transition-opacity hover:opacity-80"
                  title="Toggle Online/Paused (simulated)"
                >
                  <StatusPill status={ad.status} />
                </button>
              </Td>
            </Tr>
          ))}
        </DataTable>
      </div>
    </div>
  );
}
