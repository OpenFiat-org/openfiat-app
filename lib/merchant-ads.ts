import bs58 from "bs58";

import { peerIdForPublicKey, sendSignedEvent, signPayload } from "@/lib/arbitration";
import { nodeUrl } from "@/lib/node-endpoint";
import type { SolanaProvider } from "@/lib/wallet-connection";

/**
 * The three things a merchant can do to their own advertisement, signed by
 * the connected wallet.
 *
 * # Why these are built by hand rather than through `@openfiat/sdk`
 *
 * The SDK's `sendX` helpers take a `Keypair` — an Ed25519 secret this app
 * never has and must never ask for. A browser wallet exposes `signMessage`
 * and nothing else, so the payload is assembled here and handed to the
 * wallet, exactly as `lib/arbitration.ts` and `lib/avatar.ts` already do
 * for their own events. The SDK stays the reference for the shapes; this
 * is the same wire format with a different signer.
 *
 * # Key order is load-bearing
 *
 * The node verifies the signature over `serde_json`'s rendering of the
 * struct, which is field-declaration order. `JSON.stringify` follows
 * insertion order, so every builder below is written in the Rust struct's
 * order and must stay that way. Get it wrong and the node answers
 * `INVALID_SIGNATURE`, which reads like a wallet problem and is not one.
 *
 * Each builder here was checked against a real node before it shipped —
 * publish, pause, reactivate, re-term and delete, in that sequence, plus
 * the refusal to revive a deleted advertisement.
 */

/** OFS-2100 §16/§18/§21. `Deleted` is permanent — the node refuses to leave it. */
export type AdvertisementStatus = "Active" | "Disabled" | "Vacation" | "Deleted";

/**
 * A fixed-point amount as the protocol carries it.
 *
 * Never a bare number on the wire. `decimals` is the asset's own
 * precision, and an update that changed it would silently rescale the
 * merchant's limits by a factor of ten — which is why every editor here
 * carries the advertisement's existing `decimals` through rather than
 * choosing one.
 */
export interface WireAmount {
  base_units: number;
  decimals: number;
}

export function toWireAmount(whole: number, decimals: number): WireAmount {
  // Rounded, not truncated: a limit typed as `0.1` at six decimals is
  // 99999.99999999999 in binary floating point, and truncation would
  // publish a limit one base unit below what the merchant typed.
  return { base_units: Math.round(whole * 10 ** decimals), decimals };
}

export interface MerchantIdentity {
  provider: SolanaProvider;
  publicKey: Uint8Array;
}

/**
 * Pause, take down, delete, or put back up.
 *
 * Two refusals come from the node rather than from here, and both are
 * worth surfacing verbatim: a deleted advertisement cannot be revived, and
 * one with no liquidity cannot be set `Active` — §18 would disable it
 * again on the next reservation, so the order book would carry a row that
 * exists to fail.
 */
export async function setAdvertisementStatus(
  who: MerchantIdentity,
  id: string,
  status: AdvertisementStatus,
): Promise<void> {
  const set = {
    id,
    merchant: peerIdForPublicKey(who.publicKey),
    status,
    timestamp: Date.now(),
  };
  const signature = await signPayload(who.provider, set);
  await sendSignedEvent(nodeUrl(), "sendAdvertisementStatusSet", { set, signature });
}

export interface TermsDraft {
  minTrade: number;
  maxTrade: number;
  paymentMethods: string[];
  /** The advertisement's own precision — see {@link WireAmount}. */
  decimals: number;
}

/**
 * Change trade limits and payment methods, in place.
 *
 * The advertisement keeps its id, which is the whole point: republishing
 * under a new one orphans every reservation, settlement and review that
 * named the old.
 *
 * Whole values, never a delta. The node stores exactly what arrives, so
 * omitting `payment_methods` to mean "unchanged" would clear them.
 */
export async function updateAdvertisementTerms(
  who: MerchantIdentity,
  id: string,
  draft: TermsDraft,
): Promise<void> {
  const update = {
    id,
    merchant: peerIdForPublicKey(who.publicKey),
    min_trade: toWireAmount(draft.minTrade, draft.decimals),
    max_trade: toWireAmount(draft.maxTrade, draft.decimals),
    payment_methods: draft.paymentMethods,
    timestamp: Date.now(),
  };
  const signature = await signPayload(who.provider, update);
  await sendSignedEvent(nodeUrl(), "sendAdvertisementTermsUpdate", { update, signature });
}

export type WirePricing =
  | { Fixed: { price: WireAmount } }
  | {
      Floating: {
        oracle_provider: string;
        premium_bps: number;
        price_decimals: number;
      };
    };

export interface AdvertisementDraft {
  assetMint: string;
  direction: "Sell" | "Buy";
  fiatCurrency: string;
  minTrade: number;
  maxTrade: number;
  initialLiquidity: number;
  /** The asset's precision, for every amount above. */
  decimals: number;
  pricing: WirePricing;
  paymentMethods: string[];
}

/**
 * Publishes a new advertisement and returns the id the node assigned it.
 *
 * The id is generated here rather than by the node, because it is inside
 * the bytes the merchant signs — a node-assigned id would mean signing a
 * record whose identity was chosen after the fact. `crypto.randomUUID` is
 * what `lib/avatar.ts` uses for claim ids, for the same reason.
 */
export async function publishAdvertisement(
  who: MerchantIdentity,
  draft: AdvertisementDraft,
): Promise<string> {
  const create = {
    id: crypto.randomUUID(),
    merchant: peerIdForPublicKey(who.publicKey),
    merchant_public_key: bs58.encode(who.publicKey),
    asset_mint: draft.assetMint,
    direction: draft.direction,
    fiat_currency: draft.fiatCurrency,
    min_trade: toWireAmount(draft.minTrade, draft.decimals),
    max_trade: toWireAmount(draft.maxTrade, draft.decimals),
    initial_liquidity: toWireAmount(draft.initialLiquidity, draft.decimals),
    pricing: draft.pricing,
    payment_methods: draft.paymentMethods,
    timestamp: Date.now(),
  };
  const signature = await signPayload(who.provider, create);
  const id = await sendSignedEvent(nodeUrl(), "sendAdvertisementCreate", { create, signature });
  return String(id);
}

/**
 * What the node's refusals mean, in the merchant's terms.
 *
 * The RPC surface answers with OFS-8000 names, which are precise and say
 * nothing to the person who pressed the button. Anything unrecognised is
 * passed through untouched rather than replaced with a generic apology: a
 * message nobody wrote is more useful than one that fits every failure.
 */
export function explainRefusal(message: string): string {
  if (message.includes("ADVERTISEMENT_NOT_FOUND")) {
    return "This advertisement no longer exists on the node — a deleted advertisement cannot be brought back.";
  }
  if (message.includes("INSUFFICIENT_AVAILABLE_LIQUIDITY")) {
    return "There is no liquidity behind this advertisement, so it cannot go back on offer. Add inventory to its vault first.";
  }
  if (message.includes("INVALID_ADVERTISEMENT")) {
    return "Those terms cannot be traded against: the minimum must not exceed the maximum, and at least one payment method is required.";
  }
  if (message.includes("INVALID_SIGNATURE") || message.includes("INVALID_IDENTITY_CLAIM")) {
    return "The node did not accept this wallet's signature for that advertisement. Only the wallet that published it can change it.";
  }
  return message;
}
