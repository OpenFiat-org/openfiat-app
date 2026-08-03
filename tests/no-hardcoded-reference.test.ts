import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The node answers what the network supports. This is what stops this app
 * answering it again.
 *
 * # Why a mechanical check and not a rule in a document
 *
 * Because it has come back three times. `lib/data/countries.ts` (253
 * countries with their currencies), `lib/data/payment-methods.ts` (84
 * rails), and `PAIR_ASSETS = ["USDT", "USDC", "USD1", "SOL"]` were each
 * removed with a paragraph explaining why, and each was re-derivable from
 * the next screen that needed a dropdown and had a deadline. The ad wizard's
 * own default draft still carried `methods: ["M-Pesa Kenya (Safaricom)"]`
 * long after the table that string came from was deleted.
 *
 * `tests/no-fixtures.test.ts` guards the *modules* that were deleted, by
 * name. This guards the *shape*, so the same table under a new filename is
 * caught too.
 *
 * # The line is drawn on size, and that is a deliberate compromise
 *
 * A short list is sometimes this interface's own opinion, honestly held:
 * `PREFERRED_CURRENCY_CODES` decides which ten currencies float to the top
 * of a picker, which is a claim about this app's users and not about the
 * network. A long list is a catalogue, and a catalogue is a claim about the
 * network whatever its author meant.
 *
 * So the thresholds below are low enough to catch a catalogue and high
 * enough to leave an ordering preference alone. They are not a proof that no
 * small hardcoded list exists — they are a floor, and a fourteen-country
 * list would slip past. What is *not* a compromise is the payment-method
 * rule: a rail name is distinctive enough to name exactly, so a single one
 * in code is an offence.
 */

const ROOTS = ["app", "components", "lib"];

/**
 * Exempt, and only this: `components/faucet` and `lib/faucet-*` answer to
 * the `openfiat-faucet` service rather than to a node, and its request
 * vocabulary is that service's, not the network's. The same exemption and
 * the same reason as `tests/exchange-assets.test.tsx`.
 */
