/**
 * The pure half of `lib/reference.ts`: how a node's answer becomes the
 * rows a picker shows, and how a method search behaves over it.
 *
 * The fixture below is a small, hand-checked slice shaped exactly like
 * `getReferenceData` sends — not the whole 253-country table, because
 * these tests are about the transformation and not about the data. What
 * the data itself has to satisfy is asserted where it lives, in
 * `crates/rpc/src/methods/reference.rs`; duplicating it here would be a
 * second copy of the thing this whole change exists to stop copying.
 */
import { describe, expect, it } from "vitest";
import type { ReferenceData } from "@openfiat/sdk";
import {
  currencyOptions,
  flagForCountry,
  isSuggestedMethod,
  mintFor,
  searchPaymentMethods,
} from "@/lib/reference";

const NODE_ANSWER: ReferenceData = {
  revision: "9f2c4a1b7e0d3856",
  currencies: [
    { code: "KES", name: "Kenyan shilling", symbol: "KSh" },
    { code: "USD", name: "United States dollar", symbol: "$" },
    { code: "ZAR", name: "South African rand", symbol: "R" },
    { code: "ZWG", name: "Zimbabwe Gold", symbol: "ZiG" },
    { code: "EUR", name: "Euro", symbol: "€" },
    { code: "TRY", name: "Turkish lira", symbol: "₺" },
  ],
  countries: [
    { code: "KE", name: "Kenya", currency: "KES", alt_currencies: [] },
    { code: "ZW", name: "Zimbabwe", currency: "ZWG", alt_currencies: ["USD", "ZAR"] },
    // Deliberately after Zimbabwe, which trades in rand as an alternate:
    // the first mention of ZAR is by a country that merely spends it.
    { code: "ZA", name: "South Africa", currency: "ZAR", alt_currencies: [] },
    { code: "DE", name: "Germany", currency: "EUR", alt_currencies: [] },
    { code: "FR", name: "France", currency: "EUR", alt_currencies: [] },
    { code: "IE", name: "Ireland", currency: "EUR", alt_currencies: [] },
    { code: "ES", name: "Spain", currency: "EUR", alt_currencies: [] },
    // No ISO code, and no flag of its own in Unicode — both cases the
    // rendering has to survive.
    { code: "XNC", name: "Northern Cyprus", currency: "TRY", alt_currencies: [] },
  ],
  payment_methods: [
    { name: "M-Pesa Kenya (Safaricom)", category: "MobileMoney", aliases: ["mpesa", "m-pesa"] },
    { name: "Mpesa Pochi la Biashara", category: "MobileMoney", aliases: ["pochi"] },
    { name: "FPS (Faster Payment System)", category: "BankTransfer", aliases: ["fps"] },
    { name: "Faster Payments (UK)", category: "BankTransfer", aliases: ["faster payments uk"] },
    { name: "Cash in Person", category: "Cash", aliases: ["cash", "f2f"] },
  ],
  mints: [
    { mint: "So11111111111111111111111111111111111111112", symbol: "wSOL", decimals: 9 },
    { mint: "C4rSGhdxWhSFQuFcAxQti1JvBxriwHJoHtJjfhs5p24Y", symbol: "USDT", decimals: 6 },
  ],
};

