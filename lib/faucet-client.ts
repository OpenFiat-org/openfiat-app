import { FAUCET_URL } from "@/lib/faucet-config";
import type { SolanaProvider } from "@/lib/wallet-connection";

/**
 * Everything the faucet dispenses.
 *
 * SOL and OPEN matter as much as the stablecoins and are not extras: without
 * SOL a fresh wallet cannot pay transaction fees or the rent for its own
 * token accounts and vaults (devnet airdrops are rate-limited, so the faucet
 * is the reliable source), and without OPEN it cannot stake into any role.
 * A tester handed only USDC and USDT has the two assets that are useless on
 * their own, and finds out several steps later.
 */
export type FaucetAssetSymbol = "SOL" | "USDC" | "USDT" | "OPEN";

/** @deprecated the faucet is not mint-only any more — use `FaucetAssetSymbol`. */
export type FaucetMintSymbol = FaucetAssetSymbol;

export interface FaucetDripResult {
  signature: string;
  amounts: Partial<Record<FaucetAssetSymbol, number>>;
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

/** Parses a faucet response, turning any non-2xx into a `FaucetRequestError`
 *  carrying the service's own message. */
async function readResponse(res: Response): Promise<unknown> {
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
  return body;
}

/**
 * Asks the faucet for a message proving control of `address`.
 *
 * The text comes from the service rather than being composed here: it carries
 * a server-issued nonce and expiry, and the service will only accept a
 * signature over the exact bytes it sent.
 */
async function requestChallenge(address: string): Promise<string> {
  const res = await fetch(`${FAUCET_URL}/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address }),
  });
  const body = (await readResponse(res)) as { challenge?: unknown };
  if (typeof body?.challenge !== "string") {
    throw new FaucetRequestError("The faucet returned a malformed challenge.", 502);
  }
  return body.challenge;
}

/**
 * Requests a drip of SOL, mock USDC, mock USDT and/or OPEN to the connected
 * wallet. No amount is ever sent — the service enforces its own fixed
 * per-request drip and daily cap, and there is deliberately no client-side way
 * to ask for more.
 *
 * Two round trips, because the faucet only serves a wallet whose holder can
 * prove they control it: fetch a challenge, sign it with the wallet, send both
 * back. That is also why this takes a `signer` and why the address can no
 * longer be an arbitrary one the user typed — funding a wallet you do not hold
 * the key to is exactly what the challenge exists to stop. The signature
 * authorizes nothing on chain: it is over a plain message, creates no
 * transaction, and moves nothing.
 *
 * Omitting `assets` asks for the service's full default set, which is what a
 * newcomer wants.
 */
export async function requestFaucetDrip(
  address: string,
  signer: SolanaProvider,
  assets?: FaucetAssetSymbol[],
  /** Called once the wallet prompt is answered, so a caller can stop telling
   *  the user to check their wallet while the request is still in flight. */
  onSigned?: () => void,
): Promise<FaucetDripResult> {
  if (!signer.signMessage) {
    throw new FaucetRequestError(
      "This wallet cannot sign messages, which the faucet requires to confirm you control the address.",
      400,
    );
  }

  const challenge = await requestChallenge(address);
  let signature: Uint8Array;
  try {
    ({ signature } = await signer.signMessage(new TextEncoder().encode(challenge)));
  } catch {
    // A user dismissing the wallet prompt is the common case here, and it is
    // not an error worth alarming language.
    throw new FaucetRequestError("Signature request was declined.", 401);
  }
  onSigned?.();

  const res = await fetch(`${FAUCET_URL}/faucet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      address,
      challenge,
      signature: base64(signature),
      ...(assets ? { assets } : {}),
    }),
  });
  return (await readResponse(res)) as FaucetDripResult;
}

/** Base64 for the wallet's raw signature bytes. `btoa` needs a binary string,
 *  and `String.fromCharCode(...bytes)` would blow the argument limit on large
 *  inputs — a 64-byte signature is small, but the loop costs nothing and does
 *  not depend on that staying true. */
function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
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
