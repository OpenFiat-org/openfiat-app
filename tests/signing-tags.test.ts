import { describe, expect, it } from "vitest";

import { tags } from "@/lib/signing-tags";
import vectors from "./vectors/client_signed_v1.json";

/**
 * Guards `lib/signing-tags.ts`'s literals themselves (F-01).
 *
 * `tests/conformance_vectors.test.ts` proves the *header format* matches
 * Rust byte for byte, and the per-caller tests elsewhere (`trade-flow`,
 * `payment-catalog`, `channel-identity`, ...) prove each call site reaches
 * for the *right key* of `tags`. Neither catches a typo in a literal
 * itself — `tags.SettlementApproved` spelled with the wrong case, or
 * copy-pasted from a neighbouring entry — since a test that only reads
 * `tags.SettlementApproved` back out would pass even if the string inside
 * it were wrong. This file is the one that reads the literals and checks
 * them against something else: their own shape, and (where one exists) the
 * vendored Rust vector's exact spelling.
 */

const TAG_SHAPE = /^openfiat\/[a-z]+\/[A-Za-z]+\/v\d+$/;

const vectorTagByName = new Map((vectors as { tag: string }[]).map((row) => [row.tag, row.tag]));

describe("lib/signing-tags.ts's literals", () => {
  it.each(Object.entries(tags))("%s is a well-formed openfiat/<domain>/<Type>/v1 tag", (_key, value) => {
    expect(value).toMatch(TAG_SHAPE);
  });

  // `PaymentMethodDefine` has no row in the vendored vector file: unlike
  // every other tag here, it is a pre-existing core taxonomy tag this app
  // adopted for a client-signed event rather than one added alongside F-01's
  // batch, so it never had a conformance vector generated for it. Its
  // literal is verified by hand against the Rust `tag::PAYMENT_METHOD_DEFINE`
  // constant instead — see `lib/signing-tags.ts`'s comment on this entry.
  const NO_VECTOR_ROW = new Set<string>(["PaymentMethodDefine"]);

  it("has a vector row for every tag except the documented exceptions", () => {
    for (const key of Object.keys(tags)) {
      if (NO_VECTOR_ROW.has(key)) continue;
      expect(vectorTagByName.has(tags[key as keyof typeof tags]), key).toBe(true);
    }
  });

  it.each(
    Object.entries(tags).filter(([key]) => !NO_VECTOR_ROW.has(key)),
  )("%s matches its vector row exactly", (_key, value) => {
    // Not just "some row has this string" — the row keyed by this exact
    // value must exist, so a tag that drifted even slightly from the
    // vendored vector (a typo `lib/signing-tags.ts` and the vector happen
    // to share is the one case a fuzzy check would miss) fails here.
    expect(vectorTagByName.get(value)).toBe(value);
  });

  it("documents PaymentMethodDefine as the one deliberate no-vector exception", () => {
    expect(NO_VECTOR_ROW.has("PaymentMethodDefine")).toBe(true);
    expect(vectorTagByName.has(tags.PaymentMethodDefine)).toBe(false);
    expect(tags.PaymentMethodDefine).toMatch(TAG_SHAPE);
  });
});
