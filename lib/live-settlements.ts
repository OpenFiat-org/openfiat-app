import { Client } from "@openfiat/sdk";
import { nodeUrl } from "@/lib/node-endpoint";

/**
 * Settlements (OFS-2300), read from a node's `getSettlement`/`getSettlements`.
 *
 * The SDK has no typed binding for this domain yet (only node, chain, oracles,
 * providers, advertisements and reservations do — see `@openfiat/sdk`'s own
 * `src/methods/` directory), so this follows `lib/live-governance.ts`'s
 * precedent: `client.call<Params, Result>()` against a locally-declared type
 * transcribed from `openfiat-core/crates/settlement/src/record.rs`.
 *
 * Field names and enum spellings are deliberately snake_case / exact-variant,
 * matching what `serde` actually produces for the Rust struct — not idiomatic
 * TypeScript. A mismatch here is a wire bug, not a style choice (see the
 * SDK's own `types.ts` for the same rule).
 */

function client(): Client {
  return new Client({ endpoint: nodeUrl(), timeoutMs: 15_000 });
}

/** `openfiat_types::Amount` — base units plus the decimal exponent, never a float. */
export interface Amount {
  base_units: number;
  decimals: number;
}

export type SettlementState =
  | "AwaitingPayment"
  | "PaymentSubmitted"
  | "Approved"
  | "Completed"
  | "Rejected"
  | "Cancelled"
  | "Disputed";

export type PaymentDiscrepancy =
  | "IncorrectAmount"
  | "WrongReference"
  | "DuplicatePayment"
  | "IncorrectAccount"
  | "Other";

/** A settlement exactly as the node reports it — nothing padded in. */
export interface Settlement {
  id: string;
  reservation_id: string;
  buyer: number[];
  buyer_public_key: number[];
  seller: number[];
  seller_public_key: number[];
  amount: Amount;
  state: SettlementState;
  payment_reference: string | null;
  /**
   * The on-chain `release_escrow` transaction's own signature, once its
   * confirmation has been independently observed — `null` until then. This
   * is the one real (protocol-reported) transaction signature a trade can
   * carry; nothing in this app synthesizes one when it is absent.
   */
  escrow_release_signature: string | null;
  payment_submitted_at: number | null;
  merchant_responded_at: number | null;
  payment_discrepancy: PaymentDiscrepancy | null;
  created_at: number;
  updated_at: number;
}

interface IdParams {
  id: string;
}

/** `null` if this node has never seen a settlement with that id. */
export async function fetchSettlement(id: string): Promise<Settlement | null> {
  return client().call<IdParams, Settlement | null>("getSettlement", { id });
}

/** Every settlement this node currently knows about. Empty on a fresh cluster. */
export async function fetchSettlements(): Promise<Settlement[]> {
  return client().call<Record<string, never>, Settlement[]>("getSettlements", {});
}
