import { Client } from "@openfiat/sdk";
import { nodeUrl } from "@/lib/node-endpoint";
import type { SolanaProvider } from "@/lib/wallet-connection";
import { cachedRead, signedRead, type GatedSurface } from "@/lib/wallet-proof";

/**
 * Settlements (OFS-2300), in the two shapes a node will hand them out in.
 *
 * The SDK has no typed binding for this domain yet (only node, chain, oracles,
 * providers, advertisements and reservations do — see `@openfiat/sdk`'s own
 * `src/methods/` directory), so this follows `lib/live-governance.ts`'s
 * precedent: `client.call<Params, Result>()` against a locally-declared type
 * transcribed from `openfiat-core/crates/settlement/src/record.rs` and
 * `crates/rpc/src/methods/redaction.rs`.
 *
 * Field names and enum spellings are deliberately snake_case / exact-variant,
 * matching what `serde` actually produces for the Rust struct — not idiomatic
 * TypeScript. A mismatch here is a wire bug, not a style choice (see the
 * SDK's own `types.ts` for the same rule).
 *
 * # Why there are two types
 *
 * `getSettlement`/`getSettlements` used to return the whole record, both
 * parties named and keyed, to anyone who asked. Together with the equivalent
 * reservation and dispute reads that is the who-trades-with-whom graph, which
 * `lib/counterparties.ts` explains this protocol gates on physical-safety
 * grounds — so the open reads now answer a redacted record and a party reads
 * their own trades in full through `getMySettlements`, behind a wallet
 * signature.
 *
 * `PublicSettlement` therefore does not merely omit the parties for tidiness:
 * those fields do not arrive. Declaring them anyway would leave every reader
 * of this module believing in a `buyer` that is `undefined` at runtime, with
 * the compiler agreeing.
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

/**
 * A settlement as a stranger reads it: what happened, for how much, and when.
 *
 * No `buyer`, `seller`, or either public key, and no `payment_reference` —
 * that last one is free text a buyer puts their own bank reference in, so it
 * routinely carries a real name or an account number.
 */
export interface PublicSettlement {
  id: string;
  reservation_id: string;
  amount: Amount;
  state: SettlementState;
  /**
   * The on-chain `release_escrow` transaction's own signature, once its
   * confirmation has been independently observed — `null` until then. This
   * is the one real (protocol-reported) transaction signature a trade can
   * carry; nothing in this app synthesizes one when it is absent. It survives
   * redaction because it names a transaction anyone can already read on
   * Solana, and it is what makes a settlement independently checkable.
   */
  escrow_release_signature: string | null;
  payment_submitted_at: number | null;
  merchant_responded_at: number | null;
  payment_discrepancy: PaymentDiscrepancy | null;
  created_at: number;
  updated_at: number;
}

/**
 * The whole record, parties included.
 *
 * Reachable two ways: `getMySettlements`, which answers only for the wallet
 * that signed for it, and the `getTrades` join, which still returns whole
 * settlements — see `lib/live-trades.ts`.
 */
export interface Settlement extends PublicSettlement {
  buyer: string;
  buyer_public_key: string;
  seller: string;
  seller_public_key: string;
  payment_reference: string | null;
}

interface IdParams {
  id: string;
}

/** `null` if this node has never seen a settlement with that id. */
export async function fetchSettlement(id: string): Promise<PublicSettlement | null> {
  return client().call<IdParams, PublicSettlement | null>("getSettlement", { id });
}

/** Every settlement this node currently knows about. Empty on a fresh cluster. */
export async function fetchSettlements(): Promise<PublicSettlement[]> {
  return client().call<Record<string, never>, PublicSettlement[]>("getSettlements", {});
}

/** The copy for this surface's half of the handshake. */
export const MY_SETTLEMENTS: GatedSurface = {
  challenge: "getWalletChallenge",
  domain: "openfiat-my-settlements",
  messages: {
    "not-your-wallet":
      "The node refused: the connected wallet is not the one these trades belong to. A settlement is readable in full only by its buyer and its seller — there is no way to read anyone else's.",
    "challenge-expired":
      "The challenge expired before it was signed — it is only valid for five minutes. Try again and approve the wallet prompt promptly.",
    "challenge-spent": "That challenge was already used. Each one is single-use; try again.",
    "wrong-key": "The signature did not verify against the connected wallet's key.",
    "wallet-cannot-sign":
      "This wallet does not support message signing, which is how you prove these trades are yours.",
    unreachable: "Could not reach the selected node.",
  },
};

/**
 * Every settlement the connected wallet is the buyer or the seller of, whole.
 *
 * The node filters, not this app. Reading the network's settlements and
 * keeping the ones that name you would need the unredacted list back, which
 * is the disclosure the redaction exists to prevent.
 */
export async function fetchMySettlements(
  endpoint: string,
  address: string,
  signer: SolanaProvider,
): Promise<Settlement[]> {
  return signedRead<Settlement[]>(endpoint, "getMySettlements", address, signer, MY_SETTLEMENTS);
}

/** Memoized per wallet and node, because each read costs a wallet prompt. */
export const mySettlements = cachedRead(fetchMySettlements);
