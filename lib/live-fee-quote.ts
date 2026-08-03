import type { Amount } from "@openfiat/sdk";

import { nodeRpc } from "@/lib/node-rpc";

/**
 * What a registered service's declared fee costs in some other token right
 * now — `getProviderFeeQuote` (OFS-1500 §15, OFS-7000).
 *
 * # Four answers, and only two of them are a number
 *
 * The node returns a tagged status and every branch means something
 * different to somebody deciding whether to use a service:
 *
 * - `free` — no price was declared. OFS-1500 §15 keeps pricing optional and
 *   an absent price already means free, so there is nothing to convert.
 * - `native` — it already bills in the token you asked about. No oracle is
 *   involved, so no dead feed can ever make this fee unpayable.
 * - `settleable` — the converted amount, the rate it came from, and the
 *   instant it stops being good for.
 * - `unsettleable` — with a reason. **A real answer, not an error.**
 *
 * # `unsettleable` is never zero, and the reasons are never merged
 *
 * The node's own OpenRPC description instructs integrators that
 * `unsettleable` "must never be rendered as zero or as the last number you
 * saw", and this module makes that structurally hard: there is no numeric
 * field on the unsettleable branch to accidentally read.
 *
 * The reasons are kept distinct all the way to the screen because they send
 * a reader in opposite directions:
 *
 * - `StaleOracleData` — providers do publish this pair, every record has
 *   expired. The feed will likely come back; waiting is sensible.
 * - `NoOracleData` — nobody prices this pair. Waiting is pointless.
 * - `UnknownSettlementToken` — the node cannot say how many base units one
 *   of that token is, and refuses to guess. A wrong exponent misprices by a
 *   factor of a thousand, silently.
 * - `RateOutOfRange` / `AmountOutOfRange` — the read was not a usable price,
 *   or the result does not fit. Refused rather than clamped.
 *
 * In every case the fee itself is untouched: it is not settleable in *that*
 * token right now, and remains payable in the token the provider declared.
 *
 * # A quote is a display read, not a commitment
 *
 * Two nodes may legitimately answer differently, because each resolves
 * against the oracle records it happens to hold. `expiresAt` is how long a
 * payer would have to sign it; past that instant there is no quote. Nothing
 * in this app treats it as binding, and nothing should.
 */

/** Why a fee cannot be priced in the requested token at this instant. */
export type UnsettleableReason =
  | "NoOracleData"
  | "StaleOracleData"
  | "UnknownSettlementToken"
  | "RateOutOfRange"
  | "AmountOutOfRange";

export type FeeQuote =
  | { status: "free" }
  | { status: "native"; fee: Amount }
  | {
      status: "settleable";
      /** The fee exactly as declared, unconverted. */
      fee: Amount;
      feeMint: string;
      settlementMint: string;
      /** The declared fee in settlement-token base units, rounded UP. */
      settlementAmount: Amount;
      /** Settlement-token units per fee-token unit, as read from the oracle. */
      rate: number;
      quotedAt: number;
      expiresAt: number;
    }
  | { status: "unsettleable"; reason: UnsettleableReason };

/**
 * A quote from one node, or `null` when it has never seen that service.
 *
 * `null` is the node's own answer for an unknown service id and is passed
 * through as such — a node answers from the registry it has replicated, and
 * another node may know the service perfectly well. It is not merged with
 * the failure to reach a node, which throws.
 */
export async function fetchFeeQuote(
  endpoint: string,
  serviceId: string,
  settlementMint: string,
): Promise<FeeQuote | null> {
  return nodeRpc<FeeQuote | null>(endpoint, "getProviderFeeQuote", {
    id: serviceId,
    settlement_mint: settlementMint,
  });
}

/**
 * What each refusal means to somebody reading it, in their terms.
 *
 * Written out rather than printing the enum name: `StaleOracleData` next to
 * a fee reads as a fault in the provider, when what it says is that a rate
 * feed elsewhere has lapsed and the provider's own price is unaffected.
 */
export const UNSETTLEABLE_NOTE: Record<UnsettleableReason, string> = {
  StaleOracleData:
    "Providers do publish this pair, but every rate for it has expired — so there is no current rate to convert at. The feed usually comes back; the fee is unchanged either way.",
  NoOracleData:
    "No oracle prices this pair at all, so there is nothing to convert at. Waiting will not help — the fee is payable in the token the provider declared.",
  UnknownSettlementToken:
    "Your access node cannot say how many base units one of that token is, so it refuses to convert rather than guess an exponent.",
  RateOutOfRange:
    "The rate read was not usable — not a finite positive number. A fee that converts to nothing is not the fee the provider declared.",
  AmountOutOfRange:
    "The converted fee does not fit the amount type. Refused rather than clamped: a clamped number is one nobody agreed to.",
};

/** Render an amount at its own precision. The division happens only here. */
export function amountText(amount: Amount): string {
  return (amount.base_units / 10 ** amount.decimals).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: amount.decimals,
  });
}
