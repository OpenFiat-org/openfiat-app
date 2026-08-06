/**
 * `lib/ad-draft.ts`: what stops each step of the post-advertisement wizard
 * from being finished.
 *
 * These rules used to be two record literals inline in a 759-line React
 * component, so the only way to check that a −6% premium is refused was to
 * render a tree. Extracting them is most of why this file can exist.
 */
import { describe, expect, it } from "vitest";

import {
  AD_STEPS,
  EMPTY_AD_DRAFT,
  MAX_PAYMENT_METHODS,
  completeThrough,
  parseDraft,
  priceDecimalsFor,
  stepProblems,
  typedDecimals,
  type AdDraft,
} from "@/lib/ad-draft";
import type { AssetOption } from "@/lib/reference";

const USDC: AssetOption = {
  mint: "2bHPi5hA4zrmPAfrvLmEexg3KJjpTjNkUcxWnzUPeRRU",
  symbol: "USDC",
  decimals: 6,
};

/** A draft that is finished, so each test can break exactly one thing. */
const COMPLETE: AdDraft = {
  ...EMPTY_AD_DRAFT,
  mint: USDC.mint,
  fiat: "KES",
  pricingType: "Fixed",
  price: "129.50",
  totalAmount: "1000",
  minOrder: "10",
  maxOrder: "500",
  country: "KE",
  methods: ["A rail"],
};

const problems = (draft: Partial<AdDraft>, asset: AssetOption | null = USDC) =>
  stepProblems({ ...COMPLETE, ...draft }, asset);

describe("the wizard's step order", () => {
  it("is Binance's: ad type and asset, price, amount and limits, payment, review", () => {
    // Not a cosmetic detail. Anybody who has posted a P2P advertisement
    // anywhere has done these five in this order, and a different order for
    // the same five decisions carries no information.
    expect([...AD_STEPS]).toEqual([
      "Ad type & asset",
      "Price",
      "Amount & limits",
      "Payment",
      "Review",
    ]);
  });

  it("starts empty, with nothing chosen on the merchant's behalf", () => {
    // The old default was a complete, plausible Kenyan advertisement — a
    // mint, KES, a 0.8% premium, 10–5,000 limits, 10,000 of liquidity and a
    // payment method — one Continue away from being signed by somebody who
    // had written none of it.
    expect(EMPTY_AD_DRAFT.mint).toBe("");
    expect(EMPTY_AD_DRAFT.fiat).toBe("");
    expect(EMPTY_AD_DRAFT.price).toBe("");
    expect(EMPTY_AD_DRAFT.premium).toBe("");
    expect(EMPTY_AD_DRAFT.totalAmount).toBe("");
    expect(EMPTY_AD_DRAFT.minOrder).toBe("");
    expect(EMPTY_AD_DRAFT.maxOrder).toBe("");
    expect(EMPTY_AD_DRAFT.methods).toEqual([]);
    expect(stepProblems(EMPTY_AD_DRAFT, null)[1]!.length).toBeGreaterThan(0);
  });
});

describe("step 1 — ad type and asset", () => {
  it("needs a token and a currency", () => {
    expect(problems({ mint: "" })[1].map((p) => p.key)).toContain("chooseToken");
    expect(problems({ fiat: "" })[1].map((p) => p.key)).toContain(
      "chooseFiat",
    );
    expect(problems({})[1]).toEqual([]);
  });

  it("refuses a token the node cannot put a precision on", () => {
    // Every amount on the record is base units plus decimals. Publishing
    // against a guessed precision scales the limits by a power of ten, and
    // nothing downstream notices.
    expect(problems({}, null)[1].map((p) => p.key)).toContain(
      "tokenUnnamed",
    );
  });
});

