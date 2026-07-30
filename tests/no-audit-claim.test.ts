import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/*
 * "Audited" is the strongest safety signal a protocol can put next to the word
 * escrow, and no external audit has been performed — OFS-4200 §Status names
 * one as a gate ahead of mainnet, so the programs are pre-audit by the
 * specification's own account.
 *
 * It reached the root layout's description, both OpenGraph cards and the
 * country page metadata, which is the worst place for it: metadata is what a
 * search result shows and what a shared link carries into a timeline, read by
 * people who never see the banner in `components/top-nav.tsx` saying the
 * programs are unaudited. This is a text assertion rather than a type or a
 * route because the claim is a string, and a string can be reintroduced by
 * anyone writing marketing copy in good faith.
 */
const ROOTS = ["app", "components", "lib"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("claims about the on-chain programs", () => {
  it("never describes the Solana programs as audited", () => {
    const offenders = ROOTS.flatMap(sourceFiles).filter((path) =>
      /\baudited\b/.test(
        readFileSync(path, "utf8")
          // The word is legitimate in prose explaining that they are NOT
          // audited, and in "unaudited" itself.
          .replace(/unaudited/g, "")
          .replace(/^\s*(\/\/|\*|\/\*).*$/gm, ""),
      ),
    );
    expect(offenders).toEqual([]);
  });
});
