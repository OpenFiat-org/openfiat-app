import { PublicKey } from "@solana/web3.js";
import { Client } from "@openfiat/sdk";
import { nodeUrl } from "@/lib/node-endpoint";

/**
 * Every service registered under a given public key.
 *
 * # Why this exists
 *
 * The earnings console asked for a Service ID and offered no way to find
 * one. That is fine for an operator who registered the service five minutes
 * ago and still has the id in their shell history, and useless for everyone
 * else — someone running several services, someone returning after a break,
 * or anyone who registered through a different tool. There is no provider
 * account to log into by design, so the registry is the only place that
 * knows, and nothing was asking it.
 *
 * The Service Registry (OFS-1500) is permissionless and public: every
 * registration carries the public key that signed it. Filtering that list by
 * key is therefore a plain read, and it needs no signature — discovering
 * *that* a service exists reveals nothing private. Reading what it has
 * EARNED still requires signing a challenge with the registering key, and
 * that gate is unchanged.
 */

/** A registry entry as it comes off the wire. Snake-case is the node's shape. */
interface RawProvider {
  service_id: string;
  service_type: unknown;
  provider_public_key: number[];
  endpoints?: string[];
  capabilities?: string[];
  region?: string;
  health?: string;
  registered_at?: number;
}

export interface MyService {
  serviceId: string;
  /** Flattened for display: the wire form is either "Node" or {"MarketData": "FxOracle"}. */
  serviceType: string;
  endpoints: string[];
  region: string | null;
  health: string | null;
  registeredAt: number | null;
}

/**
 * `service_type` is an externally-tagged enum, so a simple variant arrives as
 * a bare string and a nested one as a single-key object. Rendering the raw
 * value gives either "Node" or "[object Object]" depending on the variant.
 */
function describeServiceType(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 1) {
      const [outer, inner] = entries[0]!;
      return typeof inner === "string" ? `${outer} · ${inner}` : outer;
    }
  }
  return "Unknown";
}

function keyToBase58(bytes: number[]): string | null {
  // Registry entries have carried a 33-byte multicodec-prefixed form as well
  // as a bare 32-byte key; a wrong length must not throw and abort the whole
  // listing, so it is skipped instead.
  try {
    const raw = bytes.length === 32 ? bytes : bytes.slice(-32);
    return new PublicKey(Uint8Array.from(raw)).toBase58();
  } catch {
    return null;
  }
}

/**
 * Services registered under `wallet`, newest first.
 *
 * Returns an empty array rather than throwing when the key has registered
 * nothing — "you have no services" is an answer, not an error.
 */
export async function fetchMyServices(wallet: string): Promise<MyService[]> {
  const client = new Client({ endpoint: nodeUrl(), timeoutMs: 8_000 });
  const providers = await client.call<Record<string, never>, RawProvider[] | { providers: RawProvider[] }>(
    "getProviders",
    {},
  );
  const list = Array.isArray(providers) ? providers : (providers?.providers ?? []);

  return list
    .filter((p) => keyToBase58(p.provider_public_key ?? []) === wallet)
    .map((p) => ({
      serviceId: p.service_id,
      serviceType: describeServiceType(p.service_type),
      endpoints: p.endpoints ?? [],
      region: p.region ?? null,
      health: p.health ?? null,
      registeredAt: p.registered_at ?? null,
    }))
    .sort((a, b) => (b.registeredAt ?? 0) - (a.registeredAt ?? 0));
}
