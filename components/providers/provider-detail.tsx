"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ServiceRecord } from "@openfiat/sdk";

import { Panel } from "@/components/panel";
import { StatusPill } from "@/components/status-pill";
import { WalletAvatar } from "@/components/wallet-avatar";
import { TYPE_COLORS } from "@/lib/data/providers";
import { formatPricing } from "@/lib/earnings";
import { sinceLabel } from "@/lib/format";
import { fetchProviderRecord, labelForServiceType } from "@/lib/live-providers";
import { NODE_CHANGED_EVENT, readNodeSelection } from "@/lib/node-preference";

/**
 * One service, as the selected node's Service Registry reports it.
 *
 * # Every field here is one OFS-1500 defines
 *
 * The page this replaces was generated from a fixture: invented uptime
 * percentages, invented latencies, invented regions, for nineteen
 * services that did not exist — and it was in the sitemap, so those were
 * submitted to search engines as real.
 *
 * So the rule for this page is that a field appears only if a registry
 * record carries it. There is deliberately **no uptime percentage and no
 * latency reading**: neither exists anywhere in the protocol, and the
 * only way to show one is to make it up. What OFS-1500 does track is a
 * health state and the time it was last updated, and "last heard from"
 * derived from that timestamp is a real answer to the question people
 * were using uptime to ask.
 */
export function ProviderDetail({ serviceId }: { serviceId: string }) {
  const [record, setRecord] = useState<ServiceRecord | null>(null);
  const [nodeLabel, setNodeLabel] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const selection = readNodeSelection();
    setNodeLabel(selection.label);
    setLoading(true);
    setRecord(await fetchProviderRecord(selection.url, serviceId));
    setLoading(false);
  }, [serviceId]);

  useEffect(() => {
    void load();
    window.addEventListener(NODE_CHANGED_EVENT, load);
    return () => window.removeEventListener(NODE_CHANGED_EVENT, load);
  }, [load]);

  if (loading) {
    return <p className="text-sm text-gray-500">Reading the registry…</p>;
  }

  if (!record) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-6">
        <p className="text-sm text-gray-300">
          <span className="font-mono">{serviceId}</span> is not in the registry
          {nodeLabel && <> that {nodeLabel} reports</>}.
        </p>
        {/* Not "does not exist": a node answers from what it has replicated,
            and another node may know this service perfectly well. */}
        <p className="mt-2 text-xs text-gray-500">
          A node answers from the registry it has replicated, so a different
          access node may know it. Services also expire when their provider
          stops sending health updates.
        </p>
        <Link href="/providers" className="mt-4 inline-block text-sm text-brand-hover hover:underline">
          ← All services
        </Link>
      </div>
    );
  }

  const type = labelForServiceType(record.service_type);
  const color = TYPE_COLORS[type];

  return (
    <div className="space-y-6">
      <Panel
        title="Registration"
        action={<StatusPill status={record.health} />}
      >
        <div className="divide-y divide-white/5 px-4">
          <Row label="Service ID" value={record.service_id} mono />
          <Row
            label="Type"
            value={
              <span className="flex items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${color.dot}`} />
                {type}
              </span>
            }
          />
          <Row label="Region" value={record.region ?? "Not declared"} />
          {/* Absent pricing means free (OFS-4100 §9.5) — not unknown. */}
          <Row label="Pricing" value={formatPricing(record.pricing) ?? "Free"} />
          <Row
            label="Payout wallet"
            value={record.payout_wallet ?? "None — this service is not charging"}
            mono={Boolean(record.payout_wallet)}
          />
        </div>
      </Panel>

      <Panel title="Reachability">
        <div className="px-4 py-4">
          {record.endpoints.length === 0 ? (
            <p className="text-sm text-gray-500">
              No endpoint declared. Providers reached over gossip rather than
              directly do not need one.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {record.endpoints.map((endpoint) => (
                <li key={endpoint} className="font-mono text-sm break-all text-gray-300">
                  {endpoint}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>

      <Panel title="Capabilities">
        <div className="px-4 py-4">
          {record.capabilities.length === 0 ? (
            <p className="text-sm text-gray-500">None declared.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {record.capabilities.map((capability) => (
                <span
                  key={capability}
                  className="rounded-full border border-white/10 px-2.5 py-0.5 font-mono text-xs text-gray-300"
                >
                  {capability}
                </span>
              ))}
            </div>
          )}
          <p className="mt-4 text-xs text-gray-500">
            Speaks OFS{" "}
            {record.supported_ofs.length > 0
              ? record.supported_ofs.join(", ")
              : "— none declared"}
          </p>
        </div>
      </Panel>

      <Panel title="Identity and health">
        <div className="divide-y divide-white/5 px-4">
          <Row
            label="Provider"
            value={
              <span className="inline-flex items-center gap-2">
                {/* Same seed as the directory row this page was reached from,
                    so the operator looks the same in both places. */}
                <WalletAvatar
                  seed={hexPeer(record.provider)}
                  label={record.service_id}
                  size={24}
                />
                <span className="font-mono text-xs">{hexPeer(record.provider)}</span>
              </span>
            }
          />
          <Row label="Registered" value={formatMoment(record.registered_at)} />
          <Row
            label="Last health update"
            value={`${formatMoment(record.last_health_update)} · ${sinceLabel(record.last_health_update)}`}
          />
        </div>
        <p className="px-4 pb-4 pt-1 text-xs text-gray-500">
          The registry records a health state and when it was last refreshed,
          not an uptime percentage — so this page shows when the provider was
          last heard from rather than a figure the protocol does not measure.
        </p>
      </Panel>

      <Link href="/providers" className="inline-block text-sm text-brand-hover hover:underline">
        ← All services
      </Link>
    </div>
  );
}

/** A `PeerId` arrives as raw bytes; hex is what the rest of the app shows. */
function hexPeer(peer: number[] | string): string {
  if (typeof peer === "string") return peer;
  return peer.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function formatMoment(millis: number): string {
  return new Date(millis).toLocaleString();
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <span className="shrink-0 text-gray-500">{label}</span>
      <span className={`min-w-0 text-right break-all text-gray-200 ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </span>
    </div>
  );
}
