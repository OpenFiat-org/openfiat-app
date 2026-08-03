import bs58 from "bs58";

import { peerIdForPublicKey, sendSignedEvent, signPayload } from "@/lib/arbitration";
import { nodeUrl } from "@/lib/node-endpoint";
import type { WireAmount } from "@/lib/merchant-ads";
import type { SolanaProvider } from "@/lib/wallet-connection";

/**
 * The five signed events a trade is made of, as the connected wallet signs
 * them.
 *
 * # Why these are built by hand rather than through `@openfiat/sdk`
 *
 * The same reason `lib/merchant-ads.ts` gives: the SDK's `sendX` helpers take
 * a `Keypair`, an Ed25519 secret a browser wallet never exposes and this app
 * must never ask for. A wallet offers `signMessage` and nothing else, so the
 * payload is assembled here and handed to the wallet. Only
 * `sendReservationRequest` has an SDK binding at all; the other four have
 * none in any language, so the shapes below are transcribed from
 * `openfiat-core`'s own event structs.
 *
 * # Key order is load-bearing, and silent when wrong
 *
 * The node re-serializes the payload with `serde_json` and verifies the
 * signature over *its own* rendering. `serde_json` emits fields in struct
 * declaration order; `JSON.stringify` emits insertion order. A reordered key
 * is a perfectly valid signature over the wrong bytes, and the node answers
 * `INVALID_SIGNATURE` with nothing on screen to distinguish it from a wallet
 * fault. Every builder below is written in the Rust struct's declaration
 * order and names the struct it mirrors, so the two can be diffed by eye.
 *
 * # `agreed_mid` is `null`, never absent
 *
 * `ReservationRequest.agreed_mid` is an `Option<f64>`, and `serde_json`
 * renders `None` as an explicit `null`. Omitting the key would change the
 * bytes the node hashes. It is spelled out for the same reason the order is.
 */

/** Who is acting, in the three forms these events need them in. */
export interface TradeIdentity {
  provider: SolanaProvider;
  /** The wallet's raw 32-byte Ed25519 public key, which is also its Solana address. */
  publicKey: Uint8Array;
  /** The PeerId that key derives to, base58 — the protocol's name for them. */
  peerId: string;
}

export function tradeIdentity(
  provider: SolanaProvider,
  address: string,
): TradeIdentity {
  const publicKey = bs58.decode(address);
  return { provider, publicKey, peerId: peerIdForPublicKey(publicKey) };
}

/** The wallet's public key as the protocol writes it: base58, not bytes. */
function publicKeyOf(who: TradeIdentity): string {
  return bs58.encode(who.publicKey);
}

/**
 * A fresh reservation id, as a decimal `u64`.
 *
 * # Why not a UUID, when every other id in this app is one
 *
 * Because a reservation is the one protocol id that also has to be an
 * on-chain PDA seed. `openfiat-escrow`'s `TradeEscrowVault` is found at
 * `["trade_escrow", reservation_id.to_le_bytes()]` with `reservation_id: u64`,
 * and its own doc says the value is "assigned off-chain by `openfiat-core`'s
 * `reservations` crate and passed in verbatim — this program never invents
 * its own ID scheme". A UUID cannot be passed in verbatim: it is 128 bits,
 * and any mapping down to 64 is a second identifier the two sides have to
 * agree on out of band, which is exactly the thing "verbatim" exists to
 * avoid.
 *
 * So the id is chosen here in the one form both halves accept — the node
 * takes an arbitrary string, the program takes the number that string spells.
 * 63 bits of `crypto.getRandomValues`, not `Date.now()`: two takers reserving
 * in the same millisecond would collide on a clock-derived id, and the node
 * refuses a duplicate id outright (`DuplicateReservationId`) rather than
 * disambiguating it.
 *
 * The top bit is cleared so the value is always positive when a reader treats
 * it as an `i64`, which explorers and JSON tools routinely do.
 */
export function newReservationId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return (value & 0x7fff_ffff_ffff_ffffn).toString();
}

/**
 * The `u64` an existing reservation id spells, or `null` when it spells none.
 *
 * `null` is a real answer and not an error: a reservation created by a client
 * that chose a UUID exists, is perfectly valid off-chain, and simply has no
 * escrow PDA that can be addressed. A caller must say that rather than
 * substituting a number of its own — a derived id would point at somebody
 * else's escrow.
 */
