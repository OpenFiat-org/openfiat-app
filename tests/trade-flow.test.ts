import { afterEach, describe, expect, it, vi } from "vitest";
import bs58 from "bs58";

import {
  approveSettlement,
  escrowIdFor,
  initiateSettlement,
  newReservationId,
  openDispute,
  submitPayment,
  submitReservation,
  tradeIdentity,
} from "@/lib/trade-flow";
import type { SolanaProvider } from "@/lib/wallet-connection";

/**
 * The bytes a wallet is asked to sign, field by field and in order.
 *
 * This is the test the whole trade path most needs, and the reason is that
 * the failure it catches is invisible everywhere else. The node re-serializes
 * the payload with `serde_json` and verifies the signature over *its own*
 * rendering; `serde_json` emits fields in struct declaration order while
 * `JSON.stringify` emits insertion order. Reorder one key and the signature is
 * a perfectly valid signature over the wrong bytes — the node answers
 * `INVALID_SIGNATURE`, which reads like a wallet fault, and nothing on either
 * side points at the real cause.
 *
 * So each case below asserts `Object.keys` of the exact object handed to the
 * wallet, against the field order of the Rust struct named beside it. A
 * snapshot of the whole JSON would fail for a value change too and would be
 * updated without thought; this fails only for the thing that matters.
 *
 * `agreed_mid: null` is asserted as *present* on purpose. It is an
 * `Option<f64>`, `serde_json` renders `None` as an explicit `null`, and
 * omitting the key changes the transcript.
 */

const ADDRESS = "EA8TyQ58C3eavg3ThRFTMu1KLyV9e1v2oTQubSBQ9s5z";

/** Captures what the wallet was asked to sign, and what reached the node. */
function recorder() {
  const signed: unknown[] = [];
  const sent: { method: string; envelope: unknown }[] = [];

  const provider: SolanaProvider = {
    connect: async () => ({ publicKey: { toString: () => ADDRESS } }),
    signAndSendTransaction: async () => ({ signature: "unused" }),
    signMessage: async (message: Uint8Array) => {
      signed.push(JSON.parse(new TextDecoder().decode(message)));
      return { signature: new Uint8Array(64) };
    },
  };

  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { method: string; params: { data: string } };
      sent.push({
        method: body.method,
        envelope: JSON.parse(Buffer.from(body.params.data, "base64").toString("utf8")),
      });
      return { json: async () => ({ result: "ok" }) } as unknown as Response;
    }),
  );

  return { provider, signed, sent };
}

afterEach(() => vi.unstubAllGlobals());

const AMOUNT = { base_units: 1_000_000, decimals: 6 };

