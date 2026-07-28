"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ServiceType } from "@/lib/types";
import { PROVIDERS, PROVIDER_TYPES, TYPE_COLORS } from "@/lib/data/providers";
import { fetchLiveProviders, type DirectoryRow } from "@/lib/live-providers";
import { NODE_CHANGED_EVENT, readNodeSelection } from "@/lib/node-preference";
import { DataTable, Td, Th, Tr } from "@/components/data-table";
import { StatusPill } from "@/components/status-pill";

const FILTERS: Array<{ key: ServiceType | "All"; label: string }> = [
  { key: "All", label: "All" },
  ...(Object.entries(PROVIDER_TYPES) as Array<[ServiceType, string]>).map(([key, label]) => ({ key, label })),
];

const MOCK_ROWS: DirectoryRow[] = PROVIDERS.map((p) => ({
  id: p.id,
  name: p.name,
  type: p.type,
  region: p.region,
  capabilities: p.capabilities,
  priceLabel: `${p.pricing[0].price} / ${p.pricing[0].item}`,
  uptimeLabel: `${p.uptimePct}%`,
  status: p.status,
  href: `/providers/${p.id}`,
}));

/**
 * Live data only when the user has picked a real, live-checked custom
 * node (see the footer's "Access node" modal) — every other selection
 * keeps the simulated directory, the same narrow-scope precedent the
 * footer's own node connectivity check already established.
 */
function useProviderRows(): { rows: DirectoryRow[]; live: boolean; loading: boolean; error: string | null } {
  const [state, setState] = useState<{ rows: DirectoryRow[]; live: boolean; loading: boolean; error: string | null }>({
    rows: MOCK_ROWS,
    live: false,
    loading: false,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const selection = readNodeSelection();
      if (!selection.custom) {
        setState({ rows: MOCK_ROWS, live: false, loading: false, error: null });
        return;
      }
      setState((s) => ({ ...s, live: true, loading: true, error: null }));
      try {
        const rows = await fetchLiveProviders(`http://${selection.id}`);
        if (!cancelled) setState({ rows, live: true, loading: false, error: null });
      } catch {
        if (!cancelled) {
          setState({ rows: MOCK_ROWS, live: false, loading: false, error: `Could not reach ${selection.id} — showing simulated data.` });
        }
      }
    }

    load();
    window.addEventListener(NODE_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(NODE_CHANGED_EVENT, load);
    };
  }, []);

  return state;
}

export function ProvidersDirectory() {
  const [filter, setFilter] = useState<ServiceType | "All">("All");
  const { rows, live, loading, error } = useProviderRows();
  const visible = filter === "All" ? rows : rows.filter((p) => p.type === filter);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
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
        {live && (
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className={`h-1.5 w-1.5 rounded-full ${loading ? "bg-amber-400" : "bg-emerald-400"}`} />
            {loading ? "Loading live registry…" : "Live from your access node"}
          </span>
        )}
        {error && <span className="text-xs text-amber-300">{error}</span>}
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
            const identity = (
              <span className="flex items-center gap-2.5">
                <span className={`h-2 w-2 shrink-0 rounded-full ${color.dot}`} />
                <span>
                  <span className="block font-medium text-white">{p.name}</span>
                  <span className="block font-mono text-xs text-gray-600">{p.id}</span>
                </span>
              </span>
            );
            return (
              <Tr key={p.id}>
                <Td py="py-5">
                  {p.href ? (
                    <Link href={p.href} className="group flex items-center gap-2.5">
                      {identity}
                    </Link>
                  ) : (
                    identity
                  )}
                </Td>
                <Td py="py-5" className={`text-sm ${color.text}`}>{PROVIDER_TYPES[p.type]}</Td>
                <Td py="py-5" className="text-gray-400">{p.region}</Td>
                <Td py="py-5" className="max-w-64">
                  <span className="line-clamp-2 text-xs text-gray-400">
                    {p.capabilities.slice(0, 3).join(" · ")}
                    {p.capabilities.length > 3 && ` +${p.capabilities.length - 3} more`}
                  </span>
                </Td>
                <Td py="py-5" className="text-xs text-gray-400">{p.priceLabel}</Td>
                <Td py="py-5" right num className="text-gray-300">{p.uptimeLabel}</Td>
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
