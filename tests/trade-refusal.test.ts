import { afterEach, describe, expect, it, vi } from "vitest";

import { sendSignedEvent } from "@/lib/arbitration";
import { NodeRpcError, nodeRpc, ofsErrorIdentity } from "@/lib/node-rpc";
import { explainTradeRefusal } from "@/lib/trade-refusal";

/**
 * What the app can tell apart, now that it reads `error.data`.
 *
 * Every domain failure in OpenFiat is JSON-RPC `-32000`. The number that
 * distinguishes them is in `error.data.ofsErrorCode`, and this app used to
 * drop that object on the floor at both of its two RPC entry points — so
 * "no such settlement" (5008), "too late, it has moved on" (5009) and "that
 * id is already taken" (5010) arrived as one indistinguishable refusal and
 * were shown with one sentence.
 *
 * The assertions below are on *distinguishability*, not on wording: each
 * one pins two refusals that used to collapse together and requires the app
 * to say something different about them. Rewriting the copy should not
 * break these; collapsing two cases back into one should.
 */

/** An error shaped exactly as the node's own `error` member arrives. */
function refusal(name: string, code: number, retryable?: boolean) {
  return new NodeRpcError("sendSettlementCancelled", name, -32000, {
    ofsErrorCode: code,
    ofsErrorName: name,
    ofsRetryable: retryable,
  });
}