export function escrowIdFor(reservationId: string): bigint | null {
  if (!/^\d{1,20}$/.test(reservationId)) return null;
  try {
    const value = BigInt(reservationId);
    return value <= 0xffff_ffff_ffff_ffffn ? value : null;
  } catch {
    return null;
  }
}

/**
 * `openfiat_reservations::events::ReservationRequest` — id, advertisement_id,
 * requester, requester_public_key, amount, agreed_price, agreed_mid,
 * timestamp.
 */
export interface ReservationDraft {
  reservationId: string;
  advertisementId: string;
  /** In the asset, at the advertisement's own precision. */
  amount: WireAmount;
  /**
   * Fiat per unit of asset, at the advertisement's own price precision.
   *
   * Must be what the advertisement's terms produce, not what a market read
   * says: `apply_request` calls `PricingModel::agrees_with` and deliberately
   * does not consult the node's own oracle, so a price taken from anywhere
   * but the ad is refused as `PriceDisagreement`.
   */
  agreedPrice: WireAmount;
  /**
   * The oracle mid the price was derived from, for a floating advertisement;
   * `null` for a fixed one, where `agrees_with` requires its absence.
   */
  agreedMid: number | null;
}

/**
 * Submits a reservation and returns the id the node recorded.
 *
 * The timestamp is taken at call time and never from a draft the user has
 * been sitting on: `apply_request` refuses anything more than
 * `MAX_CLOCK_SKEW` (five minutes) ahead of the node's clock, and everything
 * about how long the reservation lives — including the deadline the node
 * sweeps against — is derived from this number rather than from arrival time.
 */
export async function submitReservation(
  who: TradeIdentity,
  draft: ReservationDraft,
): Promise<string> {
  const request = {
    id: draft.reservationId,
    advertisement_id: draft.advertisementId,
    requester: who.peerId,
    requester_public_key: publicKeyOf(who),
    amount: draft.amount,
    agreed_price: draft.agreedPrice,
    agreed_mid: draft.agreedMid,
    timestamp: Date.now(),
  };
  const signature = await signPayload(who.provider, request);
  const id = await sendSignedEvent(nodeUrl(), "sendReservationRequest", {
    request,
    signature,
  });
  return String(id);
}

/**
 * `openfiat_settlement::events::SettlementInitiate` — id, reservation_id,
 * buyer, buyer_public_key, seller, seller_public_key, amount, timestamp.
 */
export interface SettlementDraft {
  settlementId: string;
  reservationId: string;
  /** The merchant's PeerId, from the advertisement. */
  seller: string;
  /** The merchant's public key, from the advertisement — base58. */
  sellerPublicKey: string;
  amount: WireAmount;
}

/**
 * Opens the settlement for a reservation, signed by the buyer.
 *
 * The buyer signs it because the buyer is the one the node can check:
 * `SignedSettlementInitiate::verify` derives a PeerId from `buyer_public_key`
 * and requires it to equal `buyer`. The seller's half is copied off the
 * advertisement, which already carries both, and is not attested by this
 * signature — the seller's own key is what verifies everything they do next.
 *
 * `apply_initiate` does not check the reservation, so this must only ever be
 * called for one that exists, is `EscrowLocked`, and names this wallet as its
 * requester. Sending it for anything else creates a settlement no reservation
 * backs.
 */
export async function initiateSettlement(
  who: TradeIdentity,
  draft: SettlementDraft,
): Promise<string> {
  const initiate = {
    id: draft.settlementId,
    reservation_id: draft.reservationId,
    buyer: who.peerId,
    buyer_public_key: publicKeyOf(who),
    seller: draft.seller,
    seller_public_key: draft.sellerPublicKey,
    amount: draft.amount,
    timestamp: Date.now(),
  };
  const signature = await signPayload(who.provider, initiate);
  const id = await sendSignedEvent(nodeUrl(), "sendSettlementInitiate", {
    initiate,
    signature,
  });
  return String(id);
}

/**
 * `openfiat_settlement::events::PaymentSubmitted` — settlement_id, buyer,
 * payment_reference, timestamp. Legal only from `AwaitingPayment`.
 *
 * `reference` is free text the buyer's bank or wallet put on the transfer, so
 * it routinely carries a real name or an account number — which is why the
 * node's redacted `PublicSettlement` drops it. `null` when there is none;
 * `Option<String>` renders as an explicit `null`, so the key stays.
 */
