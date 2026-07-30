import "server-only";

import { isCid } from "@/lib/ipfs/cid";

/**
 * Pinning providers. **Server only.**
 *
 * # The `server-only` import at the top of this file is load-bearing
 *
 * A pinning credential grants write access to an account someone pays
 * for. If one reached the browser it would be readable by every visitor,
 * so the risk is not theoretical — it is what happens automatically if
 * this module is ever imported from a client component. Next inlines
 * `NEXT_PUBLIC_*` values into the client bundle at build time, so a
 * `NEXT_PUBLIC_PINATA_JWT` would be handed to every visitor of every
 * page, and no amount of care elsewhere would undo it.
 *
 * `server-only` turns that into a build error rather than a silent leak,
 * and none of the variables below carry the `NEXT_PUBLIC_` prefix. The
 * browser's route to IPFS is `POST /api/ipfs/upload`, which holds the
 * credential on this side and never discloses it.
 *
 * # Why the provider is an interface
 *
 * Nothing about the protocol depends on which service pins a file: the
 * record carries a CID, and a CID resolves through any gateway. An
 * operator running their own Kubo node should be able to point this at it
 * without touching anything else, so the provider is chosen by
 * configuration and the rest of the app never knows which one answered.
 */

export interface PinResult {
  cid: string;
  /** Which provider produced it, for diagnostics only. */
  provider: string;
}

export interface PinProvider {
  readonly name: string;
  pin(file: Blob, filename: string): Promise<PinResult>;
}

class PinError extends Error {
  constructor(provider: string, detail: string) {
    super(`${provider}: ${detail}`);
    this.name = "PinError";
  }
}

/**
 * Any Kubo-compatible RPC endpoint: Filebase's `rpc.filebase.io`, a
 * self-hosted `ipfs daemon`, or another provider speaking the same API.
 *
 * `cid-version=1` is requested because this protocol accepts only CIDv1 —
 * a v0 `Qm…` identifier would be rejected by the node the record is
 * published to, so it is better to never obtain one.
 */
class KuboRpcProvider implements PinProvider {
  readonly name: string;

  constructor(
    private readonly endpoint: string,
    private readonly token: string | undefined,
    name: string,
  ) {
    this.name = name;
  }

  async pin(file: Blob, filename: string): Promise<PinResult> {
    const form = new FormData();
    form.append("file", file, filename);

    const headers: Record<string, string> = {};
    if (this.token) headers.Authorization = `Bearer ${this.token}`;

    const response = await fetch(`${this.endpoint}/api/v0/add?cid-version=1`, {
      method: "POST",
      headers,
      body: form,
    });
    if (!response.ok) {
      throw new PinError(this.name, `add returned ${response.status}`);
    }

    // Kubo streams one JSON object per line and this request adds a single
    // file, so the last non-empty line is the result. Parsing the whole
    // body as JSON fails the moment a provider adds a progress line.
    const text = await response.text();
    const lastLine = text.trim().split("\n").filter(Boolean).at(-1);
    if (!lastLine) throw new PinError(this.name, "empty response");

    let parsed: unknown;
    try {
      parsed = JSON.parse(lastLine);
    } catch {
      throw new PinError(this.name, "response was not JSON");
    }
    const hash = (parsed as { Hash?: unknown }).Hash;
    if (!isCid(hash)) {
      throw new PinError(this.name, "response did not contain a CIDv1");
    }
    return { cid: hash, provider: this.name };
  }
}

/**
 * Pinata's own API, which is not Kubo-shaped.
 *
 * Kept alongside the generic provider rather than folded into it because
 * the differences are real: a different path, a different body field, and
 * a CID under `IpfsHash` rather than `Hash`. Pretending one client covers
 * both would mean a conditional in every step.
 */
class PinataProvider implements PinProvider {
  readonly name = "pinata";

  constructor(private readonly jwt: string) {}

  async pin(file: Blob, filename: string): Promise<PinResult> {
    const form = new FormData();
    form.append("file", file, filename);
    // v1 is Pinata's default and produces `Qm…`, which this protocol does
    // not accept; asking for v1 CIDs here is not cosmetic.
    form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

    const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.jwt}` },
      body: form,
    });
    if (!response.ok) {
      const detail = response.status === 401 || response.status === 403
        ? `authentication failed (${response.status}) — the API key may have no scopes`
        : `pinFileToIPFS returned ${response.status}`;
      throw new PinError(this.name, detail);
    }

    const parsed: unknown = await response.json();
    const hash = (parsed as { IpfsHash?: unknown }).IpfsHash;
    if (!isCid(hash)) {
      throw new PinError(this.name, "response did not contain a CIDv1");
    }
    return { cid: hash, provider: this.name };
  }
}

/**
 * The configured provider, or `null` if this deployment has none.
 *
 * `null` rather than a throw, and rather than a fallback to some public
 * endpoint: a deployment without pinning configured should tell the user
 * uploads are unavailable, not silently push their file to a service
 * nobody chose and nobody will keep pinning.
 */
export function pinProvider(): PinProvider | null {
  const configured = process.env.IPFS_PROVIDER?.toLowerCase();

  if (configured === "pinata" || (!configured && process.env.PINATA_JWT)) {
    const jwt = process.env.PINATA_JWT;
    return jwt ? new PinataProvider(jwt) : null;
  }

  const endpoint = process.env.IPFS_RPC_URL?.replace(/\/+$/, "");
  if (endpoint) {
    return new KuboRpcProvider(endpoint, process.env.IPFS_RPC_TOKEN, configured ?? "kubo-rpc");
  }
  return null;
}
