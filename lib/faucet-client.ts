import { FAUCET_URL } from "@/lib/faucet-config";

export type FaucetMintSymbol = "USDC" | "USDT";

export interface FaucetDripResult {
  signature: string;
  amounts: Partial<Record<FaucetMintSymbol, number>>;
}

/** Thrown by `requestFaucetDrip` — carries the faucet's own error message
 *  (rate limit, daily cap, validation, or low balance) rather than a raw
 *  `fetch` failure, so the UI can show the caller something specific. */
export class FaucetRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "FaucetRequestError";
  }
}

/**
 * Extracts a human-readable message from the faucet's JSON error body, or
 * falls back to a generic one if the body isn't shaped as expected — the
 * faucet service always returns `{ error: string }` on failure, but this
 * guards against a proxy or CDN returning something else entirely (an HTML
 * error page from nginx, for instance).
 */
function extractErrorMessage(status: number, body: unknown): string {
  if (body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string") {
    return (body as { error: string }).error;
  }
  return `Faucet request failed (HTTP ${status}).`;
}

/**
 * Requests a drip of mock USDC and/or USDT to `address` from the deployed
 * faucet service. No amount is ever sent — the service enforces its own
 * fixed per-request cap, and there is deliberately no client-side way to
 * ask for more.
 */
export async function requestFaucetDrip(address: string, mints?: FaucetMintSymbol[]): Promise<FaucetDripResult> {
  const res = await fetch(`${FAUCET_URL}/faucet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(mints ? { address, mints } : { address }),
  });

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON body (e.g. an nginx error page) — extractErrorMessage falls
    // back to a generic message below.
  }

  if (!res.ok) {
    throw new FaucetRequestError(extractErrorMessage(res.status, body), res.status);
  }
  return body as FaucetDripResult;
}

export interface FaucetHealth {
  status: "ok" | "low" | "down";
  solBalance?: number;
}

/** Used only to decide whether to show a "faucet is temporarily
 *  unavailable" notice up front — the request itself is still the
 *  authoritative check, this is just an early, friendlier warning. */
export async function fetchFaucetHealth(): Promise<FaucetHealth> {
  try {
    const res = await fetch(`${FAUCET_URL}/health`);
    const body = (await res.json()) as FaucetHealth;
    return body;
  } catch {
    return { status: "down" };
  }
}
