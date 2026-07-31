import { afterEach, describe, expect, it, vi } from "vitest";

import {
  explainRefusal,
  publishAdvertisement,
  setAdvertisementStatus,
  toWireAmount,
  updateAdvertisementTerms,
  type MerchantIdentity,
} from "@/lib/merchant-ads";
import type { SolanaProvider } from "@/lib/wallet-connection";

/**
 * The merchant's three signed actions, checked at the one place they can
 * silently break.
 *
 * The node verifies each signature over `serde_json`'s rendering of the
 * struct, which is field-declaration order. `JSON.stringify` follows
 * insertion order. So a reordered key here produces a payload the node
 * refuses with `INVALID_SIGNATURE` — a message that reads like a wallet
 * fault and sends whoever debugs it to the wrong place entirely.
 *
 * These orders were confirmed against a running node before they shipped;
 * this is what stops them drifting afterwards.
 */

/** The Rust struct field order, from `openfiat_advertisements::events`. */
const CREATE_KEYS = [
  "id",
  "merchant",
  "merchant_public_key",
  "asset_mint",
  "direction",
  "fiat_currency",
  "min_trade",
  "max_trade",
  "initial_liquidity",
  "pricing",
  "payment_methods",
  "timestamp",
];
const STATUS_KEYS = ["id", "merchant", "status", "timestamp"];
const TERMS_KEYS = ["id", "merchant", "min_trade", "max_trade", "payment_methods", "timestamp"];

const PUBLIC_KEY = Uint8Array.from({ length: 32 }, (_, i) => i + 1);

/** What the wallet was asked to sign, and what was posted where. */
function capture() {
  const signed: string[] = [];
  const posted: { method: string; envelope: Record<string, unknown> }[] = [];

  const provider: SolanaProvider = {
    signMessage: async (message: Uint8Array) => {
      signed.push(new TextDecoder().decode(message));
      return { signature: new Uint8Array(64).fill(9) };
    },
  } as SolanaProvider;

  vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
    const call = JSON.parse(init.body) as { method: string; params: { data: string } };
    posted.push({
      method: call.method,
      envelope: JSON.parse(Buffer.from(call.params.data, "base64").toString("utf8")),
    });
    return { json: async () => ({ jsonrpc: "2.0", id: 1, result: "ad-1" }) };
  });

  const who: MerchantIdentity = { provider, publicKey: PUBLIC_KEY };
  return { signed, posted, who };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("what the wallet is asked to sign", () => {
  it("orders a status change exactly as the node re-serializes it", async () => {
    const { signed, posted, who } = capture();
    await setAdvertisementStatus(who, "ad-1", "Vacation");

    expect(Object.keys(JSON.parse(signed[0]) as object)).toEqual(STATUS_KEYS);
    expect(posted[0].method).toBe("sendAdvertisementStatusSet");
    // The signature travels beside the payload, never inside it: the node
    // verifies over the inner struct, so a signature nested in the signed
    // bytes could not exist.
    expect(Object.keys(posted[0].envelope)).toEqual(["set", "signature"]);
  });

  it("orders a terms update exactly as the node re-serializes it", async () => {
    const { signed, posted, who } = capture();
    await updateAdvertisementTerms(who, "ad-1", {
      minTrade: 5,
      maxTrade: 500,
      paymentMethods: ["M-Pesa", "Bank Transfer"],
      decimals: 6,
    });

    const update = JSON.parse(signed[0]) as Record<string, unknown>;
    expect(Object.keys(update)).toEqual(TERMS_KEYS);
    // Payment methods keep the merchant's order. Sorting them would be a
    // different byte string and therefore a different signature.
    expect(update.payment_methods).toEqual(["M-Pesa", "Bank Transfer"]);
    expect(posted[0].method).toBe("sendAdvertisementTermsUpdate");
  });

  it("orders a new advertisement exactly as the node re-serializes it", async () => {
    const { signed, posted, who } = capture();
    await publishAdvertisement(who, {
      assetMint: "2bHPi5hA4zrmPAfrvLmEexg3KJjpTjNkUcxWnzUPeRRU",
      direction: "Sell",
      fiatCurrency: "KES",
      minTrade: 1,
      maxTrade: 500,
      initialLiquidity: 1000,
      decimals: 6,
      pricing: { Floating: { oracle_provider: "any", premium_bps: 150, price_decimals: 2 } },
      paymentMethods: ["M-Pesa"],
    });

    expect(Object.keys(JSON.parse(signed[0]) as object)).toEqual(CREATE_KEYS);
    expect(posted[0].method).toBe("sendAdvertisementCreate");
  });

  it("carries every amount as base units and the asset's own precision", async () => {
    // Never a bare number: `Amount` is base units plus decimals, and an
    // update that changed the precision would rescale the merchant's
    // limits by a power of ten with nothing on screen to show it.
    const { signed, who } = capture();
    await updateAdvertisementTerms(who, "ad-1", {
      minTrade: 5,
      maxTrade: 500,
      paymentMethods: ["M-Pesa"],
      decimals: 6,
    });

    const update = JSON.parse(signed[0]) as {
      min_trade: { base_units: number; decimals: number };
      max_trade: { base_units: number; decimals: number };
    };
    expect(update.min_trade).toEqual({ base_units: 5_000_000, decimals: 6 });
    expect(update.max_trade).toEqual({ base_units: 500_000_000, decimals: 6 });
  });
});

describe("toWireAmount", () => {
  it("rounds rather than truncating", () => {
    // 0.1 * 10**6 is 100000.00000000001 in binary floating point, and 2.3
    // at six decimals lands just under. Truncation would publish a limit
    // one base unit below what the merchant typed — every time, silently.
    expect(toWireAmount(0.1, 6).base_units).toBe(100_000);
    expect(toWireAmount(2.3, 6).base_units).toBe(2_300_000);
    expect(toWireAmount(1.005, 2).base_units).toBe(100);
  });

  it("keeps zero-decimal assets whole", () => {
    expect(toWireAmount(7, 0)).toEqual({ base_units: 7, decimals: 0 });
  });
});

describe("explainRefusal", () => {
  it("says what a merchant can act on", () => {
    expect(explainRefusal("ADVERTISEMENT_NOT_FOUND")).toMatch(/cannot be brought back/);
    expect(explainRefusal("INSUFFICIENT_AVAILABLE_LIQUIDITY")).toMatch(/no liquidity/);
    expect(explainRefusal("INVALID_ADVERTISEMENT")).toMatch(/payment method/);
    expect(explainRefusal("INVALID_SIGNATURE")).toMatch(/wallet that published it/);
  });

  it("passes an unrecognised failure through untouched", () => {
    // A message nobody wrote beats one that fits every failure: the whole
    // value of the node's own wording is that it is specific.
    expect(explainRefusal("connection refused")).toBe("connection refused");
  });
});