export async function submitPayment(
  who: TradeIdentity,
  settlementId: string,
  reference: string | null,
): Promise<void> {
  const action = {
    settlement_id: settlementId,
    buyer: who.peerId,
    payment_reference: reference,
    timestamp: Date.now(),
  };
  const signature = await signPayload(who.provider, action);
  await sendSignedEvent(nodeUrl(), "sendPaymentSubmitted", { action, signature });
}

/**
 * `openfiat_settlement::events::SettlementApproved` — settlement_id, seller,
 * timestamp. Legal only from `PaymentSubmitted`.
 *
 * Approval is the merchant saying the money arrived. It is *not* the release:
 * the settlement sits in `Approved` until a node independently observes the
 * on-chain `release_escrow` confirmed, and only then does it become
 * `Completed`. See `lib/trade-escrow.ts` for that half.
 */
export async function approveSettlement(
  who: TradeIdentity,
  settlementId: string,
): Promise<void> {
  const action = {
    settlement_id: settlementId,
    seller: who.peerId,
    timestamp: Date.now(),
  };
  const signature = await signPayload(who.provider, action);
  await sendSignedEvent(nodeUrl(), "sendSettlementApproved", { action, signature });
}

/**
 * `openfiat_disputes::events::DisputeOpen` — id, settlement_id, opener,
 * opener_public_key, reason, timestamp.
 *
 * Either party may open one. `reason` is free text an arbitrator reads; it is
 * dropped from the public view for the same reason `payment_reference` is.
 */
export async function openDispute(
  who: TradeIdentity,
  settlementId: string,
  reason: string,
): Promise<string> {
  const open = {
    id: crypto.randomUUID(),
    settlement_id: settlementId,
    opener: who.peerId,
    opener_public_key: publicKeyOf(who),
    reason,
    timestamp: Date.now(),
  };
  const signature = await signPayload(who.provider, open);
  const id = await sendSignedEvent(nodeUrl(), "sendDisputeOpen", { open, signature });
  return String(id);
}

/**
 * What the node's refusals mean, in the words of the person who pressed the
 * button.
 *
 * The RPC surface answers with OFS-8000 names, which are exact and say
 * nothing to a trader. Anything unrecognised is passed through untouched
 * rather than replaced with a generic apology — a message somebody wrote
 * beats one that fits every failure.
 */
export function explainTradeRefusal(message: string): string {
  if (message.includes("PRICE_DISAGREEMENT")) {
    return "The node did not accept this price for that advertisement. It re-derives the price from the ad's own terms, so a quote that has since moved has to be re-read before ordering.";
  }
  if (message.includes("INSUFFICIENT_LIQUIDITY") || message.includes("INSUFFICIENT_AVAILABLE_LIQUIDITY")) {
    return "This advertisement no longer has enough liquidity for that amount — somebody else reserved against it first.";
  }
  if (message.includes("INVALID_AMOUNT")) {
    return "That amount is outside this advertisement's own minimum and maximum.";
  }
  if (message.includes("ADVERTISEMENT_NOT_FOUND")) {
    return "This advertisement is no longer active on the node, so nothing can be reserved against it.";
  }
  if (message.includes("TIMESTAMP_TOO_FAR_AHEAD")) {
    return "The node refused this request's timestamp as too far ahead of its own clock. Check this device's clock and try again.";
  }
  if (message.includes("DUPLICATE_RESERVATION_ID") || message.includes("DUPLICATE_SETTLEMENT_ID")) {
    return "The node already holds a record with that id — this order was already submitted.";
  }
  if (message.includes("INVALID_STATE_TRANSITION")) {
    return "The trade is no longer in the state that action needs. Reload to see where it actually is.";
  }
  if (message.includes("SETTLEMENT_NOT_FOUND")) {
    return "This node has no settlement with that id yet. It may not have reached this node — try again in a moment.";
  }
  if (message.includes("UNAUTHORIZED")) {
    return "The node refused this wallet for that action: only the buyer can declare payment, and only the merchant can approve it.";
  }
  if (message.includes("INVALID_SIGNATURE") || message.includes("INVALID_IDENTITY_CLAIM")) {
    return "The node did not accept this wallet's signature. Only the wallet that is party to this trade can act on it.";
  }
  return message;
}
