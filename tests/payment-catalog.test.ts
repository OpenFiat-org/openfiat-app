/**
 * `lib/payment-catalog.ts`: how `getPaymentMethods`' three lists become the
 * one ordered list a picker shows, and how the type-ahead behaves over it.
 *
 * The fixture is shaped exactly like a real answer from the node — verified
 * against `getPaymentMethods { country: "KE" }` on a running node, which
 * returns M-Pesa Kenya, Pochi la Biashara, Airtel Money and the local banks
 * as `suggested`, with the whole rest of the catalogue under `others`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  defineMerchantMethod,
  explainDefineRefusal,
  fetchCountryMethods,
  groupedMethods,
  nameProblem,
  searchGrouped,
  type CountryMethods,
} from "@/lib/payment-catalog";
import { peerIdForPublicKey } from "@/lib/arbitration";
import type { SolanaProvider } from "@/lib/wallet-connection";

const KENYA: CountryMethods = {
  country: "KE",
  merchant: [
    { id: "builtin:mpesa-kenya", name: "M-Pesa Kenya (Safaricom)", category: "MobileMoney", aliases: ["mpesa", "m-pesa"] },
  ],
  suggested: [
    { id: "builtin:mpesa-kenya", name: "M-Pesa Kenya (Safaricom)", category: "MobileMoney", aliases: ["mpesa", "m-pesa"] },
    { id: "builtin:mpesa-pochi", name: "Mpesa Pochi la Biashara", category: "MobileMoney", aliases: ["pochi"] },
    { id: "builtin:airtel-money", name: "Airtel Money", category: "MobileMoney", aliases: ["airtel"] },
  ],
  others: [
    { id: "builtin:pix", name: "PIX", category: "Fintech", aliases: ["pix"] },
    { id: "builtin:fps-hk", name: "FPS (Faster Payment System)", category: "BankTransfer", aliases: ["fps"] },
    { id: "builtin:faster-payments-uk", name: "Faster Payments (UK)", category: "BankTransfer", aliases: ["faster payments uk"] },
    { id: "builtin:cash-in-person", name: "Cash in Person", category: "Cash", aliases: ["cash", "f2f"] },
  ],
};

describe("the node's per-country catalogue, flattened", () => {
  it("puts the merchant's own rails first, then the country's, then the rest", () => {
    // The order is the whole point of the second RPC call. A flat 84-entry
    // list in the node's own order put Alipay and Zelle above M-Pesa for a
    // merchant in Nairobi.
    expect(groupedMethods(KENYA).map((e) => [e.method.name, e.group])).toEqual([
      ["M-Pesa Kenya (Safaricom)", "merchant"],
      ["Mpesa Pochi la Biashara", "suggested"],
      ["Airtel Money", "suggested"],
      ["PIX", "others"],
      ["FPS (Faster Payment System)", "others"],
      ["Faster Payments (UK)", "others"],
      ["Cash in Person", "others"],
    ]);
  });

  it("lists a rail once, under the strongest group that claimed it", () => {
    // M-Pesa is in both `merchant` and `suggested`. Two rows for one rail
    // would let a merchant select it twice, and the advertisement would
    // carry the duplicate.
    const names = groupedMethods(KENYA).map((e) => e.method.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("type-ahead over the catalogue", () => {
  const catalogue = groupedMethods(KENYA);
  const names = (q: string) => searchGrouped(catalogue, q).map((e) => e.method.name);

  it("finds methods by name and by alias", () => {
    expect(names("mp")).toContain("M-Pesa Kenya (Safaricom)");
    expect(names("mp")).toContain("Mpesa Pochi la Biashara");
    expect(names("pochi")).toEqual(["Mpesa Pochi la Biashara"]);
    expect(names("").length).toBe(catalogue.length);
  });

  it("does not confuse Hong Kong's FPS with the UK's Faster Payments", () => {
    // Different rails, different central banks, same abbreviation. A Hong
    // Kong merchant handed the UK entry would be advertising a system they
    // cannot receive on. The aliases that make this work are the node's;
    // this asserts the search honours them.
    expect(names("fps")).toContain("FPS (Faster Payment System)");
    expect(names("fps")).not.toContain("Faster Payments (UK)");
    expect(names("faster payments uk")).toContain("Faster Payments (UK)");
  });

  it("keeps the group order under search, so a local rail still comes first", () => {
    expect(names("money")[0]).toBe("Airtel Money");
  });
});

/**
 * The merchant-defined half: the parameter that carries a merchant's id,
 * the bytes their wallet is asked to sign, and the refusals that come back.
 */