const NOT_THIS_APPS_TO_NAME = [join("components", "faucet"), "faucet-client", "faucet-config"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

/**
 * Comments stripped, because every module that got this wrong now carries a
 * paragraph quoting the list it used to hold — and a guard that reads
 * documentation as evidence would forbid explaining the mistake.
 */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Every `[...]` literal in the source, non-nested, as raw text. */
function arrayLiterals(source: string): string[] {
  return source.match(/\[[^[\]]*\]/g) ?? [];
}

function stringsIn(literal: string): string[] {
  return (literal.match(/"[^"\n]*"|'[^'\n]*'/g) ?? []).map((s) => s.slice(1, -1));
}

const FILES = ROOTS.flatMap(sourceFiles).filter(
  (path) => !NOT_THIS_APPS_TO_NAME.some((exempt) => path.includes(exempt)),
);

/**
 * Rails, by name.
 *
 * Every one of these is a payment method the node's own catalogue carries,
 * and none of them is a word that turns up in an unrelated identifier. A
 * literal here means somebody has written a rail into this app — as a
 * default, as a dropdown, or as a filter — and the node is the only thing
 * entitled to say which rails exist.
 */
const RAIL_NAMES = [
  "M-Pesa",
  "Mpesa",
  "MPesa",
  "Pochi la Biashara",
  "Airtel Money",
  "MTN Mobile Money",
  "Tigo Pesa",
  "Orange Money",
  "PIX",
  "Mercado Pago",
  "UPI",
  "SEPA",
  "Faster Payments",
  "Zelle",
  "Alipay",
  "WeChat Pay",
  "GCash",
  "Easypaisa",
  "JazzCash",
  "bKash",
  "Nagad",
  "Wise",
  "Revolut",
  "Interac",
  "Equity Bank",
];

/** Mint-shaped: base58, and the length a 32-byte key encodes to. */
const MINT_SHAPED = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Solana's two token programs, which are mint-shaped and are not mints.
 *
 * Named here rather than exempting the file that lists them, because the
 * carve-out is about what these addresses *are*: every SPL token in
 * existence lives under one of the two, they are defined by Solana and not
 * by this network, and `lib/live-token-balances.ts` has to ask both or it
 * silently under-reports a wallet. A list of them enumerates nothing about
 * what OpenFiat supports.
 */
const NOT_MINTS = new Set([
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
]);

/** ISO 4217-shaped: exactly three or four capitals. */
const CURRENCY_SHAPED = /^[A-Z]{3,4}$/;

/** ISO 3166-1 alpha-2-shaped: exactly two capitals. */
const COUNTRY_SHAPED = /^[A-Z]{2}$/;

describe("no list of what the network supports is compiled into this app", () => {
  it("names no payment method anywhere in code", () => {
    // The exact regression this exists for: `DEFAULT_DRAFT` in the ad wizard
    // shipped `methods: ["M-Pesa Kenya (Safaricom)"]` — a Kenyan rail chosen
    // on every merchant's behalf, from a table that had already been deleted.
    const offenders: string[] = [];
    for (const file of FILES) {
      const source = code(readFileSync(file, "utf8"));
      for (const rail of RAIL_NAMES) {
        // In a string literal, not merely in the file: a rail's name inside
        // an identifier or a URL is not a list of rails.
        if (new RegExp(`["'][^"'\\n]*\\b${rail.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")}\\b`).test(source)) {
          offenders.push(`${file} -> ${rail}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("declares no catalogue of currencies", () => {
    // `lib/reference.ts`'s ten preferred codes are an ordering preference and
    // stay under this. 159 currencies would not.
    const offenders = FILES.filter((file) =>
      arrayLiterals(code(readFileSync(file, "utf8"))).some(
        (literal) => stringsIn(literal).filter((s) => CURRENCY_SHAPED.test(s)).length >= 20,
      ),
    );
    expect(offenders).toEqual([]);
  });

  it("declares no catalogue of countries", () => {
    const offenders = FILES.filter((file) =>
      arrayLiterals(code(readFileSync(file, "utf8"))).some(
        (literal) => stringsIn(literal).filter((s) => COUNTRY_SHAPED.test(s)).length >= 20,
      ),
    );
    expect(offenders).toEqual([]);
  });

  it("declares no list of mint addresses", () => {
    // Two is a list. Individual named constants — the escrow program id, the
    // devnet OPEN mint — are not: each is one address with a paragraph
    // saying what it is, and none of them claims to enumerate anything.
    const offenders = FILES.filter((file) =>
      arrayLiterals(code(readFileSync(file, "utf8"))).some(
        (literal) =>
          stringsIn(literal).filter((s) => MINT_SHAPED.test(s) && !NOT_MINTS.has(s)).length >= 2,
      ),
    );
    expect(offenders).toEqual([]);
  });

  /**
   * The checks above are worthless if their patterns have drifted out of
   * matching what they describe. This is the same guard-the-guard the
   * ticker checks in `tests/exchange-assets.test.tsx` carry, and for the
   * same reason: a regex that matches nothing passes forever.
   */
  it("would catch each of those shapes if it came back", () => {
    const rail = code(`const DEFAULT = { methods: ["M-Pesa Kenya (Safaricom)"] };`);
    expect(RAIL_NAMES.some((r) => new RegExp(`["'][^"'\\n]*\\b${r}\\b`).test(rail))).toBe(true);
    // And not from a comment quoting the mistake.
    expect(
      RAIL_NAMES.some((r) =>
        new RegExp(`["'][^"'\\n]*\\b${r}\\b`).test(code(`// was ["M-Pesa Kenya (Safaricom)"]`)),
      ),
    ).toBe(false);

    const currencies = `const C = [${Array.from({ length: 20 }, (_, i) => `"C${String.fromCharCode(65 + (i % 26))}X"`).join(", ")}];`;
    expect(
      arrayLiterals(code(currencies)).some(
        (l) => stringsIn(l).filter((s) => CURRENCY_SHAPED.test(s)).length >= 20,
      ),
    ).toBe(true);

    const countries = `const K = [${Array.from({ length: 20 }, (_, i) => `"A${String.fromCharCode(65 + i)}"`).join(", ")}];`;
    expect(
      arrayLiterals(code(countries)).some(
        (l) => stringsIn(l).filter((s) => COUNTRY_SHAPED.test(s)).length >= 20,
      ),
    ).toBe(true);

    const mints = `const M = ["So11111111111111111111111111111111111111112", "SK1JEbfsjjTG2WELNirmM7iJVcdnwerqfF32kCnoWsM"];`;
    expect(
      arrayLiterals(code(mints)).some(
        (l) => stringsIn(l).filter((s) => MINT_SHAPED.test(s)).length >= 2,
      ),
    ).toBe(true);
  });
});
