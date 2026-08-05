"use client";

import { Link } from "@/i18n/navigation";
import { useCallback, useEffect, useState } from "react";
import { Panel } from "@/components/panel";
import { ProviderFeeQuote } from "@/components/providers/fee-quote";
import { StatusPill } from "@/components/status-pill";
import { WalletAvatar } from "@/components/wallet-avatar";
import { TYPE_COLORS } from "@/lib/provider-display";
import { formatPricing } from "@/lib/earnings";
import { sinceLabel } from "@/lib/format";
import {
  fetchProviderRecord,
  labelForServiceType,
  readBranding,
  type RecordWithBranding,
} from "@/lib/live-providers";
import { chainModeClaim, readCapabilities } from "@/lib/node-capabilities";
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
  const [record, setRecord] = useState<RecordWithBranding | null>(null);
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
  const claims = readCapabilities(record.capabilities);
  const branding = readBranding(record);

  return (
    <div className="space-y-6">
      {/*
        * First, because it is what a reader looks for, and headed with
        * what it is. "How this provider presents itself" rather than
        * "About": the panel exists to carry four self-asserted strings,
        * and a neutral heading would let them read as facts the page
        * established. Absent entirely when nothing was declared — an
        * empty panel would suggest the answer is unknown rather than
        * that there was no claim.
        */}
      {branding && (
        <Panel title="How this provider presents itself">
          <div className="px-4 py-4">
            <div className="flex items-start gap-4">
              {branding.logoUrl && (
                <img
                  src={branding.logoUrl}
                  alt=""
                  width={56}
                  height={56}
                  className="h-14 w-14 shrink-0 rounded-lg border border-white/10 bg-white/5 object-cover"
                />
              )}
              <div className="min-w-0">
                {branding.name && (
                  <p className="text-base font-medium text-white">{branding.name}</p>
                )}
                {branding.description && (
                  <p className="mt-1 text-sm leading-relaxed text-gray-400">
                    {branding.description}
                  </p>
                )}
                {branding.website && (
                  <a
                    href={branding.website}
                    target="_blank"
                    // `noopener` because the opened page can otherwise
                    // reach back through `window.opener` and navigate
                    // this one; `noreferrer` so the provider is not told
                    // which page the visitor came from.
                    rel="noopener noreferrer nofollow"
                    className="mt-2 inline-block break-all text-sm text-brand-hover hover:underline"
                  >
                    {branding.website}
                  </a>
                )}
              </div>
            </div>
            <p className="mt-4 border-t border-white/5 pt-3 text-xs leading-relaxed text-gray-500">
              All four of these are declared by the provider in its own signed registration.
              The signature proves the record reached you unaltered and proves nothing else:
              nobody checks that the name is theirs to use, and the registry deliberately does
              not hand out exclusive names. Judge this entry by the Service ID and provider key
              below.
              {branding.logoCid && (
                <>
                  {" "}
                  The logo is fetched from your access node by content hash (
                  <span className="font-mono break-all">{branding.logoCid}</span>), never from
                  the provider&apos;s own server — so viewing this page tells them nothing.
                </>
              )}
            </p>
          </div>
        </Panel>
      )}

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
          {/*
            * Self-declared and unverified, permanently. Deriving it from
            * the endpoint's address was investigated (#173) and
            * rejected: geolocation answers "where does this socket
            * terminate", which is not the question OFS-1500 §10 asks —
            * a VPS in Frankfurt serving Kenya is the ordinary
            * deployment here, not the edge case. See
            * `docs/region-is-declared.md` in openfiat-core.
            */}
          <Row
            label="Region"
            value={record.region ? `${record.region} (declared, unverified)` : "Not declared"}
          />
          {/* Absent pricing means free (OFS-4100 §9.5) — not unknown. */}
          <Row label="Pricing" value={formatPricing(record.pricing) ?? "Free"} />
          {/*
            * The operator's own business, and this is their page rather
            * than a directory row — the services list deliberately does
            * not carry it.
            *
            * A node always has one now: it defaults to the node's own
            * identity address, the key it signs every event with, because
            * "this node has no wallet" was never true and registering it
            * as absent left a node doing real work with nowhere for its
            * share to go. An absent one here means a service that is not
            * charging, which OFS-4100 §9.5 allows.
            */}
          <Row
            label="Payout wallet"
            value={record.payout_wallet ?? "None declared — this service is not charging"}
            mono={Boolean(record.payout_wallet)}
          />
        </div>
      </Panel>

      {/*
        * Straight after the registration, because it is the same question
        * the Pricing row above raises and cannot answer: the declared price
        * is in the provider's chosen token, and a reader holding a different
        * one has no way to compare two services from it.
        */}
      <ProviderFeeQuote
        serviceId={record.service_id}
        declaredMint={record.pricing?.token_mint ?? null}
      />

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

      <Panel title="What this service claims it can do">
        <div className="px-4 py-4">
          {record.capabilities.length === 0 ? (
            <p className="text-sm text-gray-500">None declared.</p>
          ) : (
            <>
              {/*
                * Read into what each one means for someone deciding whether
                * to use this node, then the raw strings underneath. A node
                * derives these from its running configuration, so they are
                * accurate about what it was told to be — and signed by the
                * node itself, so they are not evidence of anything. Nothing
                * here gets a checkmark; see lib/node-capabilities.ts.
                */}
              <dl className="space-y-2 text-sm">
                <Claim label="Chain">
                  {chainModeClaim(claims.chainMode)}
                  {claims.chainMode === "GossipOnly" && (
                    <span className="block text-xs text-gray-500">
                      On-chain answers reach it second-hand over gossip, so they can lag.
                    </span>
                  )}
                </Claim>
                <Claim label="Content">
                  {claims.servesContent
                    ? "Claims to hold and serve protocol content — it can hand over an attachment or an avatar itself."
                    : "Does not claim to serve content, so attachments have to come from somewhere else."}
                </Claim>
                <Claim label="Retention">
                  {claims.retention
                    ? `Claims to keep content ${claims.retention} — that is how far back it can answer for evidence.`
                    : "No retention window declared."}
                </Claim>
                {claims.producesSnapshots && (
                  <Claim label="Snapshots">Claims to produce snapshots other nodes can fetch.</Claim>
                )}
                {/* Anything this build has no reading for, shown as itself.
                    The vocabulary grows, and a page that renders only the
                    four it knows hides the fifth without saying so. */}
                {claims.unrecognised.length > 0 && (
                  <Claim label="Also declared">
                    <span className="flex flex-wrap gap-1.5">
                      {claims.unrecognised.map((capability) => (
                        <span
                          key={capability}
                          className="rounded-full border border-white/10 px-2.5 py-0.5 font-mono text-xs text-gray-300"
                        >
                          {capability}
                        </span>
                      ))}
                    </span>
                    <span className="block text-xs text-gray-500">
                      Capabilities this build of the app has no reading for. Shown as the node
                      wrote them rather than dropped.
                    </span>
                  </Claim>
                )}
              </dl>

              <div className="mt-4 flex flex-wrap gap-1.5 border-t border-white/5 pt-3">
                {record.capabilities.map((capability) => (
                  <span
                    key={capability}
                    className="rounded-full border border-white/10 px-2.5 py-0.5 font-mono text-[11px] text-gray-500"
                  >
                    {capability}
                  </span>
                ))}
              </div>
            </>
          )}
          <p className="mt-4 text-xs leading-relaxed text-gray-500">
            Speaks OFS{" "}
            {record.supported_ofs.length > 0
              ? record.supported_ofs.join(", ")
              : "— none declared"}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-gray-500">
            All of the above is a claim. A registration is signed by the provider&apos;s own key and
            says what its operator configured; nothing on this page verifies it. A chain claim is
            cheap to check — a node that is not reading Solana cannot answer{" "}
            <code className="font-mono">getChainStatus</code> with a slot — and{" "}
            <Link href="/network" className="text-brand-hover hover:underline">
              Nodes &amp; peers
            </Link>{" "}
            asks every node it lists and shows the answer beside the claim.
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

/** One reading of a capability claim, phrased as a claim. */
function Claim({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="shrink-0 text-gray-500 sm:w-28">{label}</dt>
      <dd className="min-w-0 text-gray-300">{children}</dd>
    </div>
  );
}
