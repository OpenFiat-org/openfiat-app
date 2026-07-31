import bs58 from "bs58";
import { peerIdFromPublicKey } from "@openfiat/sdk";
import { base64 } from "@/lib/earnings";
import type { SolanaProvider } from "@/lib/wallet-connection";

/**
 * Proving you hold a wallet, for the node reads that are not everyone's.
 *
 * # Why more than one read needs this
 *
 * `getCounterparties` was the first, and for a while the only, gated read:
 * "who does this wallet trade with, and how often" is a map of real trading
 * relationships, and in a P2P fiat market knowing which merchant a wallet
 * always returns to is a physical-safety question rather than a privacy
 * nicety. `lib/counterparties.ts` carries that argument in full.
 *
 * The gate was walked around rather than broken: `getSettlements`,
 * `getReservations` and `getDisputes` took no parameters, required no
 * signature, and returned every record on the network with both parties
 * named. openfiat-core now redacts all six of those reads and answers a
 * party's own records through `getMySettlements`, `getMyReservations` and
 * `getMyDisputes`, each behind the same handshake. So the handshake stopped
 * being one method's private business and lives here, where a new gated
 * surface is three lines rather than a second implementation to keep in
 * step with the first.
 *
 * # The handshake
 *
 * 1. Ask the node for a nonce bound to the wallet. Deliberately open — a
 *    nonce is worthless without the key that signs it, and demanding a
 *    signature to obtain the thing you sign would be circular.
 * 2. Sign `<domain>:<subject>:<nonce>` with the connected wallet and present
 *    the signature alongside the public key, which must derive to the wallet
 *    being asked about.
 *
 * The domain separator is what keeps the surfaces apart: every gated method
 * draws its nonces from one ledger on the node, so a signature collected for
 * `getCounterparties` would open `getMySettlements` too if both signed the
 * same bytes. They do not.
 *
 * A wallet that cannot be proved is **refused**, never quietly narrowed to
 * what the caller is entitled to — the node is explicit about this, and so is
 * the app: `not-your-wallet` is a refusal and must never be presented as an
 * empty result. They are opposite answers.
 */

/** A nonce bound to one wallet, exactly as the node issues it. */
export interface Challenge {
  subject: string;
  nonce: string;
  expires_at: number;
}

/** Why a gated read failed, in terms the person at the screen can act on. */
export type WalletProofFailure =
  | "not-your-wallet"
  | "challenge-expired"
  | "challenge-spent"
  | "wrong-key"
  | "wallet-cannot-sign"
  | "unreachable";

/**
 * Map a node error onto something actionable.
 *
 * `INVALID_IDENTITY_CLAIM` is the one that matters: it is the node refusing
 * to answer for a wallet the caller does not hold the key to, and it must
 * never be shown as "nothing found" — a refusal and an empty result are
 * opposite answers.
 */
export function classifyFailure(message: string): WalletProofFailure {
  if (message.includes("INVALID_IDENTITY_CLAIM")) return "not-your-wallet";
  if (message.includes("INVALID_SIGNATURE")) return "wrong-key";
  if (message.includes("INVALID_REQUEST")) return "challenge-expired";
  if (message.includes("RESOURCE_NOT_FOUND")) return "challenge-spent";
  return "unreachable";
}

export class WalletProofError extends Error {
  readonly kind: WalletProofFailure;
  constructor(kind: WalletProofFailure, message: string) {
    super(message);
    this.kind = kind;
    this.name = "WalletProofError";
  }
}

/**
 * One gated read: which nonce issuer, which domain to sign under, and what
 * to say when it fails.
 *
 * The copy belongs to the surface rather than to this module because
 * "readable only by the wallet that was party to the trades" and "readable
 * only by the parties and the seated arbitrators" are both true and neither
 * is a good description of the other.
 */
export interface GatedSurface {
  /** The method that issues the nonce. */
  challenge: string;
  /** The domain separator the signature is made under. */
  domain: string;
  messages: Record<WalletProofFailure, string>;
}

/**
 * The shared issuer openfiat-core added alongside the redaction, and the one
 * every new gated surface uses. A nonce carries no domain, so one issuer can
 * serve them all — the separation is entirely in what gets signed.
 *
 * `getCounterparties` keeps its own older issuer (see `lib/counterparties.ts`)
 * because both still exist on the node and both draw from the same ledger, and
 * moving it would break that read against every node not yet running the new
 * binary for no gain.
 */
export const WALLET_CHALLENGE_METHOD = "getWalletChallenge";

function challengeBytes(domain: string, challenge: Challenge): Uint8Array {
  return new TextEncoder().encode(`${domain}:${challenge.subject}:${challenge.nonce}`);
}

/**
 * The `PeerId` a Solana address derives to, or null if it is not a valid
 * 32-byte Ed25519 key.
 *
 * Returning null rather than throwing is deliberate: a badge that cannot
 * identify a wallet should render nothing rather than break the page around
 * it.
 */
