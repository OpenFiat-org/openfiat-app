import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import {
  NATIVE_SOL_TRADING_LABEL,
  isNativeSolMintAddress,
  tradingSymbol,
} from "@/lib/asset-display";

// The boundary copy moved into the message catalogue when the wallet was
// localized; these guards now assert it is still wired (the component reads
// the key) and still says the load-bearing thing (the English source string).
const wallet = (en as { wallet: Record<string, string> }).wallet;
import { assetLabel } from "@/lib/live-advertisements";
import { nameForMint, type ReferenceMint } from "@/lib/live-vaults";
import { WRAPPED_SOL_MINT } from "@/lib/vault-instructions";

/**
 * The interface showed users `wSOL`, and the fix for that has a trap in it.
 *
 * Native SOL pays transaction fees; wrapped SOL does not. Relabel a wrapped
 * balance `SOL` and a user reads it as their gas, sends a transaction that
 * cannot pay for itself, and has nothing on screen to diagnose it with. So
 * the substitution is deliberately partial, and what is pinned here is the
 * boundary rather than the rename:
 *
 * - on a trading surface, `SOL`, because the wrap and the unwrap happen
 *   inside the transaction and a trader never chooses to hold the wrapped
 *   form;
 * - in the node's mint table, `wSOL`, unchanged, because that symbol is a
 *   matching identity — `fetchBook` and the pair page compare against it;
 * - on a balance, `wSOL` with native SOL stated separately, because there
 *   the number really is a token account and really is not gas.
 */

const NODE_MINTS: ReferenceMint[] = [
  { mint: WRAPPED_SOL_MINT.toBase58(), symbol: "wSOL", decimals: 9 },
  { mint: "2bHPi5hA4zrmPAfrvLmEexg3KJjpTjNkUcxWnzUPeRRU", symbol: "USDC", decimals: 6 },
];

const UNNAMED = "J2DNkV3tjn96SpYNnJTAzVi9JUhgLFHfYHMWSFDfkdKs";

