import bs58 from "bs58";
import { peerIdFromPublicKey } from "@openfiat/sdk";
import { base64 } from "@/lib/earnings";
import type { SolanaProvider } from "@/lib/wallet-connection";

/**
 * "You have traded 6 times with this wallet."
 *
 * # This is your history, not a directory
 *
 * A node will not answer this question for a wallet you cannot prove you
 * control. There is no open counterparty endpoint and no way to ask about
 * somebody else's relationships: an enumerable "who trades with whom, how
 * often" map would show which merchant a wallet always returns to and who a
 * high-volume merchant's regulars are, which in a P2P fiat market is a
 * physical-safety problem rather than a privacy nicety.
 *
 * So the read is gated the same way a provider's earnings statement is: ask
 * for a single-use nonce, sign it with the connected wallet, present the
 * signature alongside the public key that must derive to the wallet being
 * asked about. Naming a different wallet is refused outright — see
 * `FAILURE_MESSAGE["not-your-wallet"]`.
 *
 * # One signature per session
 *
 * The whole list arrives in one authenticated call and is cached in memory
 * for the tab, because the alternative is a wallet prompt every time a badge
 * renders on a merchant card. The cache is keyed by wallet *and* node, and
 * disconnecting clears it (`forgetCounterparties`) so a second wallet on the
 * same machine never sees the first one's history.
 */

/** A counterparty summary exactly as `getCounterparties` returns it. */
export interface CounterpartySummary {
  /** Raw `PeerId` bytes — the only identifier the protocol has for them. */
  counterparty: number[];
  /** Settlements that reached `Approved` or `Completed`. */
  trades: number;
  /** Awaiting payment, or awaiting the merchant's decision. */
  in_progress: number;
  /** Rejected or cancelled — no transfer happened. */
  abandoned: number;
  /** How many of the above went to arbitration. Overlaps the three counters. */
  disputed: number;
  /** Unix millis of the most recent approval, or null if never traded. */
  last_traded_at: number | null;
}

interface Challenge {
  subject: string;
  nonce: string;
  expires_at: number;
}

/** Signed bytes the node expects: `<domain>:<subject>:<nonce>`. */
const CHALLENGE_DOMAIN = "openfiat-counterparties";

function challengeBytes(challenge: Challenge): Uint8Array {
  return new TextEncoder().encode(
    `${CHALLENGE_DOMAIN}:${challenge.subject}:${challenge.nonce}`,
  );
}

/** Why a read failed, in terms the person in front of the screen can act on. */
export type CounterpartyFailure =
  | "not-your-wallet"
  | "challenge-expired"
  | "challenge-spent"
  | "wrong-key"
  | "wallet-cannot-sign"
  | "unreachable";

export const FAILURE_MESSAGE: Record<CounterpartyFailure, string> = {
  "not-your-wallet":
    "The node refused: the connected wallet is not the one this history belongs to. Trading history is readable only by the wallet that was party to the trades — there is no way to look up anyone else's.",
  "challenge-expired":
    "The challenge expired before it was signed — it is only valid for five minutes. Try again and approve the wallet prompt promptly.",
  "challenge-spent":
    "That challenge was already used. Each one is single-use; try again.",
  "wrong-key": "The signature did not verify against the connected wallet's key.",
  "wallet-cannot-sign":
    "This wallet does not support message signing, which is how you prove the history is yours.",
  unreachable: "Could not reach the selected node.",
};

export class CounterpartyError extends Error {
  readonly kind: CounterpartyFailure;
  constructor(kind: CounterpartyFailure) {
    super(FAILURE_MESSAGE[kind]);
    this.kind = kind;
    this.name = "CounterpartyError";
  }
}

/**
 * Map a node error onto something actionable.
 *
 * `INVALID_IDENTITY_CLAIM` is the one that matters: it is the node refusing
 * to answer for a wallet the caller does not hold the key to, and it must
 * never be presented as "no trades found" — a refusal and an empty history
 * are opposite answers.
 */
export function classifyFailure(message: string): CounterpartyFailure {
  if (message.includes("INVALID_IDENTITY_CLAIM")) return "not-your-wallet";
  if (message.includes("INVALID_SIGNATURE")) return "wrong-key";
  if (message.includes("INVALID_REQUEST")) return "challenge-expired";
  if (message.includes("RESOURCE_NOT_FOUND")) return "challenge-spent";
  return "unreachable";
}

