import { Client, providers, type ServiceRecord } from "@openfiat/sdk";

import { nodeRpc } from "@/lib/node-rpc";
import { peerIdParam } from "@/lib/wallet-param";

/**
 * What registered risk intelligence providers have said about one wallet
 * (OFS-7100).
 *
 * # Why "no flags" is the answer that needs the most care
 *
 * `getWalletScreening` answers with the worst severity among current,
 * unsuperseded `Flagged` records, and `null` when there is none. That
 * `null` covers two situations the spec keeps apart and the wire does not:
 * no provider has ever reported on this wallet, and a provider reported and
 * then published a `Cleared` record superseding it. §14 keeps the history —
 * "Historical records remain available for audit purposes" — so the
 * distinction is recoverable, and this module recovers it by reading
 * `getRiskRecordsByWallet` alongside the screening.
 *
 * There is a third situation underneath both, and it is the one that would
 * actually mislead somebody: **nobody is screening anything**. A record may
 * only be published by a provider registered under `Security` (OFS-7100
 * §5), and on a network with none registered, every wallet screens clean —
 * including the ones that should not. A green tick there would be this app
 * inventing a clean bill of health out of an empty registry. So
 * {@link fetchScreening} counts the registered providers and reports the
 * count, and a caller with zero of them must say so rather than say "clear".
 *
 * # This app reads; it never publishes
 *
 * `sendRiskPublish` is deliberately absent from this app. Publishing a flag
 * about somebody else is a registered provider's action, gated by a
 * governance approval that — as `lib/earnings.ts` records — is not built:
 * nothing in the registry checks it today. A publish control in a
 * general-purpose wallet interface would be an accusation surface with no
 * accountability behind it, and it is not one this app is going to grow.
 */

/** §8's tiers, ascending — `Critical` is the most severe. */
export type Severity = "Informational" | "Low" | "Medium" | "High" | "Critical";

/** §9's confidence levels, as the record carries them. */
export type Confidence = "Unknown" | "Low" | "Medium" | "High" | "VeryHigh";

/** §6's provider categories: what kind of source produced a record. */
export type ProviderCategory =
  | "BlockchainAnalytics"
  | "FraudIntelligence"
  | "Compliance"
  | "CommunityIntelligence"
  | "InfrastructureIntelligence";

export interface RiskRecord {
  id: string;
  /** The publishing provider's PeerId — checkable against the registry. */
  provider: string;
  wallet: string;
  category: ProviderCategory;
  outcome: "Flagged" | "Cleared";
  severity: Severity;
  confidence: Confidence;
  reason: string;
  /** §10: references to evidence — case numbers, tx hashes — not evidence itself. */
  evidence: string[];
  publishedAt: number;
  /** `null` means it does not expire, not that it has expired. */
  expiresAt: number | null;
}

interface RawRiskRecord extends Omit<RiskRecord, "publishedAt" | "expiresAt"> {
  published_at: number;
  expires_at: number | null;
}

interface RawScreening {
  wallet: string;
  highest_severity: Severity | null;
  active_flags: RawRiskRecord[];
}

/**
 * The screening verdict, with the two "no flag" cases kept apart and the
 * registry's own emptiness carried alongside.
 */
export interface Screening {
  /** The worst current severity, or `null` when nothing current is flagged. */
  highestSeverity: Severity | null;
  /** The current, unsuperseded flags behind that severity. */
  activeFlags: RiskRecord[];
  /**
   * Every record ever published about this wallet, current or not.
   *
   * Empty and `activeFlags` empty means nobody has ever looked. Non-empty
   * with `activeFlags` empty means somebody looked and the outcome no
   * longer stands — a cleared wallet, which is a stronger statement than an
   * unexamined one and is worth saying differently.
   */
  history: RiskRecord[];
  /**
   * How many `Security` providers the answering node has on file.
   *
   * Zero means no record could have been published to this node at all, so
   * "no flags" says nothing about the wallet. Rendered, never hidden.
   */
  registeredProviders: number;
  /**
   * The instant this screening was taken, and the one every record on it
   * should be judged expired against.
   *
   * Carried rather than left to each renderer's `Date.now()`: the node
   * decided `activeFlags` against *its* clock at one instant, and a view
   * re-deciding per record per render can show a record as expired while
   * the verdict beside it still counts it. One instant for the whole
   * answer keeps the two consistent.
   */
  screenedAt: number;
}

/** §12: expired data is not current data. Judged against one stated instant. */
export function isExpired(record: RiskRecord, at: number): boolean {
  return record.expiresAt !== null && record.expiresAt <= at;
}

function toRecord(raw: RawRiskRecord): RiskRecord {
  return {
    id: raw.id,
    provider: raw.provider,
    wallet: raw.wallet,
    category: raw.category,
    outcome: raw.outcome,
    severity: raw.severity,
    confidence: raw.confidence,
    reason: raw.reason,
    evidence: raw.evidence ?? [],
    publishedAt: raw.published_at,
    expiresAt: raw.expires_at ?? null,
  };
}

function isRiskProvider(record: ServiceRecord): boolean {
  return "Security" in record.service_type;
}

/**
 * One node's screening of one wallet, the history behind it, and how many
 * providers could have contributed.
 *
 * `peerId` is a base58 PeerId; {@link peerIdParam} does the base64 encoding
 * the node's `wallet` parameter actually wants — passing the base58 through
 * would silently screen a wallet belonging to nobody and come back clean.
 *
 * Throws when the node cannot be reached. A wallet with nothing said about
 * it is a real answer and must not be manufactured out of a timeout.
 */
export async function fetchScreening(endpoint: string, peerId: string): Promise<Screening> {
  const wallet = peerIdParam(peerId);
  const screenedAt = Date.now();
  const [screening, history, services] = await Promise.all([
    nodeRpc<RawScreening>(endpoint, "getWalletScreening", { wallet }),
    nodeRpc<RawRiskRecord[]>(endpoint, "getRiskRecordsByWallet", { wallet }),
    providers.getProviders(new Client({ endpoint, timeoutMs: 8_000 })),
  ]);
  return {
    highestSeverity: screening.highest_severity ?? null,
    activeFlags: (screening.active_flags ?? []).map(toRecord),
    history: (history ?? [])
      .map(toRecord)
      .sort((a, b) => b.publishedAt - a.publishedAt),
    registeredProviders: services.filter(isRiskProvider).length,
    screenedAt,
  };
}

/** Tailwind text colour per tier. Informational is not a warning. */
export const SEVERITY_TONE: Record<Severity, string> = {
  Informational: "text-gray-300",
  Low: "text-gray-200",
  Medium: "text-amber-300",
  High: "text-orange-400",
  Critical: "text-red-400",
};

/** What each tier covers, from §8 — so a bare word is not the whole message. */
export const SEVERITY_NOTE: Record<Severity, string> = {
  Informational: "Watchlist, ongoing investigation, monitoring only.",
  Low: "Newly created wallet, limited history, elevated but unconfirmed.",
  Medium: "Suspicious behaviour, repeated disputes, high-risk patterns.",
  High: "Known scam wallet, confirmed phishing, fraud ring, money mule.",
  Critical: "Stolen funds, sanctions, terrorist financing, ransomware.",
};