/**
 * The PeerId bytes for a wallet, for this surface's *base64* wire encoding.
 *
 * Deliberately not `lib/peer-id`'s `peerIdForAddress`, which produces the
 * base58 string the node's records carry. The wallet-proof methods take a
 * `String` the node base64-decodes, so these two spellings are both correct
 * and are not interchangeable — reaching for the wrong one produces a
 * well-formed request that identifies nobody.
 */
export function peerIdBytesForAddress(address: string): number[] | null {
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

async function rpc<T>(
  endpoint: string,
  method: string,
  params: unknown,
  surface: GatedSurface,
): Promise<T> {
  let body: { result?: T; error?: { message: string } };
  try {
    const res = await fetch(`${endpoint.replace(/\/$/, "")}/rpc`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    body = (await res.json()) as { result?: T; error?: { message: string } };
  } catch {
    throw new WalletProofError("unreachable", surface.messages.unreachable);
  }
  if (body.error) {
    const kind = classifyFailure(body.error.message);
    throw new WalletProofError(kind, surface.messages[kind]);
  }
  return body.result as T;
}

/**
 * Call a gated read: challenge, wallet signature, result.
 *
 * `address` is the connected wallet's base58 Solana address, which is also
 * its Ed25519 public key and therefore also its protocol identity — the node
 * checks that it derives to the wallet named in the request.
 */
export async function signedRead<T>(
  endpoint: string,
  method: string,
  address: string,
  signer: SolanaProvider,
  surface: GatedSurface,
): Promise<T> {
  if (!signer.signMessage) {
    throw new WalletProofError("wallet-cannot-sign", surface.messages["wallet-cannot-sign"]);
  }
  const peerId = peerIdBytesForAddress(address);
  if (!peerId) {
    throw new WalletProofError("not-your-wallet", surface.messages["not-your-wallet"]);
  }

  const wallet = encodePeerId(peerId);
  const challenge = await rpc<Challenge>(endpoint, surface.challenge, { wallet }, surface);
  const { signature } = await signer.signMessage(challengeBytes(surface.domain, challenge));

  return rpc<T>(
    endpoint,
    method,
    {
      wallet,
      public_key: base64(bs58.decode(address)),
      nonce: challenge.nonce,
      signature: base64(signature),
    },
    surface,
  );
}

/**
 * A gated read, memoized per wallet and node for the life of the tab.
 *
 * Every one of these costs a wallet prompt, so a component that mounts twice
 * must not ask twice. Concurrent callers share one in-flight request; a
 * failure is not cached, so the next caller retries rather than being stuck
 * with a stale error from a node that was briefly unreachable.
 *
 * In memory only. What these reads return is a wallet's own trading history,
 * which is not something to leave in `localStorage` on a shared machine.
 */
export interface WalletCache<T> {
  load(endpoint: string, address: string, signer: SolanaProvider): Promise<T>;
  /** A completed or in-flight read for this wallet and node, without starting one. */
  peek(endpoint: string, address: string): Promise<T> | undefined;
  /**
   * Drop this surface's cache, so the next `load` asks the node again.
   *
   * Needed after the wallet writes something the read covers — an arbitrator
   * who has just joined a case is now entitled to a record they were not
   * entitled to a moment ago, and serving them the cached answer would show
   * them the case they are working as one they have not joined.
   */
  forget(): void;
}

/**
 * Every cache built here, so that a wallet change can drop all of them at
 * once. A second wallet on the same machine seeing the first one's history
 * would be the same disclosure this whole module exists to prevent, and
 * remembering to clear one cache per surface is exactly the kind of thing
 * that gets forgotten when the next surface is added.
 */
const caches: { clear(): void }[] = [];

export function cachedRead<T>(
  fetcher: (endpoint: string, address: string, signer: SolanaProvider) => Promise<T>,
): WalletCache<T> {
  const cache = new Map<string, Promise<T>>();
  caches.push(cache);
  // Separated by a byte neither an endpoint nor an address can contain, so
  // no two different pairs can ever spell the same key.
  const key = (endpoint: string, address: string) => `${endpoint}\0${address}`;

  return {
    load(endpoint, address, signer) {
      const cached = cache.get(key(endpoint, address));
      if (cached) return cached;
      const pending = fetcher(endpoint, address, signer).catch((err: unknown) => {
        cache.delete(key(endpoint, address));
        throw err;
      });
      cache.set(key(endpoint, address), pending);
      return pending;
    },
    peek(endpoint, address) {
      return cache.get(key(endpoint, address));
    },
    forget() {
      cache.clear();
    },
  };
}

/** Drop every cached gated read — called when the connected wallet changes. */
export function forgetSignedReads(): void {
  for (const cache of caches) cache.clear();
}
