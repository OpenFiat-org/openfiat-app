import { describe, expect, it } from "vitest";

import {
  currentClaimOfType,
  currentClaims,
  inactiveReason,
  replacedClaimIds,
  type IdentityClaimRecord,
} from "@/lib/live-identity";

const NOW = 1_800_000_000_000;

function claim(partial: Partial<IdentityClaimRecord> = {}): IdentityClaimRecord {
  return {
    claimId: "c1",
    type: "MerchantName",
    custom: false,
    value: "Acme",
    verified: false,
    supersedes: null,
    expiresAt: null,
    revoked: false,
    createdAt: NOW - 1000,
    ...partial,
  };
}

/*
 * OFS-5000 §7/§11: a claim is immutable. Changing a value publishes a new
 * claim naming the old one in `supersedes`, and the old one stays in the
 * record — so "what is this wallet's name right now" is a question about the
 * supersedes chain, expiry and revocation, not about which row came back
 * first.
 */
describe("which claims are in force", () => {
  it("drops a claim a later one replaced", () => {
    const claims = [
      claim({ claimId: "new", value: "Acme Two", supersedes: "old" }),
      claim({ claimId: "old", value: "Acme One" }),
    ];
    expect(currentClaims(claims, NOW).map((c) => c.claimId)).toEqual(["new"]);
  });

  it("drops revoked and expired claims", () => {
    const claims = [
      claim({ claimId: "revoked", revoked: true }),
      claim({ claimId: "expired", expiresAt: NOW - 1 }),
      claim({ claimId: "live", expiresAt: NOW + 1 }),
    ];
    expect(currentClaims(claims, NOW).map((c) => c.claimId)).toEqual(["live"]);
  });

  /*
   * The readers this replaced each took "newest non-revoked of this type",
   * which ignored expiry entirely — an expired name would have been shown as
   * the wallet's live one. Pinned because it is the failure that motivated
   * sharing this logic between the name, avatar and claims readers rather
   * than letting each keep its own rule.
   */
  it("does not treat an expired claim as current just because it is newest", () => {
    const claims = [
      claim({ claimId: "recent", value: "Expired Name", expiresAt: NOW - 1, createdAt: NOW }),
      claim({ claimId: "older", value: "Live Name", createdAt: NOW - 5000 }),
    ];
    expect(currentClaimOfType(claims, "MerchantName", NOW)?.value).toBe("Live Name");
  });

  /*
   * §8 allows a wallet several verified contacts at once, so "the newest of
   * this type" is not a synonym for "the current one". Resolving through
   * `supersedes` keeps both live emails visible instead of hiding one.
   */
  it("keeps several live claims of the same type", () => {
    const claims = [
      claim({ claimId: "e1", type: "Email", value: "a@example.com" }),
      claim({ claimId: "e2", type: "Email", value: "b@example.com" }),
    ];
    expect(currentClaims(claims, NOW)).toHaveLength(2);
  });

  it("never returns a Custom claim under a known type's name", () => {
    const claims = [claim({ claimId: "x", type: "MerchantName", custom: true })];
    expect(currentClaimOfType(claims, "MerchantName", NOW)).toBeNull();
  });
});

/*
 * Superseded, revoked and expired claims stay on screen — the record is
 * public and a merchant should see what a counterparty inspecting them sees.
 * That only works if each one says which of the three it is.
 */
describe("why a claim is not in force", () => {
  it("names the reason rather than just dimming the row", () => {
    const claims = [
      claim({ claimId: "new", supersedes: "old" }),
      claim({ claimId: "old" }),
      claim({ claimId: "gone", revoked: true }),
      claim({ claimId: "stale", expiresAt: NOW - 1 }),
    ];
    const replaced = replacedClaimIds(claims);
    expect(replaced.has("old")).toBe(true);
    expect(inactiveReason(claims[0]!, replaced, NOW)).toBeNull();
    expect(inactiveReason(claims[1]!, replaced, NOW)).toBe("Superseded");
    expect(inactiveReason(claims[2]!, replaced, NOW)).toBe("Revoked");
    expect(inactiveReason(claims[3]!, replaced, NOW)).toBe("Expired");
  });
});