describe("naming the native mint where it is traded", () => {
  it("reads SOL, which is what a trader actually hands over", () => {
    expect(tradingSymbol(WRAPPED_SOL_MINT.toBase58(), "wSOL")).toBe("SOL");
    expect(NATIVE_SOL_TRADING_LABEL).toBe("SOL");
    expect(assetLabel({ assetMint: WRAPPED_SOL_MINT.toBase58(), assetSymbol: "wSOL" })).toBe("SOL");
  });

  /*
   * The address is the evidence, not the symbol. A node that answered
   * something else for this mint — or nothing at all — does not change what
   * the SPL Token program says the native mint is.
   */
  it("goes by the address, not by the name the node happened to return", () => {
    expect(tradingSymbol(WRAPPED_SOL_MINT.toBase58(), null)).toBe("SOL");
    expect(tradingSymbol(WRAPPED_SOL_MINT.toBase58(), "SOMETHING ELSE")).toBe("SOL");
    expect(isNativeSolMintAddress(WRAPPED_SOL_MINT.toBase58())).toBe(true);
  });

  /*
   * The regression that would turn this into the thing this repo keeps
   * deleting: a second entry. One mint is defensible because the SPL Token
   * program defines it; a second is a phrasebook, and a phrasebook here
   * disagrees with the node the first time governance allowlists anything.
   */
  it("renames exactly one mint and passes everything else straight through", () => {
    expect(tradingSymbol(NODE_MINTS[1]!.mint, "USDC")).toBe("USDC");
    expect(tradingSymbol(NODE_MINTS[1]!.mint, "tUSDC")).toBe("tUSDC");
    // `null` in, `null` out. A mint nobody named stays unnamed; this never
    // invents a name, it only substitutes one.
    expect(tradingSymbol(UNNAMED, null)).toBeNull();
    expect(assetLabel({ assetMint: UNNAMED, assetSymbol: null })).toBe(UNNAMED);
  });

  /*
   * Source-level, because the failure is a new `case` or a new key rather
   * than a wrong return value, and a value test cannot see one arriving.
   * The module may hold exactly one mint reference, and it must be the
   * imported constant rather than a base58 literal — `So111…112` is an
   * address a transposed character in still looks right.
   */
  it("holds no mint literal of its own", () => {
    const source = readFileSync("lib/asset-display.ts", "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(code.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/g) ?? []).toEqual([]);
  });
});

describe("the boundary the rename must not cross", () => {
  /*
   * `nameForMint` feeds the wallet's balance table and the explorer, and it
   * is also what `tests/mint-naming.test.ts` pins as having no fallback
   * phrasebook. It must keep answering the node's word.
   */
  it("leaves the node's mint table alone", () => {
    expect(nameForMint(WRAPPED_SOL_MINT, NODE_MINTS)).toEqual({ kind: "named", symbol: "wSOL" });
  });

  /*
   * The one that costs money if it is ever "tidied up". A balance table
   * showing `SOL` over a wrapped position is the interface telling somebody
   * they can pay for a transaction with something that cannot pay for one.
   */
  it("keeps wSOL on the wallet's balance rows, with native SOL stated apart", () => {
    const source = readFileSync("components/wallet/balances-panel.tsx", "utf8");

    // The rows still name mints through the node.
    expect(source).toContain("nameForMint(b.mint, mints)");
    // And native SOL has a row of its own, labelled for what it is for.
    expect(source).toContain("NATIVE_SOL_TRADING_LABEL");
    expect(source).toContain("nativeSolNote");
    expect(wallet.nativeSolNote).toMatch(/pays transaction fees/);
    // A wrapped position says it is not the fee balance.
    expect(source).toMatch(/isWrappedSol\(b\.mint\)/);
  });

  /*
   * A merchant's liquidity vault is on the trading side of the line: it is
   * funded with plain SOL and paid out as plain SOL, because the deposit
   * and the withdrawal each wrap and unwrap inside their own transaction.
   * The vaults panel still says what the vault is *held* as underneath,
   * which is the sentence that makes the two consistent rather than
   * contradictory.
   */
  it("calls a vault denominated in the native mint SOL, and says what it holds", () => {
    const vaults = readFileSync("components/wallet/vaults-panel.tsx", "utf8");
    expect(vaults).toContain("tradingSymbol(v.mint.toBase58(), naming.symbol)");
    expect(vaults).toContain("heldAsWrapped");
    expect(wallet.heldAsWrapped).toMatch(/Held as wrapped SOL/);

    // The withdraw form's vault picker, for the same reason: what it pays
    // out is SOL.
    const withdraw = readFileSync("components/wallet/withdraw-form.tsx", "utf8");
    expect(withdraw).toContain("tradingSymbol(v.mint.toBase58(), naming.symbol)");
  });

  /*
   * The explorer is on the other side of it. A token account there is a
   * fact about an address on chain, and the mint it holds is wSOL — the
   * page is for checking what is really there, so it says what is really
   * there.
   */
  it("leaves the explorer's account view on the node's name", () => {
    const explorer = readFileSync("components/explorer/address-onchain.tsx", "utf8");
    expect(explorer).not.toContain("tradingSymbol");
  });

  /*
   * Both sides of every book filter have to be the node's spelling. If one
   * of these ever reads a display name the market for the native mint goes
   * silently empty — an advertisement page with no advertisements on it,
   * which reads as "nobody is trading" rather than as a bug.
   */
  it("matches advertisements on the node's symbol, never on the printed name", () => {
    const book = readFileSync("lib/live-advertisements.ts", "utf8");
    expect(book).toContain("ad.assetSymbol === symbol");

    const pairData = readFileSync("app/[locale]/[asset]/[currency]/pair-data.ts", "utf8");
    expect(pairData).toContain("ad.assetSymbol === pair.asset");

    const exchange = readFileSync("components/p2p/exchange.tsx", "utf8");
    expect(exchange).toContain("ad.assetSymbol !== asset");
  });
});
