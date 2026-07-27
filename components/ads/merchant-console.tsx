"use client";

import Link from "next/link";
import { useState } from "react";
import type { Advertisement } from "@/lib/types";
import { MY_ADS, adPrice } from "@/lib/data/ads";
import { CURRENT_USER } from "@/lib/data/merchants";
import { formatCrypto, formatFiat, formatNumber } from "@/lib/format";
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

      <div className="mt-8">
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
              <Th right>
                <Link
                  href="/ads/new"
                  className="inline-block rounded-md bg-brand px-3 py-1 text-xs font-semibold normal-case tracking-normal text-white hover:bg-brand-hover"
                >
                  + Post Advertisement
                </Link>
              </Th>
            </tr>
          }
        >
          {ads.map((ad) => (
            <Tr key={ad.id}>
              <Td py="py-5" className="font-medium text-gray-200">{ad.id}</Td>
              <Td py="py-5" className={`font-medium ${ad.direction === "Sell" ? "text-orange-400" : "text-emerald-400"}`}>
                {ad.direction}
              </Td>
              <Td py="py-5" className="text-gray-300">{ad.asset}/{ad.fiatCurrency}</Td>
              <Td py="py-5" right num>
                <span className="text-gray-200">{formatNumber(adPrice(ad))}</span>
                <span className="block text-[11px] text-gray-600">
                  {ad.pricing.type === "Floating"
                    ? `Floating ${ad.pricing.premiumPct >= 0 ? "+" : ""}${ad.pricing.premiumPct}%`
                    : "Fixed"}
                </span>
              </Td>
              <Td py="py-5" right num className="text-gray-400">
                {formatFiat(ad.minTrade, ad.fiatCurrency, 0)} – {formatFiat(ad.maxTrade, ad.fiatCurrency, 0)}
              </Td>
              <Td py="py-5" right num className="text-gray-300">
                {formatCrypto(ad.availableLiquidity, ad.asset)}
              </Td>
              <Td py="py-5" className="text-xs text-gray-400">{ad.paymentMethods.join(", ")}</Td>
              <Td py="py-5" right>
                <button onClick={() => toggleStatus(ad.id)} title="Toggle Online/Paused (simulated)">
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
