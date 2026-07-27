import type { ServiceProvider, ServiceType } from "@/lib/types";
import { pseudoAddress } from "@/lib/format";

/**
 * Simulated Service Registry (OFS-1500). The registry is permissionless:
 * anyone can register a service — endpoints, protocol versions, capabilities,
 * pricing — signed by their wallet, and get discovered by nodes and merchants.
 * Deterministic demo data until connected to a live node.
 */

export const PROVIDER_TYPES: Record<ServiceType, string> = {
  "Notification Provider": "Notifications",
  "Oracle Provider": "Price Oracles",
  "Risk Intelligence Provider": "Risk Intelligence",
  "Snapshot Provider": "Snapshots",
  "Merchant Gateway": "Merchant Gateways",
  "Public API Node": "API Nodes",
};

/** Type accent colors for directory markers. */
export const TYPE_COLORS: Record<ServiceType, { dot: string; text: string }> = {
  "Notification Provider": { dot: "bg-sky-400", text: "text-sky-300" },
  "Oracle Provider": { dot: "bg-amber-400", text: "text-amber-300" },
  "Risk Intelligence Provider": { dot: "bg-red-400", text: "text-red-300" },
  "Snapshot Provider": { dot: "bg-brand-teal", text: "text-brand-teal" },
  "Merchant Gateway": { dot: "bg-violet-400", text: "text-violet-300" },
  "Public API Node": { dot: "bg-gray-400", text: "text-gray-300" },
};

type Raw = [
  id: string,
  name: string,
  type: ServiceType,
  region: string,
  endpoints: string[],
  capabilities: string[],
  pricing: Array<[string, string]>,
  uptimePct: number,
  latencyMs: number,
  status: ServiceProvider["status"],
  registeredAt: string,
  description: string,
];

