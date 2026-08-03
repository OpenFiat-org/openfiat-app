/**
 * `lib/payment-catalog.ts`: how `getPaymentMethods`' three lists become the
 * one ordered list a picker shows, and how the type-ahead behaves over it.
 *
 * The fixture is shaped exactly like a real answer from the node — verified
 * against `getPaymentMethods { country: "KE" }` on a running node, which
 * returns M-Pesa Kenya, Pochi la Biashara, Airtel Money and the local banks
 * as `suggested`, with the whole rest of the catalogue under `others`.
 */
import { describe, expect, it } from "vitest";

import { groupedMethods, searchGrouped, type CountryMethods } from "@/lib/payment-catalog";

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
