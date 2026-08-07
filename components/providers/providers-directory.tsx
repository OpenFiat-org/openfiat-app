"use client";

import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { ServiceType } from "@/lib/types";
import { PROVIDER_TYPES, TYPE_COLORS } from "@/lib/provider-display";
import { sinceLabel } from "@/lib/format";
import { formatPricing } from "@/lib/earnings";
import { fetchLiveProviders, type DirectoryRow } from "@/lib/live-providers";
import { NODE_CHANGED_EVENT, readNodeSelection } from "@/lib/node-preference";
import { DataTable, Td, Th, Tr } from "@/components/data-table";
import { MetricStrip } from "@/components/metrics";
import { StatusPill } from "@/components/status-pill";
import { WalletAvatar } from "@/components/wallet-avatar";

/** The service-type filter keys, in display order; labels come from the catalogue. */
const FILTER_KEYS: Array<ServiceType | "All"> = [
  "All",
  ...(Object.keys(PROVIDER_TYPES) as ServiceType[]),
];

/** Known health states get a translated label over the canonical tone; others pass through. */
function healthLabel(t: (k: string) => string, status: string): string {
  return ["Online", "Offline", "Degraded", "Maintenance"].includes(status)
    ? t(`health.${status}`)
    : status;
}

interface DirectoryState {
  rows: DirectoryRow[];
  loading: boolean;
  /** The node label a failed read was against, or null when there was no error. */
  errorLabel: string | null;
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
    errorLabel: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const selection = readNodeSelection();
      setState((s) => ({ ...s, loading: true, errorLabel: null }));
      try {
        const rows = await fetchLiveProviders(selection.url);
        if (!cancelled) setState({ rows, loading: false, errorLabel: null });
      } catch {
        if (!cancelled) {
          setState({ rows: [], loading: false, errorLabel: selection.label });
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
  const t = useTranslations("providers");
  const { rows, loading, errorLabel } = useProviderRows();
  const count = (type: ServiceType) => rows.filter((r) => r.type === type).length;

  if (errorLabel) {
    return <p className="mt-6 text-sm text-amber-300">{t("readError", { label: errorLabel })}</p>;
  }

  return (
    <MetricStrip
      items={[
        { label: t("metricRegistered"), value: loading ? "…" : String(rows.length) },
        { label: t("metricNotifications"), value: loading ? "…" : String(count("Notification Provider")) },
        { label: t("metricOracles"), value: loading ? "…" : String(count("Oracle Provider")) },
        { label: t("metricRiskIntel"), value: loading ? "…" : String(count("Risk Intelligence Provider")) },
        { label: t("metricSnapshots"), value: loading ? "…" : String(count("Snapshot Provider")) },
        { label: t("metricPublicApi"), value: loading ? "…" : String(count("Public API Node")) },
      ]}
    />
  );
}

export function ProvidersDirectory() {
  const t = useTranslations("providers");
  const locale = useLocale();
  const [filter, setFilter] = useState<ServiceType | "All">("All");
  const { rows, loading, errorLabel } = useProviderRows();
  const visible = filter === "All" ? rows : rows.filter((p) => p.type === filter);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTER_KEYS.map((key) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                filter === key
                  ? "border-brand/50 bg-brand/10 text-brand-hover"
                  : "border-white/10 text-gray-400 hover:text-white"
              }`}
            >
              {key === "All" ? t("filterAll") : t(`providerType.${key}`)}
            </button>
          ))}
        </div>
        {errorLabel ? (
          <span className="text-xs text-amber-300">{t("readError", { label: errorLabel })}</span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <span
              className={`h-1.5 w-1.5 rounded-full ${loading ? "bg-amber-400" : "bg-emerald-400"}`}
            />
            {loading ? t("readingRegistry") : t("liveFromNode")}
          </span>
        )}
      </div>

      <div className="mt-4">
        <DataTable
          minWidth={960}
          head={
            <tr>
              <Th>{t("colProvider")}</Th>
              <Th>{t("colType")}</Th>
              {/* Headed "declared" because it is. Nothing observes where
                  a provider is — see docs/region-is-declared.md in
                  openfiat-core for why deriving it was rejected. */}
              <Th>{t("colRegion")}</Th>
              <Th>{t("colCapabilities")}</Th>
              <Th>{t("colPricing")}</Th>
              <Th right>{t("colLastHeard")}</Th>
              <Th right>{t("colStatus")}</Th>
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
                <Td py="py-5" className={`text-sm ${color.text}`}>{t(`providerType.${p.type}`)}</Td>
                <Td py="py-5" className="text-gray-400">{p.region}</Td>
                <Td py="py-5" className="max-w-64">
                  <span className="line-clamp-2 text-xs text-gray-400">
                    {p.capabilities.slice(0, 3).join(" · ")}
                    {p.capabilities.length > 3 && ` ${t("moreCaps", { n: p.capabilities.length - 3 })}`}
                  </span>
                </Td>
                <Td py="py-5" className="text-xs text-gray-400">{formatPricing(t, p.pricing) ?? t("freeWord")}</Td>
                {/* Not "Uptime". OFS-1500 records a health state and when it
                    was refreshed, and no uptime figure exists anywhere in the
                    protocol to put here — see provider-detail.tsx. */}
                <Td py="py-5" right className="text-xs text-gray-400">
                  <span title={new Date(p.lastHealthUpdate).toLocaleString()}>
                    {sinceLabel(p.lastHealthUpdate, locale)}
                  </span>
                </Td>
                <Td py="py-5" right><StatusPill status={p.status} label={healthLabel(t, p.status)} /></Td>
              </Tr>
            );
          })}
          {visible.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-500">
                {t("noneOfType")}
              </td>
            </tr>
          )}
        </DataTable>
        <p className="mt-3 text-xs leading-relaxed text-gray-600">
          {t("dirFooter")}
        </p>
      </div>
    </div>
  );
}