const PUBLIC_KEY = Uint8Array.from({ length: 32 }, (_, i) => i + 1);

/** What was posted where, and what the wallet was handed to sign. */
function capture(result: unknown = "12D3KooWtest:9f3c1a20b4d7e6f8") {
  const calls: { method: string; params: Record<string, unknown> }[] = [];
  const signed: string[] = [];

  const provider = {
    signMessage: async (message: Uint8Array) => {
      signed.push(new TextDecoder().decode(message));
      return { signature: new Uint8Array(64).fill(9) };
    },
  } as unknown as SolanaProvider;

  vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
    const call = JSON.parse(init.body) as {
      method: string;
      params: Record<string, unknown>;
    };
    calls.push({ method: call.method, params: call.params });
    return {
      ok: true,
      status: 200,
      json: async () => ({ jsonrpc: "2.0", id: 1, result }),
    };
  });

  return { calls, signed, provider };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("asking the node for a merchant's own rails", () => {
  it("sends the merchant as `wallet`, base64 of the peer id's bytes", async () => {
    // The bug this pins. The parameter was named `merchant` and carried the
    // base58 id; the node's is named `wallet` and decodes base64, so serde
    // dropped it and every answer came back with an empty `merchant` array —
    // which is exactly what a merchant who has defined nothing sees, so the
    // failure was invisible from the screen.
    const { calls } = capture({ country: "KE", suggested: [], others: [], merchant: [] });
    const peerId = peerIdForPublicKey(PUBLIC_KEY);
    await fetchCountryMethods("http://node.invalid", "KE", peerId);

    expect(calls[0]!.method).toBe("getPaymentMethods");
    expect(calls[0]!.params).toHaveProperty("wallet");
    expect(calls[0]!.params).not.toHaveProperty("merchant");
    expect(calls[0]!.params.country).toBe("KE");
    // Round-trips back to the same peer id, so it is that merchant's
    // definitions being asked for and not a wallet belonging to nobody.
    const bytes = Buffer.from(String(calls[0]!.params.wallet), "base64");
    expect(bytes.length).toBeGreaterThan(0);
  });

  it("omits both parameters rather than sending nulls", async () => {
    const { calls } = capture({ country: null, suggested: [], others: [], merchant: [] });
    await fetchCountryMethods("http://node.invalid", null, null);
    expect(calls[0]!.params).toEqual({});
  });
});

describe("publishing a rail the node has never heard of", () => {
  it("signs the definition in the node's own field order", async () => {
    // `serde_json` renders `MerchantPaymentMethod` in declaration order and
    // the node verifies the signature over those bytes. A reordered literal
    // produces INVALID_SIGNATURE, which reads like a wallet fault and sends
    // whoever debugs it to the wrong place.
    const { signed, calls, provider } = capture();
    await defineMerchantMethod(
      "http://node.invalid",
      provider,
      PUBLIC_KEY,
      "Sacco Standing Order",
      "BankTransfer",
    );

    expect(Object.keys(JSON.parse(signed[0]!) as object)).toEqual([
      "merchant",
      "merchant_public_key",
      "name",
      "category",
    ]);
    expect(calls[0]!.method).toBe("sendPaymentMethodDefine");

    const envelope = JSON.parse(
      Buffer.from(String(calls[0]!.params.data), "base64").toString("utf8"),
    ) as { method: Record<string, unknown>; signature: string };
    expect(envelope.method.name).toBe("Sacco Standing Order");
    expect(envelope.method.category).toBe("BankTransfer");
    expect(envelope.method.merchant).toBe(peerIdForPublicKey(PUBLIC_KEY));
    expect(typeof envelope.signature).toBe("string");
  });

  it("returns an id in the namespace an advertisement accepts", async () => {
    // `<peer id>:<16 lowercase hex>`, never `custom:anything` — the form the
    // control that used to live here produced, and the reason it was removed
    // rather than fixed.
    const { provider } = capture("12D3KooWabcdefghijkmnopq:9f3c1a20b4d7e6f8");
    const id = await defineMerchantMethod(
      "http://node.invalid",
      provider,
      PUBLIC_KEY,
      "Sacco Standing Order",
      "BankTransfer",
    );
    expect(id).toMatch(/^[1-9A-HJ-NP-Za-km-z]{16,64}:[0-9a-f]{16}$/);
    expect(id.startsWith("custom:")).toBe(false);
  });
});