describe("step 2 — price", () => {
  it("takes a fixed price at the precision it was typed at", () => {
    expect(typedDecimals("129.50")).toBe(2);
    expect(typedDecimals("129")).toBe(0);
    expect(priceDecimalsFor({ ...COMPLETE, price: "129.50" })).toBe(2);
    // Nothing is rounded away and nothing is invented — the merchant's own
    // input is the answer, so no currency-to-decimals table is needed.
    expect(priceDecimalsFor({ ...COMPLETE, price: "1.234567" })).toBe(6);
  });

  it("refuses a fixed price of zero", () => {
    expect(problems({ price: "0" })[2].map((p) => p.key)).toContain("fixedPricePositive");
    expect(problems({ price: "" })[2].map((p) => p.key)).toContain("fixedPricePositive");
  });

  it("holds a floating premium inside the range the node enforces", () => {
    const floating = { pricingType: "Floating" as const, premium: "0.8" };
    expect(problems(floating)[2]).toEqual([]);
    expect(problems({ ...floating, premium: "-6" })[2].map((p) => p.key)).toContain(
      "premiumRange",
    );
    expect(problems({ ...floating, premium: "5.1" })[2].map((p) => p.key)).toContain(
      "premiumRange",
    );
    // Zero is a real answer — it tracks the mid exactly — and must not be
    // mistaken for "nothing entered".
    expect(problems({ ...floating, premium: "0" })[2]).toEqual([]);
    expect(problems({ ...floating, premium: "" })[2].map((p) => p.key)).toContain(
      "enterPremium",
    );
  });

  it("asks a floating advertisement for its own price precision", () => {
    const floating = { pricingType: "Floating" as const, premium: "0" };
    expect(priceDecimalsFor({ ...COMPLETE, ...floating, priceDecimals: "0" })).toBe(0);
    expect(problems({ ...floating, priceDecimals: "13" })[2].map((p) => p.key)).toContain(
      "priceDecimalsRange",
    );
    expect(problems({ ...floating, priceDecimals: "2.5" })[2].map((p) => p.key)).toContain(
      "priceDecimalsRange",
    );
  });
});

describe("step 3 — amount and limits", () => {
  it("needs a total and a workable pair of limits", () => {
    expect(problems({ totalAmount: "0" })[3].map((p) => p.key)).toContain(
      "enterTotal",
    );
    expect(problems({ minOrder: "0" })[3].map((p) => p.key)).toContain("enterMin");
    expect(problems({ minOrder: "500", maxOrder: "100" })[3].map((p) => p.key)).toContain(
      "maxAtLeastMin",
    );
  });

  it("refuses limits no order could satisfy", () => {
    // An advertisement whose minimum exceeds its total sits in the book,
    // quotes a price and refuses every reservation — worse than not posting.
    expect(problems({ totalAmount: "100", minOrder: "500", maxOrder: "900" })[3].map((p) => p.key)).toContain(
      "minLargerThanTotal",
    );
    expect(problems({ totalAmount: "100", minOrder: "10", maxOrder: "900" })[3].map((p) => p.key)).toContain(
      "maxLargerThanTotal",
    );
  });
});

describe("step 4 — payment methods", () => {
  it("needs at least one and allows at most five", () => {
    expect(problems({ methods: [] })[4].map((p) => p.key)).toContain("selectMethod");
    const five = Array.from({ length: MAX_PAYMENT_METHODS }, (_, i) => `Rail ${i}`);
    expect(problems({ methods: five })[4]).toEqual([]);
    expect(problems({ methods: [...five, "One too many"] })[4].map((p) => p.key)).toContain(
      "atMostMethods",
    );
  });
});

describe("completeThrough", () => {
  it("is true only when every earlier step is finished too", () => {
    const done = stepProblems(COMPLETE, USDC);
    expect(completeThrough(done, AD_STEPS.length)).toBe(true);
    const broken = stepProblems({ ...COMPLETE, fiat: "" }, USDC);
    expect(completeThrough(broken, AD_STEPS.length)).toBe(false);
    // Reaching review does not make step 1 finished.
    expect(completeThrough(broken, 1)).toBe(false);
  });
});

describe("restoring a saved draft", () => {
  it("forgets fields an older build wrote and keeps the ones that survive", () => {
    // A draft from before this rewrite carried `liquidity`, `minRep` and a
    // typed `mint`. `minRep` in particular was a control that was collected,
    // persisted, and never sent anywhere.
    const old = JSON.stringify({
      step: 3,
      direction: "Buy",
      mint: USDC.mint,
      fiat: "NGN",
      liquidity: "10000",
      minRep: "70",
      methods: ["A rail"],
    });
    const draft = parseDraft(old);
    expect(draft.direction).toBe("Buy");
    expect(draft.fiat).toBe("NGN");
    expect(draft.methods).toEqual(["A rail"]);
    expect(Object.keys(draft)).toEqual(Object.keys(EMPTY_AD_DRAFT));
    expect(draft.totalAmount).toBe("");
  });

  it("clamps a step number a hand-edited draft could put out of range", () => {
    expect(parseDraft(JSON.stringify({ step: 99 })).step).toBe(AD_STEPS.length);
    expect(parseDraft(JSON.stringify({ step: 0 })).step).toBe(1);
    expect(parseDraft(JSON.stringify({ step: "nonsense" })).step).toBe(1);
  });

  it("drops a methods field that is not a list of strings", () => {
    expect(parseDraft(JSON.stringify({ methods: "M-Pesa" })).methods).toEqual([]);
    expect(parseDraft(JSON.stringify({ methods: ["ok", 7, null] })).methods).toEqual(["ok"]);
  });
});
