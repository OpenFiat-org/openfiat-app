import { Client, providers, type ServiceRecord, type ServiceType as LiveServiceType } from "@openfiat/sdk";
import { formatPricing } from "@/lib/earnings";
import { asCid } from "@/lib/ipfs/cid";
import { ipfsUrl } from "@/lib/ipfs/gateway";
import type { ServiceType } from "@/lib/types";

/**
 * Branding as a registration carries it (`openfiat_registry::
 * ServiceBranding`), before this app has checked any of it.
 *
 * Declared here rather than imported because `@openfiat/sdk`'s
 * `ServiceRecord` does not type the field yet — the SDK is released from
 * its own repository and moves on its own schedule. Every field is
 * `unknown` on purpose: it arrives as JSON from whichever node the user
 * selected, including one they typed into the picker themselves, so
 * nothing here may be assumed to be a string.
 */
interface RawBranding {
  name?: unknown;
  description?: unknown;
  logo?: unknown;
  website?: unknown;
}

/** A `ServiceRecord` from a node new enough to carry branding. */
type RecordWithBranding = ServiceRecord & { branding?: RawBranding | null };

/**
 * What a provider says it is called — checked, and never presented as
 * anything but a claim.
 *
 * # Why this is re-validated here
 *
 * A node refuses branding it would not store: a logo has to be a CID, a
 * website has to be http(s), and both are bounded
 * (`openfiat_registry::ServiceBranding::validate`). That check runs on
 * the gossip path too, so a peer cannot inject what a node would have
 * rejected.
 *
 * None of which protects this app, because this app talks to whichever
 * node the user picked — including a hostile one, or one the user typed
 * in. A value that reaches an `<img src>` or an `<a href>` must have been
 * checked by the code that renders it. `lib/avatar.ts` makes the same
 * argument about identity avatars, and this follows it.
 *
 * A field that fails its check is dropped rather than shown raw or
 * thrown over: one bad logo should cost a thumbnail, not the directory
 * around it.
 */
export interface ProviderBranding {
  /** The declared name. Shown *beside* the Service ID, never instead. */
  name: string | null;
  description: string | null;
  /** The logo's CID, if it was one. */
  logoCid: string | null;
  /** That CID resolved against the selected node's `GET /ipfs/{cid}`. */
  logoUrl: string | null;
  /** A declared website, only if it is an ordinary http(s) address. */
  website: string | null;
}

/**
 * The longest declared strings this app will render, mirroring
 * `openfiat_registry::MAX_NAME_CHARS` and `MAX_DESCRIPTION_CHARS`.
 *
 * Enforced again here for the hostile-node case above: a node that never
 * ran the registry's check could answer with a megabyte of name, and a
 * table cell is not the place to discover that.
 */
const MAX_NAME_CHARS = 64;
const MAX_DESCRIPTION_CHARS = 280;

/**
 * Characters that make rendered text say something other than the string
 * that was signed — refused for the same reason
 * `openfiat_registry::branding` refuses them.
 *
 * C0/C1 controls let a name break out of the cell it belongs in. The
 * Unicode bidirectional overrides let it render right-to-left, so a
 * signed `invoice<U+202E>gpj.exe` appears on screen as `invoice exe.jpg`
 * — the reader sees a string that is not the one anybody verified.
 */
// eslint-disable-next-line no-control-regex
const DISPLAY_HOSTILE = /[\u0000-\u001F\u007F-\u009F\u200E\u200F\u202A-\u202E\u2066-\u2069]/;

function readText(value: unknown, maxChars: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || [...trimmed].length > maxChars) return null;
  if (DISPLAY_HOSTILE.test(trimmed)) return null;
  return trimmed;
}

/**
 * `null` when the provider declared nothing usable — which a caller
 * should render as an anonymous peer, not as a blank name.
 */
export function readBranding(record: RecordWithBranding): ProviderBranding | null {
  const raw = record.branding;
  if (!raw || typeof raw !== "object") return null;

  const logoCid = asCid(raw.logo);
  const website = readText(raw.website, 256);
  const branding: ProviderBranding = {
    name: readText(raw.name, MAX_NAME_CHARS),
    description: readText(raw.description, MAX_DESCRIPTION_CHARS),
    logoCid,
    // Built from a CID that parsed, never from the declared string, so a
    // value that is not a CID cannot reach an `<img src>` and turn a
    // fetch of the selected node into a fetch of someone else's server.
    logoUrl: logoCid ? ipfsUrl(logoCid) : null,
    // Scheme allowlist. A `javascript:` URL in an href runs in the
    // viewer's own page, from a string a stranger signed.
    website: website && /^https?:\/\//i.test(website) ? website : null,
  };
  return branding.name || branding.description || branding.logoUrl || branding.website
    ? branding
    : null;
}

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
   * What the provider calls itself, or `null` if it declared nothing.
   *
   * Additive to `id`, never a replacement for it: two providers may
   * register the same name — the registry deliberately allows it rather
   * than turning itself into a first-come land grab over a global
   * namespace — so the Service ID is the part that identifies a row.
   */
  branding: ProviderBranding | null;
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

function toRow(record: RecordWithBranding): DirectoryRow {
  return {
    id: record.service_id,
    name: record.service_id,
    branding: readBranding(record),
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
): Promise<RecordWithBranding | null> {
  const client = new Client({ endpoint, timeoutMs: 5_000 });
  try {
    return await providers.getProvider(client, serviceId);
  } catch {
    return null;
  }
}

/** Exported so the detail page can type the record it renders. */
export type { RecordWithBranding };

/** The display label for a record's service type. */
export function labelForServiceType(type: LiveServiceType): ServiceType {
  return serviceTypeLabel(type);
}
