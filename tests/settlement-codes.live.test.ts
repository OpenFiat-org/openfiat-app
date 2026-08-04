// @vitest-environment node

import { describe, expect, it } from "vitest";
import bs58 from "bs58";
import { generateKeypair, peerIdFromPublicKey, sign } from "@openfiat/sdk";

import { sendSignedEvent } from "@/lib/arbitration";
import { NodeRpcError } from "@/lib/node-rpc";
import { explainTradeRefusal } from "@/lib/trade-refusal";

/**
 * The three settlement refusals that used to arrive as one, read off a
 * real node.
 *
 * Every unit test in this suite constructs its own `NodeRpcError`, which
 * proves the app reads `error.data` but proves nothing about what a node
 * puts there. This one asks a running node the three questions and checks
 * the answers are actually distinct — that `SETTLEMENT_NOT_FOUND` (5008),
 * `SETTLEMENT_ALREADY_EXISTS` (5010) and `INVALID_SETTLEMENT_STATE` (5009)
 * come back as themselves rather than collapsing back into one code, and
 * that each produces a different sentence.
 *
 * It writes three settlements' worth of state to whatever node it is
 * pointed at, so it is off unless asked for:
 *
 *     OPENFIAT_LIVE_CODES=1 \
 *     NEXT_PUBLIC_OPENFIAT_NODE_URL=http://127.0.0.1:7080 \
 *     npx vitest run tests/settlement-codes.live.test.ts
 */
const NODE = process.env.NEXT_PUBLIC_OPENFIAT_NODE_URL ?? "";
const ENABLED = process.env.OPENFIAT_LIVE_CODES === "1" && NODE !== "";

async function signed(payload: unknown, keypair: Awaited<ReturnType<typeof generateKeypair>>) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  return bs58.encode(await sign(keypair, bytes));
}

function caught(error: unknown) {
  const e = error as NodeRpcError;
  return {
    ofsErrorCode: e.ofsErrorCode,
    ofsErrorName: e.ofsErrorName,
    ofsRetryable: e.ofsRetryable,
  };
}

describe.skipIf(!ENABLED)("three refusals the app could not tell apart", () => {
  it("5008, 5010 and 5009 against a real node", async () => {
    const buyer = await generateKeypair();
    const seller = await generateKeypair();
    const buyerPeer = bs58.encode(peerIdFromPublicKey(buyer.publicKey));
    const sellerPeer = bs58.encode(peerIdFromPublicKey(seller.publicKey));
    const settlementId = `live-codes-${crypto.randomUUID()}`;

    // 5008: cancel a settlement that does not exist.
    const cancelOf = async (id: string) => {
      const action = { settlement_id: id, canceller: buyerPeer, timestamp: Date.now() };
      return sendSignedEvent(NODE, "sendSettlementCancelled", {
        action,
        signature: await signed(action, buyer),
      });
    };
    const notFound = await cancelOf("openfiat-app-live-never-existed").catch((e: unknown) => e);

    // Open a real settlement.
    const initiate = {
      id: settlementId,
      reservation_id: `live-codes-res-${crypto.randomUUID()}`,
      buyer: buyerPeer,
      buyer_public_key: bs58.encode(buyer.publicKey),
      seller: sellerPeer,
      seller_public_key: bs58.encode(seller.publicKey),
      amount: { base_units: 1_000_000, decimals: 6 },
      timestamp: Date.now(),
    };
    const envelope = { initiate, signature: await signed(initiate, buyer) };
    await sendSignedEvent(NODE, "sendSettlementInitiate", envelope);

    // 5010: the same id a second time.
    const duplicate = await sendSignedEvent(NODE, "sendSettlementInitiate", envelope).catch(
      (e: unknown) => e,
    );

    // 5009: cancel it once legally, then again from a state that forbids it.
    await cancelOf(settlementId);
    const tooLate = await cancelOf(settlementId).catch((e: unknown) => e);

    expect(caught(notFound)).toEqual({
      ofsErrorCode: 5008,
      ofsErrorName: "SETTLEMENT_NOT_FOUND",
      ofsRetryable: false,
    });
    expect(caught(duplicate)).toEqual({
      ofsErrorCode: 5010,
      ofsErrorName: "SETTLEMENT_ALREADY_EXISTS",
      ofsRetryable: false,
    });
    expect(caught(tooLate)).toEqual({
      ofsErrorCode: 5009,
      ofsErrorName: "INVALID_SETTLEMENT_STATE",
      ofsRetryable: false,
    });

    // The whole point: three different sentences where there was one.
    const shown = [notFound, duplicate, tooLate].map((e, i) =>
      explainTradeRefusal(e, (["cancel-settlement", "initiate", "cancel-settlement"] as const)[i]),
    );
    expect(new Set(shown).size).toBe(3);
  }, 30_000);
});
