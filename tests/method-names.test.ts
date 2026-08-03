/**
 * `methodNamesFor`: naming a rail a merchant defined for themselves.
 *
 * # The bug this was written for
 *
 * `getReferenceData.payment_methods` is `openfiat_taxonomy::catalog()`
 * relayed — the rails compiled into the node, every one of them
 * `builtin:<slug>`. A merchant may also define their own, which gets an id
 * of `<merchant peer id>:<digest>` and may go straight onto a public
 * advertisement.
 *
 * So the phrasebook built from the bulk read had no entry for it, and
 * `methodLabel` fell through to printing the id: a 52-character PeerId and a
 * hex digest, in the order book, where a rail name belonged. It appeared on
 * every taker's screen and on none of the merchant's own — which is why it
 * shipped.
 *
 * `getPaymentMethod { id }` is the node's answer for exactly this, and its
 * own documentation says `null` for a definition that has not replicated yet
 * "is an ordinary answer, not an error".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const nodeRpc = vi.fn();

vi.mock("@/lib/node-rpc", () => ({
  nodeRpc: (...args: unknown[]) => nodeRpc(...args),
  NodeRpcError: class extends Error {},
}));

const { methodLabel, methodNamesFor } = await import("@/lib/payment-catalog");

const BUILTIN = "builtin:mpesa-kenya";
const BUILTIN_NAME = "M-Pesa Kenya (Safaricom)";
const MERCHANT_RAIL = "12D3KooWK9hQ7TwbfvFiaAxUbRFCkdhS7iEpAJDnewNL1anyREQ1:9f3c1a20b4d7e6f8";

/** A fresh endpoint per test, because both name caches are keyed by one. */
let endpoint = "";
let n = 0;

beforeEach(() => {
  nodeRpc.mockReset();
  n += 1;
  endpoint = `http://node-${n}.invalid`;
});

function catalogue(name = BUILTIN_NAME) {
  return { payment_methods: [{ id: BUILTIN, name, category: "MobileMoney", aliases: [] }] };
}

describe("naming the rails on an advertisement", () => {
  it("names a merchant-defined rail the bulk catalogue does not carry", async () => {
    nodeRpc.mockImplementation((_endpoint: string, method: string) =>
      Promise.resolve(
        method === "getReferenceData"
          ? catalogue()
          : { id: MERCHANT_RAIL, name: "Sacco Standing Order", category: "BankTransfer", aliases: [] },
      ),
    );

    const names = await methodNamesFor(endpoint, [BUILTIN, MERCHANT_RAIL]);
    expect(methodLabel(BUILTIN, names)).toBe(BUILTIN_NAME);
    // The regression: this used to be the raw id.
    expect(methodLabel(MERCHANT_RAIL, names)).toBe("Sacco Standing Order");
  });

  it("never asks about a builtin id the bulk read already answered", async () => {
    nodeRpc.mockResolvedValue(catalogue());

    await methodNamesFor(endpoint, [BUILTIN, BUILTIN]);
    const asked = nodeRpc.mock.calls.filter((call) => call[1] === "getPaymentMethod");
    expect(asked).toHaveLength(0);
  });

  it("asks once per distinct unresolved id, however often it appears", async () => {
    nodeRpc.mockImplementation((_endpoint: string, method: string) =>
      Promise.resolve(
        method === "getReferenceData"
          ? catalogue()
          : { id: MERCHANT_RAIL, name: "Sacco Standing Order", category: "BankTransfer", aliases: [] },
      ),
    );

    // A book where twenty advertisements all accept the same merchant rail
    // must not be twenty round trips.
    await methodNamesFor(endpoint, Array.from({ length: 20 }, () => MERCHANT_RAIL));
    const asked = nodeRpc.mock.calls.filter((call) => call[1] === "getPaymentMethod");
    expect(asked).toHaveLength(1);
  });

  it("leaves the id showing when the node has not received the definition", async () => {
    nodeRpc.mockImplementation((_endpoint: string, method: string) =>
      Promise.resolve(method === "getReferenceData" ? catalogue() : null),
    );

    const names = await methodNamesFor(endpoint, [MERCHANT_RAIL]);
    // `null` is an ordinary answer — gossip may deliver it a moment later —
    // and the id is the record's own value rather than a guess about it.
    expect(names.has(MERCHANT_RAIL)).toBe(false);
    expect(methodLabel(MERCHANT_RAIL, names)).toBe(MERCHANT_RAIL);
  });

  it("still resolves single ids when the bulk read fails outright", async () => {
    nodeRpc.mockImplementation((_endpoint: string, method: string) =>
      method === "getReferenceData"
        ? Promise.reject(new Error("node answered HTTP 503"))
        : Promise.resolve({ id: MERCHANT_RAIL, name: "Sacco Standing Order", category: "BankTransfer", aliases: [] }),
    );

    // The bulk call is a shortcut, not a prerequisite.
    const names = await methodNamesFor(endpoint, [MERCHANT_RAIL]);
    expect(methodLabel(MERCHANT_RAIL, names)).toBe("Sacco Standing Order");
  });

  it("costs a reader no rows when the node cannot be reached at all", async () => {
    nodeRpc.mockRejectedValue(new Error("connection refused"));

    // A name is decoration; every figure on an advertisement is already in
    // hand by the time this runs. So this resolves rather than rejecting.
    const names = await methodNamesFor(endpoint, [BUILTIN, MERCHANT_RAIL]);
    expect(names.size).toBe(0);
    expect(methodLabel(BUILTIN, names)).toBe(BUILTIN);
  });
});
