import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The fixtures are gone, and this is what stops them coming back.
 *
 * # Why a test rather than a note
 *
 * Because the previous guard was a note, and it failed in the direction that
 * costs the most. `components/network-notice.tsx` maintained a list of routes
 * that "still render built-in fixtures" and put a floating "Sample data"
 * badge on them. It was maintained by hand, so it went stale both ways: it
 * labelled the fully live `/providers/[id]` as fabricated for months, and it
 * never learned that `/staking`'s minimums had drifted from the chain. A list
 * somebody has to remember to edit is not a guard.
 *
 * This is mechanical. Every module below existed, was read by a route, and
 * put numbers on screen that no node and no chain had ever answered for:
 *
 *  - `lib/data/ads.ts` — a book generated at module load from a fixed-seed
 *    PRNG against a hardcoded FX table, plus a currency-to-payment-rails map
 *    printed on 253 country pages and their OpenGraph cards.
 *  - `lib/data/merchants.ts` — 68 invented merchants with wallets, tiers,
 *    30-day volumes and eight scored reputation dimensions.
 *  - `lib/data/reviews.ts` — written testimony attributed to people who do
 *    not exist.
 *  - `lib/data/sale.ts` — `raised: 24_500_000`, rendered as the headline of
 *    a token-sale page with a Buy button under it.
 *  - `lib/data/staking.ts` — bond minimums stale against the deployed
 *    `StakingConfig`, which the stake form validated against.
 *  - `lib/data/governance.ts`, `lib/data/network.ts` — invented proposals
 *    with invented vote splits, and "128 nodes online, 3,412 peers".
 *  - `lib/data/payment-methods.ts` — a stale snapshot of the node's own
 *    table.
 *  - `lib/reputation.ts`, `lib/tiers.ts`, `lib/merchant-profile.ts` — a
 *    scoring function and a tier ladder the protocol does not define.
 *
 * # What is deliberately still allowed
 *
 * `lib/data/countries.ts`. It is not data about the network: it maps
 * countries to the slugs `/country/[slug]` is built from, which
 * `generateStaticParams` and `app/sitemap.ts` need at build time, when there
 * is no node to ask and a URL scheme is this app's own affair. What the
 * network *supports* — currencies, rails, mints — comes from
 * `getReferenceData`, and no picker reads this table.
 */

const FORBIDDEN_MODULES = [
  "@/lib/data/ads",
  "@/lib/data/merchants",
  "@/lib/data/reviews",
  "@/lib/data/sale",
  "@/lib/data/staking",
  "@/lib/data/governance",
  "@/lib/data/network",
  "@/lib/data/payment-methods",
  "@/lib/reputation",
  "@/lib/tiers",
  "@/lib/merchant-profile",
];

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path));
    } else if (/\.tsx?$/.test(name)) {
      found.push(path);
    }
  }
  return found;
}

const SOURCES = ["app", "components", "lib", "tests"].flatMap(sourceFiles);

describe("no fixture module survives", () => {
  it("nothing imports a deleted fixture", () => {
    const offenders: string[] = [];
    for (const file of SOURCES) {
      const text = readFileSync(file, "utf8");
      for (const module of FORBIDDEN_MODULES) {
        // `from "…"` only — the module names appear in prose throughout this
        // repository, deliberately, because a doc comment saying what a file
        // replaced is how the reasoning survives. An import is the thing that
        // would put the data back on screen.
        if (text.includes(`from "${module}"`)) offenders.push(`${file} -> ${module}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("lib/data holds only the country routing table", () => {
    // If a second file appears here, it is a fixture unless somebody argues
    // otherwise in this test.
    expect(readdirSync("lib/data").sort()).toEqual(["countries.ts"]);
  });

  it("no module manufactures an address or a signature", () => {
    // `pseudoAddress`/`pseudoSignature` produced deterministic base58 strings
    // that looked exactly like real ones, and gave every fixture merchant a
    // wallet. Nothing in this app should be able to make one.
    const offenders = SOURCES.filter((file) =>
      /pseudoAddress|pseudoSignature/.test(readFileSync(file, "utf8")),
    ).filter((file) => !file.startsWith("tests/"));
    // One mention survives, in a doc comment explaining what the deposit form
    // used to show. Imports are what matter.
    for (const file of offenders) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(
        /import[^;]*pseudo(Address|Signature)/,
      );
    }
  });
});
