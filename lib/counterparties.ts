import bs58 from "bs58";
import {
  cachedRead,
  signedRead,
  type GatedSurface,
  type WalletProofFailure,
} from "@/lib/wallet-proof";
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
 * disconnecting clears it (`forgetSignedReads`) so a second wallet on the
 * same machine never sees the first one's history.
 *
 * # Where the handshake lives now
 *
 * This was the first gated read and carried the whole mechanism. It is no
 * longer the only one — `getMySettlements`, `getMyReservations` and
 * `getMyDisputes` are gated the same way — so the challenge-sign-present
 * machinery moved to `lib/wallet-proof.ts` and what is left here is this
 * surface's own domain, its own copy, and what its answer means.
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

/** Why a read failed, in terms the person in front of the screen can act on. */
export type CounterpartyFailure = WalletProofFailure;

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

/**
 * This surface's handshake: its own nonce issuer, its own domain, its own
 * copy.
 *
 * The issuer is `getCounterpartiesChallenge` rather than the shared
 * `getWalletChallenge` the newer gated reads use. Both exist on the node and
 * both draw from one challenge ledger, so the choice changes nothing about
 * what is proved — but this read works today against nodes running the
 * binary before the redaction landed, and moving it would break that for no
 * gain.
 */
export const COUNTERPARTIES: GatedSurface = {
  challenge: "getCounterpartiesChallenge",
  domain: "openfiat-counterparties",
  messages: FAILURE_MESSAGE,
};

export { classifyFailure, peerIdForAddress } from "@/lib/wallet-proof";

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
  return signedRead<CounterpartySummary[]>(
    endpoint,
    "getCounterparties",
    address,
    signer,
    COUNTERPARTIES,
  );
}

/**
 * `fetchCounterparties`, memoized per wallet and node for the life of the
 * tab, so several badges mounting at once still produce exactly one wallet
 * prompt.
 *
 * `peek` is what lets an inline badge fill itself in silently once the
 * history has been read on the account page, while never being the thing
 * that pops a wallet prompt on a page the user was only browsing.
 */
export const counterparties = cachedRead(fetchCounterparties);
