import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PROVIDERS, PROVIDER_TYPES, TYPE_COLORS, getProvider } from "@/lib/data/providers";
import { formatDate, shortAddress } from "@/lib/format";
import { CopyButton } from "@/components/copy-button";
import { MetricStrip } from "@/components/metrics";
import { Panel } from "@/components/panel";
import { StatusPill } from "@/components/status-pill";

interface Params {
  id: string;
}

export function generateStaticParams(): Params[] {
  return PROVIDERS.map((p) => ({ id: p.id }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params;
  const provider = getProvider(id);
  if (!provider) return {};
  return {
    title: `${provider.name} — ${PROVIDER_TYPES[provider.type]}`,
    description: `${provider.name} on the OpenFiat Service Registry: ${provider.description}`,
  };
}

export default async function ProviderPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const provider = getProvider(id);
  if (!provider) notFound();

  const color = TYPE_COLORS[provider.type];
  const sigTrunc = `${provider.signature.slice(0, 12)}…${provider.signature.slice(-8)}`;

  return (
    <section>
      <Link href="/providers" className="text-sm text-gray-500 hover:text-white">
        ← Back to Service Providers
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className={`h-2.5 w-2.5 rounded-full ${color.dot}`} />
        <h1 className="text-xl font-semibold text-white">{provider.name}</h1>
        <span className={`text-sm ${color.text}`}>{PROVIDER_TYPES[provider.type]}</span>
        <StatusPill status={provider.status} />
      </div>
      <p className="mt-2 max-w-3xl text-sm text-gray-400">{provider.description}</p>
      {provider.type === "Notification Provider" && (
        <p className="mt-3 max-w-3xl border-l-2 border-sky-400/50 bg-sky-400/5 px-4 py-2.5 text-sm text-gray-300">
          Notification providers enable <span className="text-white">offline merchants</span>: ads stay Online while a
          provider watches them and wakes the merchant on reservations and payment events.
        </p>
      )}

      <div className="mt-8">
        <MetricStrip
          items={[
            { label: "Uptime (30d)", value: `${provider.uptimePct}%` },
            { label: "Latency", value: `${provider.latencyMs} ms` },
            { label: "Region", value: provider.region },
            { label: "Protocols", value: provider.protocolVersions.join(", ") },
          ]}
        />
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <Panel title="Endpoints">
            <ol className="divide-y divide-white/5">
              {provider.endpoints.map((e) => (
                <li key={e} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span className="min-w-0 truncate font-mono text-xs text-gray-200">{e}</span>
                  <CopyButton value={e} />
                </li>
              ))}
            </ol>
            <p className="border-t border-white/10 px-4 py-2.5 text-[11px] leading-relaxed text-gray-500">
              On a real registry entry, the peer ID and public key below the endpoint are what would let you confirm
              you reached this provider and not an impostor advertising the same address — see the notice below.
            </p>
          </Panel>

          {/*
            * OFS-1500 §5 explains why a real entry needs these fields: a
            * registry row with only a URL gives a node no way to tell a real
            * provider from an impostor. But `PROVIDERS` is this app's
            * built-in sample directory (`lib/data/providers.ts`), and every
            * value below is a deterministic fake derived from the provider's
            * id — not a key anyone holds, and not a signature anything ever
            * checked. This used to be titled "Identity — verify before you
            * connect" with no indication of that anywhere in the panel
            * itself; someone who took the instruction literally would have
            * "verified" nothing. Said plainly here instead, on a live node's
            * registry entry (`lib/live-providers.ts`) these fields would be
            * real and worth checking.
            */}
          <Panel title="Identity (sample data — not a real key or signature)">
            <p className="px-4 pt-3 text-xs leading-relaxed text-amber-300">
              Every value below is generated from this provider&apos;s id for this demo directory. None of it is a real
              cryptographic key or signature, and copying it proves nothing about a real service.
            </p>
            <div className="mt-2 divide-y divide-white/5 px-4">
              <IdRow label="Peer ID" value={provider.peerId} />
              <IdRow label="Node identity" value={provider.nodeIdentity} />
              <IdRow label="Public key" value={provider.publicKey} />
              <IdRow label="Wallet (registration signer)" value={provider.wallet} />
              <IdRow label="Registration signature" value={provider.signature} />
            </div>
          </Panel>

          <Panel title="Capabilities">
            <ol className="divide-y divide-white/5">
              {provider.capabilities.map((c) => (
                <li key={c} className="px-4 py-2.5 text-sm text-gray-300">· {c}</li>
              ))}
            </ol>
          </Panel>

          <Panel title="Pricing">
            <ol className="divide-y divide-white/5">
              {provider.pricing.map((p) => (
                <li key={p.item} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                  <span className="text-gray-400">{p.item}</span>
                  <span className="tabular-nums text-gray-200">{p.price}</span>
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Registration (OFS-1500, sample data)">
            <div className="divide-y divide-white/5 px-4">
              <Row label="Service ID" value={provider.id} mono />
              <Row label="Provider wallet (not real)" value={shortAddress(provider.wallet)} copy={provider.wallet} />
              <Row label="Registered" value={formatDate(provider.registeredAt)} />
              <Row label="Signature (not real)" value={sigTrunc} copy={provider.signature} />
            </div>
          </Panel>

          <Panel title="Service">
            <div className="divide-y divide-white/5 px-4">
              <Row label="Type" value={provider.type} />
              <Row label="Status" value={provider.status} />
              <Row label="Region" value={provider.region} />
              <Row label="Protocol versions" value={provider.protocolVersions.join(", ")} />
            </div>
          </Panel>
        </div>
      </div>
    </section>
  );
}

function Row({ label, value, mono, copy }: { label: string; value: string; mono?: boolean; copy?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <span className="shrink-0 text-gray-500">{label}</span>
      <span className={`flex min-w-0 items-center gap-2 text-right text-gray-200 ${mono ? "font-mono text-xs" : ""}`}>
        <span className="truncate">{value}</span>
        {copy && <CopyButton value={copy} />}
      </span>
    </div>
  );
}

/** One copyable identity value. */
function IdRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 text-sm">
      <span className="shrink-0 text-gray-500">{label}</span>
      <span className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 truncate font-mono text-xs text-gray-300">{value}</span>
        <CopyButton value={value} />
      </span>
    </div>
  );
}
