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
  type: ServiceType;
  region: string;
  capabilities: string[];
  priceLabel: string;
  uptimeLabel: string;
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

function toRow(record: ServiceRecord): DirectoryRow {
  return {
    id: record.service_id,
    name: record.service_id,
    type: serviceTypeLabel(record.service_type),
    region: record.region ?? "—",
    capabilities: record.capabilities,
    // A declared price is now a token/amount/unit triple rather than free
    // text. Absent pricing already means free (OFS-4100 §9.5), so an
    // unpriced service says so rather than showing a placeholder dash that
    // reads as "unknown".
    priceLabel: formatPricing(record.pricing) ?? "Free",
    // OFS-1500 tracks a Health state (Online/Maintenance/Degraded/Offline),
    // not a rolling uptime percentage — showing a fabricated number here
    // would be less honest than admitting this isn't tracked.
    uptimeLabel: "—",
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
