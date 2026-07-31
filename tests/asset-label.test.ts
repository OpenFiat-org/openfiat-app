import { describe, expect, it } from "vitest";

import { assetLabel } from "@/lib/live-advertisements";

/**
 * An advertisement names a mint and no ticker. The name a reader sees is
 * resolved from that mint by the node answering the call, and comes back
 * `null` for a mint this build of the node has no name for.
 *
 * What this app does with that `null` is the whole decision, and it is easy
 * to erode by accident: a dash reads tidier, "Unknown token" reads friendlier,
 * and a mint-to-ticker table in this repo would make almost all of them go
 * away. Each of those hides which token a buyer is about to be paid in, which
 * is the exact gap `asset_mint` closed. These pin the answer.
 */
const USDC_MINT = "2bHPi5hA4zrmPAfrvLmEexg3KJjpTjNkUcxWnzUPeRRU";
const UNNAMED_MINT = "J2DNkV3tjn96SpYNnJTAzVi9JUhgLFHfYHMWSFDfkdKs";

describe("assetLabel", () => {
  it("uses the name the node resolved, when it resolved one", () => {
    expect(assetLabel({ assetMint: USDC_MINT, assetSymbol: "USDC" })).toBe("USDC");
  });

  /*
   * Unhelpful and true, not helpful and false. The address in full — not
   * shortened, because a prefix of a mint is a different string from the
   * mint, and the point of showing it at all is that it identifies the token.
   */
  it("falls back to the mint address in full when the node has no name", () => {
    expect(assetLabel({ assetMint: UNNAMED_MINT, assetSymbol: null })).toBe(UNNAMED_MINT);
  });

  /*
   * The failure mode this is really guarding: a placeholder that reads as a
   * value. Anything that is not the symbol and not the address is this app
   * inventing an answer the protocol did not give it.
   */
  it("never substitutes a placeholder for a mint it cannot name", () => {
    const label = assetLabel({ assetMint: UNNAMED_MINT, assetSymbol: null });
    for (const invented of ["—", "-", "?", "", "Unknown", "Unknown token", "N/A"]) {
      expect(label).not.toBe(invented);
    }
  });

  /*
   * Whatever the node called it, including names this app ships no coin art
   * for and has never heard of. The symbol is the node's answer, not a value
   * this app validates against a list of tokens it approves of — that list
   * would be the mint-to-ticker table by another name.
   */
  it("passes through a name this app knows nothing about", () => {
    expect(assetLabel({ assetMint: USDC_MINT, assetSymbol: "tUSDC" })).toBe("tUSDC");
  });
});