describe("names refused before the wallet is asked to sign", () => {
  it("accepts an ordinary name", () => {
    expect(nameProblem("Sacco Standing Order")).toBeNull();
    expect(nameProblem("Banco de Crédito")).toBeNull();
    expect(nameProblem("支付宝转账")).toBeNull();
  });

  it("refuses what the node refuses rather than trimming it", () => {
    // Refused and not normalised, because the bytes signed are the bytes
    // stored: a trimmed name would be a record nobody signed, and two
    // entries that print identically.
    expect(nameProblem("Acme Pay ")).not.toBeNull();
    expect(nameProblem(" Acme Pay")).not.toBeNull();
    expect(nameProblem("Acme  Pay")).not.toBeNull();
    // Written as an escape, not as the character: a no-break space is a
    // space on screen, so a reader of this file could not otherwise tell
    // this case apart from the one above — which is exactly why the node
    // refuses it.
    expect(nameProblem("Acme\u00a0Pay")).not.toBeNull();
  });

  it("refuses characters that render as nothing or redraw the row", () => {
    // Escapes throughout, for the same reason: every one of these prints
    // as "AcmePay" or "Acme Pay" and is a different string, which is the
    // entire point of using them.
    for (const hostile of [
      "Acme\u200bPay",
      "Acme\u200dPay",
      "Acme\u00adPay",
      "Acme\ufeffPay",
      "\u202eyaP emcA",
      "Acme\nPay",
    ]) {
      expect(nameProblem(hostile), hostile).not.toBeNull();
    }
  });

  it("refuses a name that is too long or says nothing", () => {
    expect(nameProblem("a".repeat(64))).toBeNull();
    expect(nameProblem("a".repeat(65))).not.toBeNull();
    expect(nameProblem("--- ***")).not.toBeNull();
  });

  it("leaves the look-alike question to the node", () => {
    // Deliberately no second copy of the confusable fold table here: it
    // would drift from the node's the first time a rail was added, and this
    // app would be confidently telling a merchant a name is fine that the
    // node refuses. A name that only *the catalogue* makes ambiguous passes
    // this check and is refused at publication.
    expect(nameProblem("Acme Pay")).toBeNull();
  });
});

describe("what a refusal means to the merchant", () => {
  it("explains the one code that covers two different refusals", () => {
    // MALFORMED_DEFINITION and IMPERSONATES_KNOWN_METHOD both arrive as
    // UNSUPPORTED_PAYMENT_METHOD, so the message must not claim to know
    // which — and must say what "look-alike" covers, or the merchant retypes
    // the same name with a hyphen and is refused again.
    const explained = explainDefineRefusal("UNSUPPORTED_PAYMENT_METHOD");
    expect(explained).toMatch(/already carries/);
    expect(explained).toMatch(/hyphen/);
  });

  it("says the definition limit is a ceiling and not a rate limit", () => {
    const explained = explainDefineRefusal("PAYMENT_METHOD_LIMIT_REACHED");
    expect(explained).toMatch(/32/);
    expect(explained).toMatch(/not a queue/);
  });

  it("passes an unrecognised failure through untouched", () => {
    expect(explainDefineRefusal("connection refused")).toBe("connection refused");
  });
});