async function rpc<T>(endpoint: string, method: string, params: unknown): Promise<T> {
  let body: { result?: T; error?: { message: string } };
  try {
    const res = await fetch(`${endpoint.replace(/\/$/, "")}/rpc`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    body = (await res.json()) as { result?: T; error?: { message: string } };
  } catch {
    throw new CounterpartyError("unreachable");
  }
  if (body.error) throw new CounterpartyError(classifyFailure(body.error.message));
  return body.result as T;
}

/**
 * The `PeerId` a Solana address derives to, or null if it is not a valid
 * 32-byte Ed25519 key.
 *
 * Returning null rather than throwing is deliberate: the simulated merchant
 * dataset carries pseudo-addresses, and a badge that cannot identify a wallet
 * should render nothing rather than break the page around it.
 */
export function peerIdForAddress(address: string): number[] | null {
  try {
    const decoded = bs58.decode(address);
    if (decoded.length !== 32) return null;
    return Array.from(peerIdFromPublicKey(decoded));
  } catch {
    return null;
  }
}

/** Base64 for the wire, matching every other encoded field on this surface. */
function encodePeerId(peerId: number[]): string {
  return base64(Uint8Array.from(peerId));
}

/**
 * A `PeerId` in its canonical base58btc form (`12D3Koo…`), abbreviated.
 *
 * A peer id is the only thing the protocol knows about a counterparty —
 * there is no display name to fall back on, and inventing one would be
 * fiction. Shown abbreviated because the full string is 52 characters and
 * the first and last few are what a person actually recognises.
 */
export function formatPeerId(peerId: number[]): string {
  const encoded = bs58.encode(Uint8Array.from(peerId));
  return encoded.length > 16 ? `${encoded.slice(0, 8)}…${encoded.slice(-6)}` : encoded;
}

export function sameBytes(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

/** This pair's summary, or null if the two have never started a settlement. */
export function summaryFor(
  summaries: CounterpartySummary[],
  counterparty: number[],
): CounterpartySummary | null {
  return summaries.find((s) => sameBytes(s.counterparty, counterparty)) ?? null;
}

/**
 * The sentence the badge shows.
 *
 * Returns null when there is nothing truthful to say. "You have traded 0
 * times with this wallet" reads as a warning about the wallet when it only
 * means the two have never met, and on a node that joined recently it may
 * not even be true.
 */
export function tradedLabel(summary: CounterpartySummary | null): string | null {
  if (!summary || summary.trades === 0) return null;
  const times = summary.trades === 1 ? "once" : `${summary.trades} times`;
  return `You have traded ${times} with this wallet`;
}

/** Counterparties worth suggesting: ones an actual trade completed with. */
export function suggested(summaries: CounterpartySummary[]): CounterpartySummary[] {
  return summaries.filter((s) => s.trades > 0);
}

/**
 * The full authenticated read: challenge, wallet signature, list.
 *
 * `address` is the connected wallet's base58 Solana address, which is also
 * its Ed25519 public key and therefore also its protocol identity — the node
 * checks that it derives to the wallet named in the request.
 */
export async function fetchCounterparties(
  endpoint: string,
  address: string,
  signer: SolanaProvider,
): Promise<CounterpartySummary[]> {
  if (!signer.signMessage) throw new CounterpartyError("wallet-cannot-sign");
  const peerId = peerIdForAddress(address);
  if (!peerId) throw new CounterpartyError("not-your-wallet");

  const wallet = encodePeerId(peerId);
  const challenge = await rpc<Challenge>(endpoint, "getCounterpartiesChallenge", { wallet });
  const { signature } = await signer.signMessage(challengeBytes(challenge));

  return rpc<CounterpartySummary[]>(endpoint, "getCounterparties", {
    wallet,
    public_key: base64(bs58.decode(address)),
    nonce: challenge.nonce,
    signature: base64(signature),
  });
}

/**
 * In-memory only. Trading history is not something to leave in localStorage
 * on a shared machine, and it is cheap to re-sign for once per tab.
 */
const cache = new Map<string, Promise<CounterpartySummary[]>>();

const cacheKey = (endpoint: string, address: string) => `${endpoint} ${address}`;

/**
 * `fetchCounterparties`, memoized per wallet and node for the life of the
 * tab. Concurrent callers share one in-flight request, so several badges
 * mounting at once still produce exactly one wallet prompt.
 *
 * A failure is not cached — the next caller retries rather than being stuck
 * with a stale error from a node that was briefly unreachable.
 */
export function loadCounterparties(
  endpoint: string,
  address: string,
  signer: SolanaProvider,
): Promise<CounterpartySummary[]> {
  const key = cacheKey(endpoint, address);
  const cached = cache.get(key);
  if (cached) return cached;

  const pending = fetchCounterparties(endpoint, address, signer).catch((err: unknown) => {
    cache.delete(key);
    throw err;
  });
  cache.set(key, pending);
  return pending;
}

/**
 * The cached read for this wallet and node, if one has already happened in
 * this tab, without starting a new one.
 *
 * This is what lets an inline badge fill itself in silently once the history
 * has been read on the account page, while never being the thing that pops a
 * wallet prompt on a page the user was only browsing.
 */
export function peekCounterparties(
  endpoint: string,
  address: string,
): Promise<CounterpartySummary[]> | undefined {
  return cache.get(cacheKey(endpoint, address));
}

/** Drop everything cached — called when the connected wallet changes. */
export function forgetCounterparties(): void {
  cache.clear();
}
