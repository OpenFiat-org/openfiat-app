"use client";

import Link from "next/link";
import { useState } from "react";
import type { ServiceType } from "@/lib/types";
import { PROVIDERS, PROVIDER_TYPES, TYPE_COLORS } from "@/lib/data/providers";
import { DataTable, Td, Th, Tr } from "@/components/data-table";
import { StatusPill } from "@/components/status-pill";

const FILTERS: Array<{ key: ServiceType | "All"; label: string }> = [
  { key: "All", label: "All" },
  ...(Object.entries(PROVIDER_TYPES) as Array<[ServiceType, string]>).map(([key, label]) => ({ key, label })),
];

export function ProvidersDirectory() {
  const [filter, setFilter] = useState<ServiceType | "All">("All");
  const visible = filter === "All" ? PROVIDERS : PROVIDERS.filter((p) => p.type === filter);

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              filter === f.key
                ? "border-brand/50 bg-brand/10 text-brand-hover"
                : "border-white/10 text-gray-400 hover:text-white"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <DataTable
          minWidth={960}
          head={
            <tr>
              <Th>Provider</Th>
              <Th>Type</Th>
              <Th>Region</Th>
              <Th>Capabilities</Th>
              <Th>Pricing</Th>
              <Th right>Uptime</Th>
              <Th right>Status</Th>
            </tr>
          }
        >
          {visible.map((p) => {
            const color = TYPE_COLORS[p.type];
            return (
              <Tr key={p.id}>
                <Td py="py-5">
                  <Link href={`/providers/${p.id}`} className="group flex items-center gap-2.5">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${color.dot}`} />
                    <span>
                      <span className="block font-medium text-white group-hover:text-brand-hover">{p.name}</span>
                      <span className="block font-mono text-xs text-gray-600">{p.id}</span>
                    </span>
                  </Link>
                </Td>
                <Td py="py-5" className={`text-sm ${color.text}`}>{PROVIDER_TYPES[p.type]}</Td>
                <Td py="py-5" className="text-gray-400">{p.region}</Td>
                <Td py="py-5" className="max-w-64">
                  <span className="line-clamp-2 text-xs text-gray-400">
                    {p.capabilities.slice(0, 3).join(" · ")}
                    {p.capabilities.length > 3 && ` +${p.capabilities.length - 3} more`}
                  </span>
                </Td>
                <Td py="py-5" className="text-xs text-gray-400">{p.pricing[0].price} <span className="text-gray-600">/ {p.pricing[0].item}</span></Td>
                <Td py="py-5" right num className="text-gray-300">{p.uptimePct}%</Td>
                <Td py="py-5" right><StatusPill status={p.status} /></Td>
              </Tr>
            );
          })}
          {visible.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-500">
                No providers of this type registered yet.
              </td>
            </tr>
          )}
        </DataTable>
      </div>
    </div>
  );
}
