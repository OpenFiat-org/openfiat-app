import { Client, providers, type ServiceRecord, type ServiceType as LiveServiceType } from "@openfiat/sdk";
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
  /** `/providers/[id]` only exists for the static mock dataset. */
  href: string | null;
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
    priceLabel: record.pricing ?? "—",
    // OFS-1500 tracks a Health state (Online/Maintenance/Degraded/Offline),
    // not a rolling uptime percentage — showing a fabricated number here
    // would be less honest than admitting this isn't tracked.
    uptimeLabel: "—",
    status: record.health,
    href: null,
  };
}

/**
 * Fetches every registered service from a live node's Service Registry
 * (OFS-1500) — the real counterpart to `lib/data/providers.ts`'s
 * simulated `PROVIDERS`. Used only when the user has picked a real,
 * live-checked custom node (see `lib/node-preference.ts`); every other
 * access-node selection keeps using the static mock dataset.
 */
export async function fetchLiveProviders(endpoint: string): Promise<DirectoryRow[]> {
  const client = new Client({ endpoint, timeoutMs: 5_000 });
  const records = await providers.getProviders(client);
  return records.map(toRow);
}
