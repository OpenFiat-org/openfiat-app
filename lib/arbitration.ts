import bs58 from "bs58";
import { peerIdFromPublicKey } from "@openfiat/sdk";
import { explainNodeRefusal, type RefusalTranslator } from "@/lib/node-refusal";
import { NodeRpcError, type NodeErrorData } from "@/lib/node-rpc";
import type { Dispute, PublicDispute } from "@/lib/live-disputes";
import type { SolanaProvider } from "@/lib/wallet-connection";

/**
 * Working a dispute case as an arbitrator.
 *
 * Reading cases is `lib/live-disputes.ts`'s job and used to be duplicated
 * here with a second raw-`fetch` client. It is one surface now, because it
 * has become two reads that have to agree: the public docket says which cases
 * exist and which have a seat free, and `getMyDisputes` — behind a wallet
 * signature — says what is in the ones this arbitrator is seated on. What
 * stays here is the signing and the two vote encodings.
 *
 * Two independent commit-reveal votes run side by side and this module keeps
 * them apart deliberately:
 *
 *   - the off-chain vote (`sendVoteCommit`/`sendVoteReveal`, gossiped between
 *     nodes) drives the marketplace's own `Dispute` record and reputation;
 *   - the on-chain vote (`commit_dispute_vote`/`reveal_dispute_vote` on
 *     `openfiat-escrow`) decides the stake-weighted outcome and who is slashed.
 *
 * Neither is relayed from the other, so an arbitrator casts both. The same
 * salt is reused, but the hashed preimage is NOT the same on both sides — see
 * the two byte tables below.
 *
 * Identity: the connected Solana wallet doubles as the protocol identity. Both
 * are Ed25519, the node verifies a raw signature over the payload's JSON
 * bytes, and the PeerId is a pure function of the public key — so a wallet's
 * `signMessage` is exactly what the node expects. Verified against a live
 * node: a correctly signed `sendArbitratorJoin` for a non-existent dispute is
 * rejected with DISPUTE_NOT_FOUND (i.e. it got past `verify()`), while a
 * tampered signature gives INVALID_SIGNATURE and a mismatched peer id gives
 * INVALID_IDENTITY_CLAIM.
 */

/** What an arbitrator can rule. */
export type ArbitratorOutcome = "buyerWins" | "merchantWins" | "invalid";

/**
 * Off-chain `Vote` (crates/disputes): BuyerWins=0, MerchantWins=1, Invalid=2.
 */
export const OFFCHAIN_VOTE_BYTE: Record<ArbitratorOutcome, number> = {
  buyerWins: 0,
  merchantWins: 1,
  invalid: 2,
};

/**
 * On-chain `DisputeOutcome` (programs/shared): BuyerWins=0, MerchantWins=1,
 * MutualSettlement=2, InvalidDispute=3.
 *
 * Note `invalid` is 2 off-chain but 3 on-chain — the on-chain enum has an
 * extra `MutualSettlement` variant at 2. Committing the off-chain byte to the
 * chain would produce a commitment that can never be revealed, so the two
 * tables are kept separate rather than shared.
 *
 * `MutualSettlement` is absent here on purpose: it is reached by the buyer and
 * seller agreeing, not by an arbitrator ruling, and has no off-chain `Vote`.
 */
export const ONCHAIN_OUTCOME_BYTE: Record<ArbitratorOutcome, number> = {
  buyerWins: 0,
  merchantWins: 1,
  invalid: 3,
};

/** Serde emits unit variants of `Vote` as their name. */
export const OFFCHAIN_VOTE_NAME: Record<ArbitratorOutcome, string> = {
  buyerWins: "BuyerWins",
  merchantWins: "MerchantWins",
  invalid: "Invalid",
};

export const OUTCOME_LABEL: Record<ArbitratorOutcome, string> = {
  buyerWins: "Buyer wins",
  merchantWins: "Merchant wins",
  invalid: "Invalid dispute",
};

/** `sha256(outcome_byte || salt)`, the commitment both sides use. */
export async function commitmentFor(outcomeByte: number, salt: Uint8Array): Promise<Uint8Array> {
  const input = new Uint8Array(1 + salt.length);
  input[0] = outcomeByte;
  input.set(salt, 1);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return new Uint8Array(digest);
}

/** A fresh 32-byte salt. Must not be guessable before the reveal window. */
export function newSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

const saltKey = (disputeId: string) => `openfiat-arbitration-salt:${disputeId}`;

/**
 * The salt has to survive between committing and revealing, which are
 * separate sessions minutes or hours apart. Losing it means the commitment
 * can never be opened and the stake is slashed for failing to reveal, so
 * callers must treat a missing salt as a real, explained failure rather than
 * silently generating a new one.
 */
export function saveSalt(disputeId: string, salt: Uint8Array, outcome: ArbitratorOutcome): void {
  localStorage.setItem(
    saltKey(disputeId),
    JSON.stringify({ salt: Array.from(salt), outcome }),
  );
}