describe("currency options built from a node's answer", () => {
  it("offers every currency a country trades in, not only its primary one", () => {
    const codes = currencyOptions(NODE_ANSWER).map((o) => o.code);
    // Zimbabwe's USD book is frequently the larger of its two. A picker
    // built from primary currencies alone would never show it, and a
    // user searching "Zimbabwe" would be told the only option is ZWG.
    expect(codes).toContain("ZWG");
    expect(codes).toContain("USD");
    expect(codes).toContain("ZAR");
  });

  it("lists a currency once, naming a few of the countries that use it", () => {
    const euro = currencyOptions(NODE_ANSWER).find((o) => o.code === "EUR");
    expect(euro?.name).toBe("Euro");
    // Capped at three: the row is for recognising a currency at a glance,
    // and twenty country names in a 24rem panel recognise nothing.
    expect(euro?.countries).toEqual(["Germany", "France", "Ireland"]);
  });

  it("draws a supranational currency with its own flag, not a member state's", () => {
    const options = currencyOptions(NODE_ANSWER);
    // Germany happens to sort first among euro users here. Showing the
    // German flag for the euro looks like a bug because it is one.
    expect(options.find((o) => o.code === "EUR")?.flag).toBe("🇪🇺");
    expect(options.find((o) => o.code === "KES")?.flag).toBe("🇰🇪");
  });

  it("flags a currency by a country that issues it, not one that merely spends it", () => {
    // Zimbabwe lists the rand as an alternate and appears before South
    // Africa, so taking whichever country mentioned ZAR first would draw
    // the rand under a Zimbabwean flag.
    const options = currencyOptions(NODE_ANSWER);
    expect(options.find((o) => o.code === "ZAR")?.flag).toBe("🇿🇦");
    expect(options.find((o) => o.code === "ZWG")?.flag).toBe("🇿🇼");
  });

  it("puts this interface's preferred currencies first and the rest in code order", () => {
    const codes = currencyOptions(NODE_ANSWER).map((o) => o.code);
    // Ordering is this app's opinion about its own users, which is why it
    // stayed here rather than being asked of the node.
    expect(codes.indexOf("KES")).toBeLessThan(codes.indexOf("USD"));
    expect(codes.indexOf("USD")).toBeLessThan(codes.indexOf("EUR"));
    expect(codes.indexOf("TRY")).toBeLessThan(codes.indexOf("ZWG"));
  });

  it("gives a territory with no ISO code a flag rather than a broken glyph", () => {
    // The node's country codes are not all two characters, and deriving
    // regional indicators from "XNC" would produce something no font can
    // draw. Northern Cyprus shows Türkiye's flag; anything unrecognised
    // shows a neutral one.
    expect(flagForCountry("XNC")).toBe("🇹🇷");
    expect(flagForCountry("ZZZZ")).toBe("🏳️");
  });
});

describe("payment method type-ahead over a node's list", () => {
  const methods = NODE_ANSWER.payment_methods;

  it("finds methods by name and by alias", () => {
    expect(searchPaymentMethods(methods, "mp")).toContain("M-Pesa Kenya (Safaricom)");
    expect(searchPaymentMethods(methods, "mp")).toContain("Mpesa Pochi la Biashara");
    expect(searchPaymentMethods(methods, "pochi")).toEqual(["Mpesa Pochi la Biashara"]);
    expect(searchPaymentMethods(methods, "").length).toBeGreaterThan(0);
  });

  it("does not confuse Hong Kong's FPS with the UK's Faster Payments", () => {
    // Different rails, different central banks, same abbreviation. A Hong
    // Kong merchant handed the UK entry would be advertising a system
    // they cannot receive on. The aliases that make this work are the
    // node's; this asserts the search honours them.
    expect(searchPaymentMethods(methods, "fps")).toContain("FPS (Faster Payment System)");
    expect(searchPaymentMethods(methods, "fps")).not.toContain("Faster Payments (UK)");
    expect(searchPaymentMethods(methods, "faster payments uk")).toContain("Faster Payments (UK)");
  });

  it("keeps a method the user added findable, after the node's own", () => {
    // The node's list is a suggestion, not a permission — a merchant on a
    // rail nobody has heard of has to be able to name it and go on using
    // it.
    expect(searchPaymentMethods(methods, "zapcash", ["ZapCash"])).toEqual(["ZapCash"]);
    expect(searchPaymentMethods(methods, "", ["ZapCash"]).at(-1)).toBe("ZapCash");
  });

  it("tells a node-suggested method apart from one the user typed in", () => {
    expect(isSuggestedMethod(methods, "Cash in Person")).toBe(true);
    expect(isSuggestedMethod(methods, "ZapCash")).toBe(false);
    // And with no answer yet, nothing is claimed either way — the caller
    // is what must not badge on an empty list. See `MethodPicker`.
    expect(isSuggestedMethod([], "Cash in Person")).toBe(false);
  });
});

describe("mints", () => {
  it("resolves a mint by address, which is the only thing that identifies one", () => {
    // `/sol/kes` could never match an advertisement because this app
    // matched the book on the ticker it had chosen and the node answers
    // `wSOL`. Address in, name out.
    expect(mintFor(NODE_ANSWER, "So11111111111111111111111111111111111111112")?.symbol).toBe(
      "wSOL",
    );
    expect(mintFor(NODE_ANSWER, "So11111111111111111111111111111111111111112")?.decimals).toBe(9);
  });

  it("has no name for an address the node did not list, which is an answer", () => {
    // Not an error: an unknown mint is an address with no nickname, and
    // the honest thing to show is the address.
    expect(mintFor(NODE_ANSWER, "NotAMintAddress1111111111111111111111111111")).toBeUndefined();
  });
});
