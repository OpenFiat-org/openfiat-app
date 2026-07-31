"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ServiceType } from "@/lib/types";
import { PROVIDER_TYPES, TYPE_COLORS } from "@/lib/data/providers";
import { sinceLabel } from "@/lib/format";
import { fetchLiveProviders, type DirectoryRow } from "@/lib/live-providers";
import { NODE_CHANGED_EVENT, readNodeSelection } from "@/lib/node-preference";
import { DataTable, Td, Th, Tr } from "@/components/data-table";
import { MetricStrip } from "@/components/metrics";
import { StatusPill } from "@/components/status-pill";
import { WalletAvatar } from "@/components/wallet-avatar";

const FILTERS: Array<{ key: ServiceType | "All"; label: string }> = [
  { key: "All", label: "All" },
  ...(Object.entries(PROVIDER_TYPES) as Array<[ServiceType, string]>).map(([key, label]) => ({ key, label })),
];

interface DirectoryState {
  rows: DirectoryRow[];
  loading: boolean;
  error: string | null;
}

/**
 * The registry as the selected node reports it.
 *
 * # This used to show a fixture to almost everybody
 *
 * The previous version fetched live data only when the user had typed a
 * *custom* node, and fell back to a hand-written directory of invented
 * providers otherwise — so every visitor who did not go looking for the
 * node picker saw fabricated uptime percentages and pricing presented as
 * the network's real service registry. The default selection, which is
 * what essentially everyone uses, never triggered a fetch at all.
 *
 * It also built the URL as `http://${selection.id}`, from the wrong
 * field: `id` is `custom:<host>` for a custom node, so the request went
 * to `http://custom:host` and could not have succeeded even for the one
 * case that was supposed to work. The fixture was not a fallback anybody
 * was falling back *from*.
 *
 * Now every selection is queried, over `selection.url`, and there is no
 * fixture to fall back to. An unreachable node says so; an empty registry
 * says that; neither invents providers.
 */
function useProviderRows(): DirectoryState {
  const [state, setState] = useState<DirectoryState>({
    rows: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const selection = readNodeSelection();
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const rows = await fetchLiveProviders(selection.url);
        if (!cancelled) setState({ rows, loading: false, error: null });
      } catch {
        if (!cancelled) {
          setState({
            rows: [],
            loading: false,
            error: `Could not read the registry from ${selection.label}.`,
          });
        }
      }
    }

    void load();
    window.addEventListener(NODE_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(NODE_CHANGED_EVENT, load);
    };
  }, []);

  return state;
}

/**
 * Counts over what the registry actually returned.
 *
 * There is deliberately no "average uptime" here. The page used to show
 * one, computed from a fixture field; a real OFS-1500 record carries a
 * health state and a last-update timestamp, and no uptime percentage
 * exists anywhere in the protocol to average. A number with no source is
 * worse than an absent one, because a reader cannot tell it is missing.
 */
export function ProvidersMetrics() {
  const { rows, loading, error } = useProviderRows();
  const count = (type: ServiceType) => rows.filter((r) => r.type === type).length;

  if (error) {
    return <p className="mt-6 text-sm text-amber-300">{error}</p>;
  }

  return (
    <MetricStrip
      items={[
        { label: "Registered services", value: loading ? "…" : String(rows.length) },
        { label: "Notifications", value: loading ? "…" : String(count("Notification Provider")) },
        { label: "Oracles", value: loading ? "…" : String(count("Oracle Provider")) },
        { label: "Risk intel", value: loading ? "…" : String(count("Risk Intelligence Provider")) },
        { label: "Snapshots", value: loading ? "…" : String(count("Snapshot Provider")) },
        { label: "Public API", value: loading ? "…" : String(count("Public API Node")) },
      ]}
    />
  );
}

export function ProvidersDirectory() {
  const [filter, setFilter] = useState<ServiceType | "All">("All");
  const { rows, loading, error } = useProviderRows();
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
        {error ? (
          <span className="text-xs text-amber-300">{error}</span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <span
              className={`h-1.5 w-1.5 rounded-full ${loading ? "bg-amber-400" : "bg-emerald-400"}`}
            />
            {loading ? "Reading the registry…" : "Live from your access node"}
          </span>
        )}
      </div>

      <div className="mt-4">
        <DataTable
          minWidth={960}
          head={
            <tr>
              <Th>Provider</Th>
              <Th>Type</Th>
              {/* Headed "declared" because it is. Nothing observes where
                  a provider is — see docs/region-is-declared.md in
                  openfiat-core for why deriving it was rejected. */}
              <Th>Region (declared)</Th>
              <Th>Capabilities</Th>
              <Th>Pricing</Th>
              <Th right>Last heard from</Th>
              <Th right>Status</Th>
            </tr>
          }
        >
          {visible.map((p) => {
            const color = TYPE_COLORS[p.type];
            const identity = (
              <span className="flex items-center gap-2.5">
                {/*
                  * A declared logo where there is one, and otherwise the
                  * robot drawn from the provider's PeerId — which is not
                  * an invented fact about anybody, just a rendering of
                  * the id already on the row, and which stays the same
                  * across every service one operator registers.
                  *
                  * The logo is served by the node the user selected, from
                  * a CID, never hotlinked from the provider's own host:
                  * see `readBranding`.
                  */}
                {p.branding?.logoUrl ? (
                  <img
                    src={p.branding.logoUrl}
                    alt=""
                    width={32}
                    height={32}
                    className="h-8 w-8 shrink-0 rounded-full border border-white/10 bg-white/5 object-cover"
                  />
                ) : (
                  <WalletAvatar seed={p.provider} label={p.name} size={32} />
                )}
                <span className={`h-2 w-2 shrink-0 rounded-full ${color.dot}`} />
                <span className="min-w-0">
                  {/*
                    * The declared name where there is one, and the Service
                    * ID underneath it either way. Never the name alone:
                    * two providers may register the same one — the
                    * registry allows it deliberately rather than becoming
                    * a first-come land grab over a global namespace — so
                    * the id is the part that identifies this row.
                    */}
                  <span className="block truncate font-medium text-white">
                    {p.branding?.name ?? p.name}
                  </span>
                  <span className="block truncate font-mono text-xs text-gray-600">{p.id}</span>
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
                {/* Not "Uptime". OFS-1500 records a health state and when it
                    was refreshed, and no uptime figure exists anywhere in the
                    protocol to put here — see provider-detail.tsx. */}
                <Td py="py-5" right className="text-xs text-gray-400">
                  <span title={new Date(p.lastHealthUpdate).toLocaleString()}>
                    {sinceLabel(p.lastHealthUpdate)}
                  </span>
                </Td>
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
        <p className="mt-3 text-xs leading-relaxed text-gray-600">
          Names, logos and regions come from each provider&apos;s own signed registration. The
          signature proves the record reached you unaltered; it proves nothing about the name —
          anyone can register a service under any name, and the registry deliberately does not
          hand out exclusive ones. The Service ID under each row is the part that identifies it.
          Logos are fetched from your access node by content hash, so nobody learns you looked.
        </p>
      </div>
    </div>
  );
}