/** Replies to one `sendX` with a node-shaped JSON-RPC error. */
function nodeRefusing(error: unknown) {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ jsonrpc: "2.0", id: 1, error }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("what a refusal carries off the wire", () => {
  it("keeps the OFS-8000 code, name and retryability from a read", async () => {
    nodeRefusing({
      code: -32000,
      message: "SETTLEMENT_NOT_FOUND",
      data: {
        ofsErrorCode: 5008,
        ofsErrorName: "SETTLEMENT_NOT_FOUND",
        ofsRetryable: false,
      },
    });

    const err = await nodeRpc("http://node.invalid", "getSettlement").catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(NodeRpcError);
    const node = err as NodeRpcError;
    expect(node.code).toBe(-32000);
    expect(node.ofsErrorCode).toBe(5008);
    expect(node.ofsErrorName).toBe("SETTLEMENT_NOT_FOUND");
    expect(node.ofsRetryable).toBe(false);
  });

  /*
   * The write path matters more than the read path: every trade exit —
   * cancel, reject, reverse — goes through `sendSignedEvent`, which used to
   * throw a bare `Error` built from the message alone.
   */
  it("keeps them from a signed write as well", async () => {
    nodeRefusing({
      code: -32000,
      message: "INVALID_SETTLEMENT_STATE",
      data: {
        ofsErrorCode: 5009,
        ofsErrorName: "INVALID_SETTLEMENT_STATE",
        ofsRetryable: false,
      },
    });

    const err = await sendSignedEvent(
      "http://node.invalid",
      "sendSettlementCancelled",
      {},
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(NodeRpcError);
    expect((err as NodeRpcError).ofsErrorCode).toBe(5009);
    expect((err as NodeRpcError).ofsRetryable).toBe(false);
  });

  /*
   * A retryable refusal is surfaced and *not* acted on. Nothing in this app
   * retries because the node said it could — one request in, one request
   * out, whatever the flag says.
   */
  it("sends the request exactly once even when the node says it may be retried", async () => {
    const fetchMock = nodeRefusing({
      code: -32000,
      message: "MERCHANT_OFFLINE",
      data: { ofsErrorCode: 4005, ofsErrorName: "MERCHANT_OFFLINE", ofsRetryable: true },
    });

    await sendSignedEvent("http://node.invalid", "sendReservationRequest", {}).catch(
      () => undefined,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  /*
   * An older node states the code and name but not retryability. Unstated
   * has to stay unstated: read as `false` it would turn every transient
   * failure on an older node into a permanent one.
   */
  it("leaves retryability unstated rather than false when the node omits it", () => {
    const err = new NodeRpcError("getSettlement", "CHAIN_UNAVAILABLE", -32000, {
      ofsErrorCode: 1010,
      ofsErrorName: "CHAIN_UNAVAILABLE",
    });
    expect(err.ofsRetryable).toBeUndefined();
    expect(ofsErrorIdentity(err).ofsRetryable).toBeUndefined();
  });
});

describe("refusals the app could not previously tell apart", () => {
  it("separates a settlement that is gone from one that has moved on", () => {
    const gone = explainTradeRefusal(refusal("SETTLEMENT_NOT_FOUND", 5008, false));
    const moved = explainTradeRefusal(
      refusal("INVALID_SETTLEMENT_STATE", 5009, false),
      "cancel-settlement",
    );
    expect(gone).not.toBe(moved);
    expect(moved).toMatch(/too late to cancel/i);
  });

  /*
   * 5010 against 5005. A duplicate id is a statement about the id; the app
   * must not tell somebody their trade completed on the strength of it,
   * which is exactly what the old copy did ("this order was already
   * submitted") for the code that used to be 5005.
   */
  it("separates a taken settlement id from a completed trade", () => {
    const taken = explainTradeRefusal(refusal("SETTLEMENT_ALREADY_EXISTS", 5010, false));
    const completed = explainTradeRefusal(
      refusal("SETTLEMENT_ALREADY_COMPLETED", 5005, false),
    );
    expect(taken).not.toBe(completed);
    expect(taken).toMatch(/does not mean this trade completed/i);
    expect(completed).toMatch(/already completed/i);
  });

  /*
   * One code, three exits, three situations. `INVALID_SETTLEMENT_STATE` is
   * returned for every illegal transition, so the only thing that can
   * distinguish "too late to cancel" from "the merchant already answered
   * you" is which button was pressed.
   */
  it("says something different about each way out of a trade", () => {
    const error = refusal("INVALID_SETTLEMENT_STATE", 5009, false);
    const cancel = explainTradeRefusal(error, "cancel-settlement");
    const reverse = explainTradeRefusal(error, "reverse-payment");
    const reject = explainTradeRefusal(error, "reject-payment");

    expect(new Set([cancel, reverse, reject]).size).toBe(3);
    expect(reverse).toMatch(/withdraw/i);
    expect(reject).toMatch(/nothing|no payment declaration/i);
  });

  /*
   * Acting out of turn is an authorization refusal, not a cryptographic
   * one. Both used to produce the sentence about a bad signature, because
   * `UNAUTHORIZED` — the string the old code matched — never arrives:
   * `SettlementError::Unauthorized` renders its OFS-8000 name,
   * `INVALID_IDENTITY_CLAIM`.
   */
  it("separates acting out of turn from a signature the node rejected", () => {
    const outOfTurn = explainTradeRefusal(
      refusal("INVALID_IDENTITY_CLAIM", 2001, false),
      "approve",
    );
    const badSignature = explainTradeRefusal(refusal("INVALID_SIGNATURE", 1003, false));

    expect(outOfTurn).not.toBe(badSignature);
    expect(outOfTurn).toMatch(/only the merchant/i);
    expect(badSignature).toMatch(/signature/i);
  });

  /*
   * 5008 is not retryable, and the app used to answer it with "try again in
   * a moment" — advice the registry says is wrong.
   */
  it("stops telling someone to retry a refusal the node calls permanent", () => {
    for (const name of ["SETTLEMENT_NOT_FOUND", "RESERVATION_NOT_FOUND"]) {
      expect(explainTradeRefusal(refusal(name, 5008, false))).not.toMatch(
        /try again in a moment/i,
      );
    }
  });
});

describe("a code this build has never seen", () => {
  /*
   * Three codes were added to the registry last night. The app holds no
   * copy of the table, so a code it does not recognise still has to leave
   * the reader knowing whether pressing the button again is worth doing —
   * which is the node's own judgement, read rather than recomputed.
   */
  it("passes the node's message through with its retryability", () => {
    const transient = explainTradeRefusal(refusal("SOME_FUTURE_CODE", 9999, true));
    const permanent = explainTradeRefusal(refusal("ANOTHER_FUTURE_CODE", 9998, false));

    expect(transient).toMatch(/can succeed if you try it again/i);
    expect(permanent).toMatch(/trying again will not change this/i);
  });

  it("says nothing about retrying when the node said nothing", () => {
    const err = new NodeRpcError("sendSettlementCancelled", "SOME_FUTURE_CODE", -32000, {
      ofsErrorCode: 9999,
      ofsErrorName: "SOME_FUTURE_CODE",
    });
    const explained = explainTradeRefusal(err);
    expect(explained).not.toMatch(/try/i);
    expect(explained).toContain("SOME_FUTURE_CODE");
  });
});

describe("what is not a refusal", () => {
  it("passes a failure this app raised itself through untouched", () => {
    const message = "There is no settlement to cancel.";
    expect(explainTradeRefusal(new Error(message), "cancel-settlement")).toBe(message);
  });

  /*
   * The old implementation matched substrings of the message, so any prose
   * the node echoed back could trigger a branch — and `reason` and
   * `payment_reference` are free text a person types.
   */
  it("does not read an OFS name out of prose somebody typed", () => {
    const message =
      "The merchant wrote: I could not find this payment, SETTLEMENT_NOT_FOUND on my side.";
    expect(explainTradeRefusal(new Error(message))).toBe(message);
  });
});