describe("the bytes each trade event is signed over", () => {
  it("orders a ReservationRequest exactly as openfiat-reservations declares it", async () => {
    const { provider, signed, sent } = recorder();
    await submitReservation(tradeIdentity(provider, ADDRESS), {
      reservationId: "42",
      advertisementId: "ad-1",
      amount: AMOUNT,
      agreedPrice: { base_units: 129_500_000, decimals: 6 },
      agreedMid: null,
    });

    expect(Object.keys(signed[0] as object)).toEqual([
      "id",
      "advertisement_id",
      "requester",
      "requester_public_key",
      "amount",
      "agreed_price",
      "agreed_mid",
      "timestamp",
    ]);
    // Present and null, not absent — see the note above.
    expect(signed[0]).toHaveProperty("agreed_mid", null);
    // An Amount is base units plus an exponent, in that order, and never a float.
    expect(Object.keys((signed[0] as { amount: object }).amount)).toEqual([
      "base_units",
      "decimals",
    ]);
    expect(sent[0]!.method).toBe("sendReservationRequest");
    expect(Object.keys(sent[0]!.envelope as object)).toEqual(["request", "signature"]);
  });

  it("names the wallet's own public key as the requester's, base58", async () => {
    const { provider, signed } = recorder();
    const who = tradeIdentity(provider, ADDRESS);
    await submitReservation(who, {
      reservationId: "42",
      advertisementId: "ad-1",
      amount: AMOUNT,
      agreedPrice: AMOUNT,
      agreedMid: null,
    });
    const request = signed[0] as { requester: string; requester_public_key: string };
    // Base58, because that is how the node renders key material in JSON — an
    // array of 32 numbers is the same value and a different transcript.
    expect(request.requester_public_key).toBe(ADDRESS);
    expect(bs58.decode(request.requester_public_key)).toHaveLength(32);
    expect(request.requester).toBe(who.peerId);
  });

  it("orders a SettlementInitiate exactly as openfiat-settlement declares it", async () => {
    const { provider, signed, sent } = recorder();
    await initiateSettlement(tradeIdentity(provider, ADDRESS), {
      settlementId: "s-1",
      reservationId: "42",
      seller: "12D3KooWSoBhn76B5upvpXipmuV9aiRU29PcvhMHKFFa7TkXtq4v",
      sellerPublicKey: "HypY2yWTu1ZSQeDQ9JjoovLdXpLyu1GoMetYjUbdztLz",
      amount: AMOUNT,
    });

    expect(Object.keys(signed[0] as object)).toEqual([
      "id",
      "reservation_id",
      "buyer",
      "buyer_public_key",
      "seller",
      "seller_public_key",
      "amount",
      "timestamp",
    ]);
    expect(Object.keys(sent[0]!.envelope as object)).toEqual(["initiate", "signature"]);
  });

  it("orders a PaymentSubmitted as the settlement_action macro expands it", async () => {
    const { provider, signed, sent } = recorder();
    await submitPayment(tradeIdentity(provider, ADDRESS), "s-1", "ref-9");

    // The macro puts `settlement_id` first and `timestamp` last, with the
    // action's own fields between — so the reference sits in the middle
    // rather than at the end where it reads more naturally.
    expect(Object.keys(signed[0] as object)).toEqual([
      "settlement_id",
      "buyer",
      "payment_reference",
      "timestamp",
    ]);
    expect(Object.keys(sent[0]!.envelope as object)).toEqual(["action", "signature"]);
  });

  it("keeps payment_reference present as null when there is none", async () => {
    const { provider, signed } = recorder();
    await submitPayment(tradeIdentity(provider, ADDRESS), "s-1", null);
    expect(signed[0]).toHaveProperty("payment_reference", null);
  });

  it("orders a SettlementApproved as the same macro expands it", async () => {
    const { provider, signed } = recorder();
    await approveSettlement(tradeIdentity(provider, ADDRESS), "s-1");
    expect(Object.keys(signed[0] as object)).toEqual([
      "settlement_id",
      "seller",
      "timestamp",
    ]);
  });

  it("orders a DisputeOpen exactly as openfiat-disputes declares it", async () => {
    const { provider, signed, sent } = recorder();
    await openDispute(tradeIdentity(provider, ADDRESS), "s-1", "no money arrived");
    expect(Object.keys(signed[0] as object)).toEqual([
      "id",
      "settlement_id",
      "opener",
      "opener_public_key",
      "reason",
      "timestamp",
    ]);
    expect(Object.keys(sent[0]!.envelope as object)).toEqual(["open", "signature"]);
  });

  it("signs a timestamp taken now, not one carried in from a draft", async () => {
    const { provider, signed } = recorder();
    const before = Date.now();
    await approveSettlement(tradeIdentity(provider, ADDRESS), "s-1");
    const { timestamp } = signed[0] as { timestamp: number };
    // `apply_request` refuses anything more than five minutes ahead of the
    // node's clock, and every deadline is derived from this number.
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(Date.now());
  });
});

describe("a reservation id is also an escrow PDA seed", () => {
  it("mints an id the escrow program can address", () => {
    const id = newReservationId();
    expect(id).toMatch(/^\d+$/);
    const seed = escrowIdFor(id);
    expect(seed).not.toBeNull();
    // Positive as an i64 too, since explorers and JSON tools read it signed.
    expect(seed! < 0x8000_0000_0000_0000n).toBe(true);
    expect(seed! > 0n).toBe(true);
  });

  it("does not repeat itself", () => {
    const ids = new Set(Array.from({ length: 200 }, newReservationId));
    expect(ids.size).toBe(200);
  });

  it("answers null for an id that spells no u64, rather than inventing one", () => {
    // A reservation from a client that chose a UUID is perfectly valid
    // off-chain and simply has no escrow address. Deriving one would point at
    // somebody else's escrow.
    expect(escrowIdFor("4eac7ba7-9918-4ffc-aa75-191caf2ba4c1")).toBeNull();
    expect(escrowIdFor("")).toBeNull();
    expect(escrowIdFor("-1")).toBeNull();
    expect(escrowIdFor("1.5")).toBeNull();
    expect(escrowIdFor("18446744073709551616")).toBeNull();
  });

  it("reads back an id this app minted", () => {
    expect(escrowIdFor("5733152313082856674")).toBe(5733152313082856674n);
  });
});
