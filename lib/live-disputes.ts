import { Client } from "@openfiat/sdk";
import { nodeUrl } from "@/lib/node-endpoint";

/**
 * Disputes (OFS-2400), read from a node's `getDispute`/`getDisputes`.
 *
 * No typed SDK binding exists for this domain, so this follows
 * `lib/live-governance.ts`'s precedent (`client.call<Params, Result>()`
 * against a locally-declared type), transcribed from
 * `openfiat-core/crates/disputes/src/record.rs`.
 *
 * This is a separate, `Client`-based module from `lib/arbitration.ts`, which
 * already reads this same RPC surface with a raw `fetch` for the arbitrator
 * console (`components/arbitrate/arbitration-console.tsx`) — that module is
 * that page's own concern and out of this one's scope. This one exists for
 * the disputant-facing `/disputes` route, which needs the full record (both
 * parties' identities, the resolution, the on-chain execution signature)
 * rather than only the fields an arbitrator's workflow reads.
 *
 * Narrower than the old `lib/data/disputes.ts` mock `Dispute`, deliberately:
 * the real record carries no advertisement id, no fiat leg, no filing fee, no
 * arbitrator reputation/stake/reward, and no sealed "evidence" list — none of
 * that exists in `openfiat-disputes::Dispute`. Padding the shape back out
 * with invented values is exactly what this rewrite removes.
 */

function client(): Client {
  return new Client({ endpoint: nodeUrl(), timeoutMs: 15_000 });
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

/** A dispute exactly as the node reports it. */
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
export async function fetchDispute(id: string): Promise<Dispute | null> {
  return client().call<IdParams, Dispute | null>("getDispute", { id });
}

/** Every dispute this node currently knows about. Empty on a fresh cluster. */
export async function fetchDisputes(): Promise<Dispute[]> {
  return client().call<Record<string, never>, Dispute[]>("getDisputes", {});
}

const sameBytes = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Disputes where the given PeerId is the buyer, the seller, or the opener. */
export function disputesForPeer(disputes: Dispute[], peerId: number[]): Dispute[] {
  return disputes.filter(
    (d) => sameBytes(d.buyer, peerId) || sameBytes(d.seller, peerId) || sameBytes(d.opener, peerId),
  );
}
