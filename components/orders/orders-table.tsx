"use client";

import Link from "next/link";
import { useState } from "react";
import type { Trade } from "@/lib/types";
import { merchantById } from "@/lib/data/merchants";
import { formatCrypto, formatFiat, formatNumber } from "@/lib/format";
import { DataTable, Td, Th, Tr } from "@/components/data-table";
import { MerchantCell } from "@/components/merchant-cell";
import { StatusPill } from "@/components/status-pill";

const FILTERS = ["All", "Active", "Completed", "Cancelled", "Disputed"] as const;
type Filter = (typeof FILTERS)[number];

const ACTIVE_STATUSES = new Set([
  "Escrow Locked",
  "Awaiting Payment",
  "Payment Submitted",
  "Merchant Reviewing",
  "Approved",
  "Escrow Released",
]);

function matches(trade: Trade, filter: Filter): boolean {
  switch (filter) {
    case "All":
      return true;
    case "Active":
      return ACTIVE_STATUSES.has(trade.status);
    default:
      return trade.status === filter;
  }
}

export function OrdersTable({ trades }: { trades: Trade[] }) {
  const [filter, setFilter] = useState<Filter>("All");
  const visible = trades.filter((t) => matches(t, filter));

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              filter === f
                ? "border-brand/50 bg-brand/10 text-brand-hover"
                : "border-white/10 text-gray-400 hover:text-white"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <DataTable
          minWidth={960}
          head={
            <tr>
              <Th>Trade</Th>
              <Th>Direction</Th>
              <Th>Counterparty</Th>
              <Th right>Amount</Th>
              <Th right>Fiat</Th>
              <Th right>Price</Th>
              <Th>Payment</Th>
              <Th>Status</Th>
              <Th right>Updated</Th>
            </tr>
          }
        >
          {visible.map((t) => {
            const cp = merchantById(t.counterpartyId);
            return (
              <Tr key={t.id}>
                <Td py="py-5">
                  <Link href={`/orders/${t.id}`} className="font-medium text-brand hover:text-brand-hover">
                    {t.id}
                  </Link>
                </Td>
                <Td py="py-5" className={`font-medium ${t.direction === "Buy" ? "text-emerald-400" : "text-orange-400"}`}>
                  {t.direction} {t.asset}
                </Td>
                <Td py="py-5">
                  <MerchantCell merchant={cp} />
                </Td>
                <Td py="py-5" right num className="text-gray-300">{formatCrypto(t.cryptoAmount, t.asset)}</Td>
                <Td py="py-5" right num className="text-gray-300">{formatFiat(t.fiatAmount, t.fiatCurrency)}</Td>
                <Td py="py-5" right num className="text-gray-400">{formatNumber(t.price)}</Td>
                <Td py="py-5" className="text-xs text-gray-400">{t.paymentMethod}</Td>
                <Td py="py-5"><StatusPill status={t.status} /></Td>
                <Td py="py-5" right className="text-xs text-gray-500">{t.updatedAt}</Td>
              </Tr>
            );
          })}
          {visible.length === 0 && (
            <tr>
              <td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-500">
                No trades in this state.
              </td>
            </tr>
          )}
        </DataTable>
      </div>
    </div>
  );
}
