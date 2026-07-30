import { Client, providers, type ServiceRecord, type ServiceType as LiveServiceType } from "@openfiat/sdk";
import { formatPricing } from "@/lib/earnings";
import type { ServiceType } from "@/lib/types";

/**
 * A directory row shaped for `ProvidersDirectory`'s table — deliberately
 * smaller than `ServiceProvider` (the mock dataset's rich type). A real
 * Service Registry entry (OFS-1500) has no "display name", uptime
 * percentage, or latency reading; a row honestly reflects the real
 * protocol's fields instead of inventing ones it doesn't have.
 */
export interface DirectoryRow {
  id: string;
  name: string;
  /**
   * The provider's PeerId as lowercase hex — the only identity the registry
   * has for whoever registered this service, and the seed the placeholder
   * avatar is drawn from. Hex specifically, and always the same encoding,
   * because a different spelling of the same key draws a different robot.
   */
  provider: string;
  type: ServiceType;
  region: string;
  capabilities: string[];
  priceLabel: string;
  /**
   * `last_health_update` in millis — when the provider was last heard from.
   *
   * This replaces an `uptimeLabel` that was unconditionally `"—"`. OFS-1500
   * tracks a health state and the time it was refreshed; it does not track
   * uptime, so a column headed Uptime told a reader the protocol measures
   * something it does not and that this node merely happened not to know it.
   * The timestamp is a real reading of the same question.
   */
  lastHealthUpdate: number;
  status: string;
  /** `/providers/<service id>`, which reads the same registry record. */
  href: string;
}

const LIVE_TYPE_LABEL: Record<string, ServiceType> = {
  "Infrastructure:SnapshotProvider": "Snapshot Provider",
  "Infrastructure:BootstrapNode": "Snapshot Provider", // no directory bucket for bootstrap nodes; grouped with infra
  "Infrastructure:PublicApiNode": "Public API Node",
  "Marketplace:MerchantGateway": "Merchant Gateway",
  "Marketplace:AnalyticsProvider": "Public API Node",
  "Notifications:Email": "Notification Provider",
  "Notifications:Telegram": "Notification Provider",
  "Notifications:Sms": "Notification Provider",
  "Notifications:Push": "Notification Provider",
  "Notifications:Webhook": "Notification Provider",
  "MarketData:PriceOracle": "Oracle Provider",
  "MarketData:FxOracle": "Oracle Provider",
  "Security:RiskIntelligenceProvider": "Risk Intelligence Provider",
  "Security:WalletFlaggingProvider": "Risk Intelligence Provider",
};

function serviceTypeLabel(type: LiveServiceType): ServiceType {
  const [category, variant] = Object.entries(type)[0];
  return LIVE_TYPE_LABEL[`${category}:${variant}`] ?? "Public API Node";
}

/** A `PeerId` arrives as raw bytes over the wire; hex is what this app shows. */
function hexPeer(peer: number[] | string): string {
  if (typeof peer === "string") return peer.toLowerCase();
  return peer.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function toRow(record: ServiceRecord): DirectoryRow {
  return {
    id: record.service_id,
    name: record.service_id,
    provider: hexPeer(record.provider),
    type: serviceTypeLabel(record.service_type),
    region: record.region ?? "—",
    capabilities: record.capabilities,
    // A declared price is now a token/amount/unit triple rather than free
    // text. Absent pricing already means free (OFS-4100 §9.5), so an
    // unpriced service says so rather than showing a placeholder dash that
    // reads as "unknown".
    priceLabel: formatPricing(record.pricing) ?? "Free",
    lastHealthUpdate: record.last_health_update,
    status: record.health,
    href: `/providers/${encodeURIComponent(record.service_id)}`,
  };
}

/**
 * Every registered service from a node's Service Registry (OFS-1500).
 */
export async function fetchLiveProviders(endpoint: string): Promise<DirectoryRow[]> {
  const client = new Client({ endpoint, timeoutMs: 5_000 });
  const records = await providers.getProviders(client);
  return records.map(toRow);
}


/**
 * One registry record, as the node reports it.
 *
 * Deliberately the raw `ServiceRecord` rather than a `DirectoryRow`: the
 * detail page shows fields the table has no room for, and every one of
 * them is a field OFS-1500 actually defines. The page it feeds does not
 * invent an uptime percentage or a latency reading, which is what made
 * the fixture-backed version it replaces dishonest.
 *
 * `null` when the registry has no such service. That is an ordinary
 * answer — an id from a stale link, or a record this node has not
 * replicated — and not an error to throw at the caller.
 */
export async function fetchProviderRecord(
  endpoint: string,
  serviceId: string,
): Promise<ServiceRecord | null> {
  const client = new Client({ endpoint, timeoutMs: 5_000 });
  try {
    return await providers.getProvider(client, serviceId);
  } catch {
    return null;
  }
}

/** The display label for a record's service type. */
export function labelForServiceType(type: LiveServiceType): ServiceType {
  return serviceTypeLabel(type);
}