export function loadSalt(
  disputeId: string,
): { salt: Uint8Array; outcome: ArbitratorOutcome } | null {
  const raw = localStorage.getItem(saltKey(disputeId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { salt: number[]; outcome: ArbitratorOutcome };
    if (!Array.isArray(parsed.salt) || parsed.salt.length !== 32) return null;
    if (!(parsed.outcome in OFFCHAIN_VOTE_BYTE)) return null;
    return { salt: Uint8Array.from(parsed.salt), outcome: parsed.outcome };
  } catch {
    return null;
  }
}

export function clearSalt(disputeId: string): void {
  localStorage.removeItem(saltKey(disputeId));
}

/** The PeerId this wallet's public key derives to, base58 as the node writes it. */
export function peerIdForPublicKey(publicKey: Uint8Array): string {
  return bs58.encode(peerIdFromPublicKey(publicKey));
}

/**
 * Sign a payload the way the node verifies it: raw Ed25519 over the UTF-8
 * bytes of `JSON.stringify(payload)`. Key order therefore has to match the
 * Rust struct's field order — every builder below is written in that order.
 */
export async function signPayload(
  provider: SolanaProvider,
  payload: unknown,
): Promise<string> {
  if (!provider.signMessage) {
    throw new Error("This wallet does not support message signing, which arbitration requires.");
  }
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const { signature } = await provider.signMessage(bytes);
  return bs58.encode(signature);
}

/**
 * Submit an already-signed event as an OFS-8200 `sendX` call.
 *
 * A refusal comes back as a `NodeRpcError` rather than a bare `Error`, and
 * that matters more here than on any read. Every write in this app goes
 * through this one function — cancel, reject, reverse, approve, dispute —
 * so what it throws away is thrown away for all of them. It used to throw
 * `new Error(body.error.message)`, which kept the OFS-8000 name only
 * because the node happens to put the name in `message`, and dropped
 * `data` entirely: the numeric code and the node's retryability judgement
 * never reached the caller. Refusals that mean opposite things — "no such
 * settlement" and "too late, it has moved on" — arrived indistinguishable
 * to anything that did not resort to matching on prose.
 */
export async function sendSignedEvent(
  endpoint: string,
  method: string,
  envelope: unknown,
): Promise<unknown> {
  const data = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(envelope))));
  const res = await fetch(`${endpoint.replace(/\/$/, "")}/rpc`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: { data } }),
  });
  const body = (await res.json()) as {
    result?: unknown;
    error?: { message: string; code?: number; data?: NodeErrorData };
  };
  if (body.error) {
    throw new NodeRpcError(method, body.error.message, body.error.code, body.error.data);
  }
  return body.result;
}

/**
 * What a refusal means to an arbitrator working a case.
 *
 * The console used to render `Failed: ${err.message}`, which for a domain
 * failure is the bare OFS-8000 name and nothing else — `INVALID_DISPUTE_STATE`
 * on screen, to someone who wanted to know whether they had lost the seat.
 *
 * Two of these are worth reading twice. `INVALID_DISPUTE_STATE` (6005) is
 * where a full panel and an out-of-phase commit now land; both used to be
 * `DISPUTE_CLOSED`, which told an arbitrator the case was over when it was
 * about to be heard. And `INVALID_IDENTITY_CLAIM` (2001) is what a node
 * answers to "you are not seated on this case" — an authorization refusal
 * that says nothing about the signature.
 */

export function explainArbitrationRefusal(t: RefusalTranslator, error: unknown): string {
  return explainNodeRefusal(t, error, "arbitration");
}

export interface ArbitratorIdentity {
  publicKey: Uint8Array;
  peerId: string;
}

export function buildJoin(disputeId: string, who: ArbitratorIdentity) {
  return {
    dispute_id: disputeId,
    arbitrator: who.peerId,
    arbitrator_public_key: bs58.encode(who.publicKey),
    timestamp: Date.now(),
  };
}

export function buildCommit(disputeId: string, who: ArbitratorIdentity, commitment: Uint8Array) {
  return {
    dispute_id: disputeId,
    arbitrator: who.peerId,
    commitment: Array.from(commitment),
    timestamp: Date.now(),
  };
}

export function buildReveal(
  disputeId: string,
  who: ArbitratorIdentity,
  outcome: ArbitratorOutcome,
  salt: Uint8Array,
) {
  return {
    dispute_id: disputeId,
    arbitrator: who.peerId,
    vote: OFFCHAIN_VOTE_NAME[outcome],
    secret: Array.from(salt),
    timestamp: Date.now(),
  };
}


/**
 * Where this arbitrator stands on a case they have joined.
 *
 * All three take the whole `Dispute`, which only `getMyDisputes` returns, and
 * that is the point: an arbitrator's seat and their vote are exactly the
 * pairing the public read now withholds, so "have I joined this?" is a
 * question only the wallet that joined can be answered. There is no version
 * of these that works on the public docket, and writing one would mean
 * reconstructing the roster from somewhere else.
 */
export function hasJoined(dispute: Dispute, peerId: string): boolean {
  return dispute.arbitrators.some((a) => a === peerId);
}

export function hasCommitted(dispute: Dispute, peerId: string): boolean {
  return dispute.commitments.some((c) => c.arbitrator === peerId);
}

export function hasRevealed(dispute: Dispute, peerId: string): boolean {
  return dispute.reveals.some((r) => r.arbitrator === peerId);
}

/**
 * Cases still short of their arbitrator quota, which is what can be joined.
 *
 * Reads the public docket, and needs nothing more: how many seats are filled
 * is a fact about the case, and survives redaction precisely so that a
 * prospective arbitrator can see there is a seat free without being told who
 * is in the others.
 */
export function isJoinable(dispute: PublicDispute): boolean {
  return dispute.status === "Open" && dispute.arbitrators_seated < dispute.required_arbitrators;
}