const RAW: Raw[] = [
  // ── Notification Providers (OFS-6000 channels) ──
  ["svc-pingrelay", "PingRelay", "Notification Provider", "Nairobi, KE",
    ["https://api.pingrelay.example/v1", "wss://ws.pingrelay.example/v1/stream"],
    ["Email", "Webhooks", "Web Push", "Mobile Push", "Delivery receipts", "Template localization (12 locales)"],
    [["Email / push per 1k messages", "0.8 OPEN"], ["Webhook deliveries per 1k", "1.2 OPEN"], ["Dedicated IPs", "40 OPEN/mo"]],
    99.95, 14, "Online", "2026-03-02T09:00:00Z",
    "High-throughput transactional email and push delivery tuned for trade-session alerts."],
  ["svc-notifyhive", "NotifyHive", "Notification Provider", "Lagos, NG",
    ["https://api.notifyhive.example/v2"],
    ["SMS (210 countries)", "Email", "Sender-ID registration", "OTP-optimized routes"],
    [["SMS per 1k messages", "2.4 OPEN"], ["Email per 1k", "0.6 OPEN"]],
    99.7, 32, "Online", "2026-03-11T14:30:00Z",
    "SMS-first notifier with direct carrier routes across Africa, MENA, and South Asia."],
  ["svc-tgrambridge", "TgramBridge", "Notification Provider", "Dubai, AE",
    ["https://api.tgrambridge.example/v1", "dnsaddr=/dns4/relay.tgrambridge.example/tcp/443"],
    ["Telegram bots", "Telegram channels", "Chat-style trade notifications", "Inline action buttons"],
    [["Telegram messages per 1k", "0.5 OPEN"], ["Managed bot hosting", "15 OPEN/mo"]],
    99.9, 21, "Online", "2026-03-18T11:00:00Z",
    "Managed Telegram delivery for trade sessions — mirrors the chat log into your Telegram."],
  ["svc-discorddispatch", "DiscordDispatch", "Notification Provider", "Frankfurt, DE",
    ["https://api.discorddispatch.example/v1"],
    ["Discord DMs", "Discord server webhooks", "Role-gated alerts"],
    [["Discord messages per 1k", "0.4 OPEN"]],
    99.4, 27, "Degraded", "2026-04-02T16:45:00Z",
    "Community-channel notifications for merchant teams coordinating on Discord."],
  ["svc-pushsignal", "PushSignal", "Notification Provider", "Singapore, SG",
    ["https://api.pushsignal.example/v1", "wss://rt.pushsignal.example/v1"],
    ["Web Push (VAPID)", "Mobile Push (FCM/APNs)", "Silent data pushes", "Topic subscriptions"],
    [["Push per 1k messages", "0.7 OPEN"], ["Rich notifications", "1.0 OPEN/1k"]],
    99.85, 18, "Online", "2026-04-09T08:20:00Z",
    "Low-latency browser and mobile push for escrow state changes."],

  // ── Oracle Providers ──
  ["svc-ratesource", "RateSource FX", "Oracle Provider", "London, UK",
    ["https://api.ratesource.example/v3", "wss://feeds.ratesource.example/v3"],
    ["180+ fiat pairs vs USD", "Crypto spot (USDT/USDC/USD1/SOL)", "30s update frequency", "Median-of-8 sources", "Signed price attestations"],
    [["Per currency-pair feed", "6 OPEN/mo"], ["Full-book feed (all pairs)", "240 OPEN/mo"]],
    99.98, 9, "Online", "2026-02-20T10:00:00Z",
    "Institutional FX mid-rates powering floating-price advertisements across 180+ pairs."],
  ["svc-openprice", "OpenPrice Oracle", "Oracle Provider", "New York, US",
    ["https://api.openprice.example/v1"],
    ["Fiat pairs vs USD", "Stablecoin depeg detection", "60s update frequency", "Confidence intervals"],
    [["Per currency-pair feed", "4 OPEN/mo"], ["Depeg alerts", "12 OPEN/mo"]],
    99.9, 15, "Online", "2026-03-05T13:10:00Z",
    "Community-governed price oracle with public source transparency and depeg circuit breakers."],
  ["svc-parityfeed", "ParityFeed", "Oracle Provider", "Zurich, CH",
    ["https://api.parityfeed.example/v2", "dnsaddr=/dns4/oracle.parityfeed.example/tcp/8443"],
    ["Fiat pairs vs USD", "Precious metals reference", "15s update frequency", "Outlier rejection"],
    [["Per currency-pair feed", "8 OPEN/mo"], ["Enterprise SLA", "400 OPEN/mo"]],
    99.99, 7, "Online", "2026-02-14T09:40:00Z",
    "Ultra-low-latency reference rates for professional market makers."],
  ["svc-fxbeacon", "FxBeacon", "Oracle Provider", "Mumbai, IN",
    ["https://api.fxbeacon.example/v1"],
    ["South-Asian fiat pairs (INR/PKR/BDT/LKR/NPR)", "120s update frequency", "Local-exchange sampling"],
    [["Per currency-pair feed", "2 OPEN/mo"]],
    99.2, 41, "Degraded", "2026-04-22T17:00:00Z",
    "Regional oracle sampling local exchanges for tighter South-Asian fiat pricing."],

  // ── Risk Intelligence Providers ──
  ["svc-cipherowl", "CipherOwl Risk", "Risk Intelligence Provider", "Berlin, DE",
    ["https://api.cipherowl.example/v2"],
    ["Wallet screening (sanctions/illicit)", "Confidence scoring 0–100", "Mixer & darknet exposure", "Real-time alerts", "Batch screening API"],
    [["Per wallet screen", "0.02 OPEN"], ["Merchant plan (10k screens/mo)", "150 OPEN/mo"]],
    99.9, 24, "Online", "2026-03-01T12:00:00Z",
    "Counterparty wallet risk scoring so merchants can screen before locking escrow."],
  ["svc-chainsentinel", "ChainSentinel", "Risk Intelligence Provider", "Toronto, CA",
    ["https://api.chainsentinel.example/v1", "wss://alerts.chainsentinel.example/v1"],
    ["Wallet screening", "Stolen-funds tracing", "Address clustering", "Webhook risk alerts"],
    [["Per wallet screen", "0.03 OPEN"], ["Trace report", "5 OPEN"]],
    99.6, 29, "Online", "2026-03-27T15:30:00Z",
    "Forensic-grade tracing and clustering for high-value OTC desks."],
  ["svc-sentryscore", "SentryScore", "Risk Intelligence Provider", "Sydney, AU",
    ["https://api.sentryscore.example/v1"],
    ["Wallet screening", "Behavioral risk heuristics", "Confidence scoring", "Merchant dispute-pattern signals"],
    [["Per wallet screen", "0.015 OPEN"], ["Behavioral add-on", "60 OPEN/mo"]],
    98.8, 36, "Offline", "2026-05-06T10:15:00Z",
    "Lightweight screening focused on P2P behavioral patterns and dispute histories."],

  // ── Snapshot Providers ──
  ["svc-statearc", "StateArc", "Snapshot Provider", "Virginia, US",
    ["https://snapshots.statearc.example/", "dnsaddr=/dns4/node.statearc.example/tcp/9000"],
    ["Daily full-state snapshots", "90-day retention", "Torrent + HTTPS distribution", "Incremental deltas", "Signed manifests"],
    [["Snapshot distribution", "Free (public good)"], ["Priority mirrors", "25 OPEN/mo"]],
    99.95, 12, "Online", "2026-02-10T08:00:00Z",
    "Fast node bootstrapping via signed daily state snapshots with 90-day retention."],
  ["svc-snapvault", "SnapVault", "Snapshot Provider", "Frankfurt, DE",
    ["https://snapshots.snapvault.example/"],
    ["Daily full-state snapshots", "365-day retention", "HTTPS distribution", "Signed manifests"],
    [["Snapshot distribution", "Free (public good)"], ["Archive access (>90d)", "10 OPEN/mo"]],
    99.8, 19, "Online", "2026-03-15T09:30:00Z",
    "Long-retention archive of OpenFiat state for auditors and new nodes."],
  ["svc-ledgerlake", "LedgerLake", "Snapshot Provider", "Singapore, SG",
    ["https://snapshots.ledgerlake.example/", "dnsaddr=/dns4/apac.ledgerlake.example/tcp/9000"],
    ["Daily full-state snapshots", "30-day retention", "APAC-optimized mirrors", "Signed manifests"],
    [["Snapshot distribution", "Free (public good)"]],
    99.3, 44, "Degraded", "2026-04-19T14:00:00Z",
    "APAC snapshot mirrors cutting bootstrap times for nodes in Asia-Pacific."],

  // ── Merchant Gateways ──
  ["svc-merchantbridge", "MerchantBridge", "Merchant Gateway", "London, UK",
    ["https://gw.merchantbridge.example/v1", "wss://gw.merchantbridge.example/v1/stream"],
    ["HMAC-signed API keys", "Ad & liquidity management API", "WebSocket order flow", "Sandbox environment", "FIX 4.4 bridge"],
    [["REST/WebSocket plan", "120 OPEN/mo"], ["FIX bridge", "450 OPEN/mo"]],
    99.97, 11, "Online", "2026-02-25T11:20:00Z",
    "Programmatic ad-book and liquidity management for professional merchants and OTC desks."],
  ["svc-gatewayos", "GatewayOS", "Merchant Gateway", "Nairobi, KE",
    ["https://gw.gatewayos.example/v1"],
    ["HMAC-signed API keys", "Ad & liquidity management API", "Mobile-money payout rails", "Sandbox environment"],
    [["REST plan", "60 OPEN/mo"], ["Per automated settlement", "0.01 OPEN"]],
    99.5, 26, "Online", "2026-04-01T10:45:00Z",
    "Merchant automation with native M-Pesa and mobile-money payout integrations."],

  // ── Public API Nodes ──
  ["svc-openapirelay", "OpenAPI Relay", "Public API Node", "Virginia, US",
    ["https://api.openapirelay.example/v1"],
    ["Public order-book API", "Rate-limited free tier", "CORS-enabled", "OpenAPI 3.1 spec"],
    [["Free tier (60 req/min)", "Free"], ["Pro (3k req/min)", "80 OPEN/mo"]],
    99.9, 16, "Online", "2026-03-08T09:00:00Z",
    "Public read API for the order book, trades, and protocol events — power for third-party apps."],
  ["svc-dataport", "DataPort Node", "Public API Node", "São Paulo, BR",
    ["https://api.dataport.example/v1"],
    ["Public order-book API", "Historical event export", "CSV/JSONL bulk dumps", "OpenAPI 3.1 spec"],
    [["Free tier (30 req/min)", "Free"], ["Bulk exports", "20 OPEN/mo"]],
    99.4, 38, "Online", "2026-04-27T16:00:00Z",
    "Latency-optimized public API for the Americas with historical data exports."],
];

function build(
  [id, name, type, region, endpoints, capabilities, pricing, uptimePct, latencyMs, status, registeredAt, description]: Raw,
  i: number,
): ServiceProvider {
  return {
    id,
    name,
    type,
    region,
    endpoints,
    capabilities,
    pricing: pricing.map(([item, price]) => ({ item, price })),
    protocolVersions: i % 2 === 0 ? ["v0.4.2", "v0.4.1"] : ["v0.4.2"],
    uptimePct,
    latencyMs,
    status,
    registeredAt,
    description,
    wallet: pseudoAddress(`openfiat-provider-${id}`),
    signature: pseudoAddress(`openfiat-sig-${id}`) + pseudoAddress(`sig-${id}`),
  };
}

export const PROVIDERS: ServiceProvider[] = RAW.map(build);

export function providersByType(type: ServiceType): ServiceProvider[] {
  return PROVIDERS.filter((p) => p.type === type);
}

export function getProvider(id: string): ServiceProvider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}
