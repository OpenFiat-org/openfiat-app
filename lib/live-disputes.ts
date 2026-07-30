import { Client } from "@openfiat/sdk";
import { nodeUrl } from "@/lib/node-endpoint";
import type { SolanaProvider } from "@/lib/wallet-connection";
import { cachedRead, signedRead, type GatedSurface } from "@/lib/wallet-proof";

/**
 * Disputes (OFS-2400), in the two shapes a node will hand them out in.
 *
 * No typed SDK binding exists for this domain, so this follows
 * `lib/live-governance.ts`'s precedent (`client.call<Params, Result>()`
 * against a locally-declared type), transcribed from
 * `openfiat-core/crates/disputes/src/record.rs` and
 * `crates/rpc/src/methods/redaction.rs`.
 *
 * # Why there are two types
 *
 * `getDispute`/`getDisputes` used to return the whole case to anyone: both
 * parties named and keyed, the free-text `reason` they wrote, and which
 * arbitrator cast which vote. The parties are the trade graph
 * (`lib/counterparties.ts` carries that argument); the reason describes a
 * real disagreement about real money and names people, banks and references
 * as a matter of course; and the arbitrator-to-vote pairing is exactly what
 * makes pressuring an arbitrator worth doing.
 *
 * So the open read now answers `PublicDispute` — enough to show a case
 * existing and progressing, with nobody's name on it — and the parties and
 * the seated arbitrators read the whole case through `getMyDisputes`, behind
 * a wallet signature. Those omitted fields are not omitted for tidiness: they
 * do not arrive.
 *
 * Narrower than the old `lib/data/disputes.ts` mock `Dispute`, deliberately:
 * the real record carries no advertisement id, no fiat leg, no filing fee, no
 * arbitrator reputation/stake/reward, and no sealed "evidence" list — none of
 * that exists in `openfiat_disputes::Dispute`. Padding the shape back out
 * with invented values is exactly what this rewrite removes.
 */

/**
 * The endpoint defaults to the selected node, but every read here takes one,
 * because the arbitrator console tracks its own node selection and must not
 * list one node's cases while acting on another's.
 */
function client(endpoint: string): Client {
  return new Client({ endpoint, timeoutMs: 15_000 });
}

export type DisputeStatus = "Open" | "CaseLocked" | "RevealPhase" | "Resolved";

export type Resolution = "BuyerWins" | "MerchantWins" | "MutualSettlement" | "Invalid";

export type Vote = "BuyerWins" | "MerchantWins" | "Invalid";

export interface ArbitratorCommitment {
  arbitrator: number[];
  commitment: number[];
}

export interface ArbitratorReveal {
  arbitrator: number[];
  vote: Vote;
}

/**
 * A case as a stranger reads it: that it exists, how far it has got, and how
 * it came out.
 *
 * The counts are the whole point of the shape. `arbitrators_seated` says how
 * many of the required seats are filled without saying by whom, and
 * `commitments`/`reveals` show a case progressing with nobody's vote attached
 * to their name.
 */
export interface PublicDispute {
  id: string;
  settlement_id: string;
  status: DisputeStatus;
  required_arbitrators: number;
  arbitrators_seated: number;
  commitments: number;
  reveals: number;
  /** The outcome, which is enforced on chain where anyone can read it anyway. */
  resolution: Resolution | null;
  onchain_execution_signature: string | null;
  opened_at: number;
  updated_at: number;
}

/**
 * The whole case, as a party or a seated arbitrator reads it through
 * `getMyDisputes`.
 *
 * Note `commitments` and `reveals` are the lists here and plain counts on
 * `PublicDispute`. That is the wire, not a modelling choice: the redaction
 * replaces each list with its length.
 */
export interface Dispute {
  id: string;
  settlement_id: string;
  buyer: number[];
  buyer_public_key: number[];
  seller: number[];
  seller_public_key: number[];
  opener: number[];
  reason: string;
  status: DisputeStatus;
  required_arbitrators: number;
  arbitrators: number[][];
  arbitrator_keys: [number[], number[]][];
  commitments: ArbitratorCommitment[];
  reveals: ArbitratorReveal[];
  resolution: Resolution | null;
  buyer_agreed_mutual_settlement: boolean;
  seller_agreed_mutual_settlement: boolean;
  onchain_execution_signature: string | null;
  opened_at: number;
  updated_at: number;
}

interface IdParams {
  id: string;
}

/** `null` if this node has never seen a dispute with that id. */
export async function fetchDispute(
  id: string,
  endpoint: string = nodeUrl(),
): Promise<PublicDispute | null> {
  return client(endpoint).call<IdParams, PublicDispute | null>("getDispute", { id });
}

/** Every dispute this node currently knows about. Empty on a fresh cluster. */
export async function fetchDisputes(endpoint: string = nodeUrl()): Promise<PublicDispute[]> {
  return client(endpoint).call<Record<string, never>, PublicDispute[]>("getDisputes", {});
}

/** The copy for this surface's half of the handshake. */
export const MY_DISPUTES: GatedSurface = {
  challenge: "getWalletChallenge",
  domain: "openfiat-my-disputes",
  messages: {
    "not-your-wallet":
      "The node refused: the connected wallet is not the one these cases belong to. A case is readable in full by its buyer, its seller and the arbitrators seated on it — there is no way to read anyone else's.",
    "challenge-expired":
      "The challenge expired before it was signed — it is only valid for five minutes. Try again and approve the wallet prompt promptly.",
    "challenge-spent": "That challenge was already used. Each one is single-use; try again.",
    "wrong-key": "The signature did not verify against the connected wallet's key.",
    "wallet-cannot-sign":
      "This wallet does not support message signing, which is how you prove a case is yours to read.",
    unreachable: "Could not reach the selected node.",
  },
};

/**
 * Every case the connected wallet is the buyer, the seller or a seated
 * arbitrator of, whole.
 *
 * The node decides which those are. This app must not: filtering the public
 * docket down to the cases that name you would need the unredacted docket
 * back, and that is the disclosure being prevented.
 */
export async function fetchMyDisputes(
  endpoint: string,
  address: string,
  signer: SolanaProvider,
): Promise<Dispute[]> {
  return signedRead<Dispute[]>(endpoint, "getMyDisputes", address, signer, MY_DISPUTES);
}

/** Memoized per wallet and node, because each read costs a wallet prompt. */
export const myDisputes = cachedRead(fetchMyDisputes);
