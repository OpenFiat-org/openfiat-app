"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
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
import { readCapabilities } from "@/lib/node-capabilities";
import { NODE_CHANGED_EVENT, readNodeSelection } from "@/lib/node-preference";

/** Known health states get a translated label over the canonical tone; others pass through. */
function healthLabel(t: (k: string) => string, status: string): string {
  return ["Online", "Offline", "Degraded", "Maintenance"].includes(status)
    ? t(`health.${status}`)
    : status;
}

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
  const t = useTranslations("providers");
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
    return <p className="text-sm text-gray-500">{t("readingRegistry")}</p>;
  }

  if (!record) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-6">
        <p className="text-sm text-gray-300">
          {t.rich("notInRegistry", {
            id: serviceId,
            hasNode: nodeLabel ? "yes" : "no",
            node: nodeLabel,
            m: (chunks) => <span className="font-mono">{chunks}</span>,
          })}
        </p>
        {/* Not "does not exist": a node answers from what it has replicated,
            and another node may know this service perfectly well. */}
        <p className="mt-2 text-xs text-gray-500">
          {t("notInRegistryNote")}
        </p>
        <Link href="/providers" className="mt-4 inline-block text-sm text-brand-hover hover:underline">
          {t("allServices")}
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
        <Panel title={t("brandingTitle")}>
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
              {t("brandingFooter")}
              {branding.logoCid && (
                <>
                  {" "}
                  {t.rich("brandingLogoNote", {
                    cid: (chunks) => <span className="font-mono break-all">{chunks}</span>,
                    value: branding.logoCid,
                  })}
                </>
              )}
            </p>
          </div>
        </Panel>
      )}

      <Panel
        title={t("regTitle")}
        action={<StatusPill status={record.health} label={healthLabel(t, record.health)} />}
      >
        <div className="divide-y divide-white/5 px-4">
          <Row label={t("rowServiceId")} value={record.service_id} mono />
          <Row
            label={t("rowType")}
            value={
              <span className="flex items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${color.dot}`} />
                {t(`providerType.${type}`)}
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
            label={t("rowRegion")}
            value={record.region ? t("regionDeclared", { region: record.region }) : t("regionNotDeclared")}
          />
          {/* Absent pricing means free (OFS-4100 §9.5) — not unknown. */}
          <Row label={t("rowPricing")} value={formatPricing(record.pricing) ?? t("freeWord")} />
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
            label={t("rowPayoutWallet")}
            value={record.payout_wallet ?? t("payoutNone")}
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

      <Panel title={t("reachTitle")}>
        <div className="px-4 py-4">
          {record.endpoints.length === 0 ? (
            <p className="text-sm text-gray-500">
              {t("noEndpoint")}
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

      <Panel title={t("claimsTitle")}>
        <div className="px-4 py-4">
          {record.capabilities.length === 0 ? (
            <p className="text-sm text-gray-500">{t("noneDeclared")}</p>
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
                <Claim label={t("claimChain")}>
                  {t(`chainClaim.${claims.chainMode ?? "none"}`)}
                  {claims.chainMode === "GossipOnly" && (
                    <span className="block text-xs text-gray-500">
                      {t("gossipLag")}
                    </span>
                  )}
                </Claim>
                <Claim label={t("claimContent")}>
                  {claims.servesContent ? t("servesContentYes") : t("servesContentNo")}
                </Claim>
                <Claim label={t("claimRetention")}>
                  {claims.retention
                    ? t("retentionClaim", { window: claims.retention })
                    : t("retentionNone")}
                </Claim>
                {claims.producesSnapshots && (
                  <Claim label={t("claimSnapshots")}>{t("snapshotsClaim")}</Claim>
                )}
                {/* Anything this build has no reading for, shown as itself.
                    The vocabulary grows, and a page that renders only the
                    four it knows hides the fifth without saying so. */}
                {claims.unrecognised.length > 0 && (
                  <Claim label={t("claimAlsoDeclared")}>
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
                      {t("alsoDeclaredNote")}
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
            {t("speaksOfs", {
              list: record.supported_ofs.length > 0 ? record.supported_ofs.join(", ") : t("ofsNone"),
            })}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-gray-500">
            {t.rich("detailClaimsFooter", {
              code: (chunks) => <code className="font-mono">{chunks}</code>,
              link: (chunks) => (
                <Link href="/network" className="text-brand-hover hover:underline">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </div>
      </Panel>

      <Panel title={t("identityHealthTitle")}>
        <div className="divide-y divide-white/5 px-4">
          <Row
            label={t("rowProvider")}
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
          <Row label={t("rowRegistered")} value={formatMoment(record.registered_at)} />
          <Row
            label={t("rowLastHealth")}
            value={`${formatMoment(record.last_health_update)} · ${sinceLabel(record.last_health_update)}`}
          />
        </div>
        <p className="px-4 pb-4 pt-1 text-xs text-gray-500">
          {t("healthFooter")}
        </p>
      </Panel>

      <Link href="/providers" className="inline-block text-sm text-brand-hover hover:underline">
        {t("allServices")}
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
