import { PublicKey } from "@solana/web3.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchMintNames, nameForMint, type ReferenceMint } from "@/lib/live-vaults";
import {
  DEVNET_OPEN_MINT,
  DEVNET_SETTLEMENT_MINT,
  OFFERED_DEVNET_MINTS,
  PROTOCOL_TOKEN_NAME,
} from "@/lib/onchain-config";
import { NATIVE_SOL_FLOW_LABEL } from "@/lib/live-vaults";
import { WRAPPED_SOL_MINT } from "@/lib/vault-instructions";

/**
 * Four screens used to turn a mint address into a name, and they disagreed.
 *
 * `lib/onchain-config.ts` carried a two-entry `KNOWN_DEVNET_MINTS` with a
 * `label` on each, and `mintLabel`, the explorer's private `label()` and the
 * balances panel's inline lookup all read it. So every address outside those
 * two rendered "Unrecognised mint" — wrapped SOL included, a mint this
 * network settles in and holds vaults denominated in — and the one address
 * they did answer for got a different name from the rest of the app: this
 * table said "Devnet settlement stablecoin", the node says `tUSDC`, and
 * `devnet-addresses.json` calls the same address `usdcMint`.
 *
 * `nameForMint` is now the only place an address becomes a name, and the
 * node is the only source. These pin that.
 */

/** The node's devnet answer, verbatim — see `crates/chain/src/mints.rs`. */
const NODE_MINTS: ReferenceMint[] = [
  { mint: "So11111111111111111111111111111111111111112", symbol: "wSOL", decimals: 9 },
  { mint: "2bHPi5hA4zrmPAfrvLmEexg3KJjpTjNkUcxWnzUPeRRU", symbol: "USDC", decimals: 6 },
  { mint: "C4rSGhdxWhSFQuFcAxQti1JvBxriwHJoHtJjfhs5p24Y", symbol: "USDT", decimals: 6 },
  { mint: DEVNET_SETTLEMENT_MINT, symbol: "tUSDC", decimals: 6 },
];

const UNNAMED = new PublicKey("J2DNkV3tjn96SpYNnJTAzVi9JUhgLFHfYHMWSFDfkdKs");

afterEach(() => vi.unstubAllGlobals());

describe("naming a mint", () => {
  it("takes the node's name, including for the mint this app used to name itself", () => {
    // The whole disagreement, in one assertion. This address is the escrow
    // fee treasuries' settlement mint; the app called it "Devnet settlement
    // stablecoin" and the node calls it tUSDC.
    expect(nameForMint(new PublicKey(DEVNET_SETTLEMENT_MINT), NODE_MINTS)).toEqual({
      kind: "named",
      symbol: "tUSDC",
    });
  });

  it("names wrapped SOL, which every screen used to call unrecognised", () => {
    expect(nameForMint(WRAPPED_SOL_MINT, NODE_MINTS)).toEqual({ kind: "named", symbol: "wSOL" });
  });

  it("says a mint is unnamed rather than guessing at it", () => {
    // Not "Unrecognised mint", which reads as a finding about the token.
    // The caller shows the address.
    expect(nameForMint(UNNAMED, NODE_MINTS)).toEqual({ kind: "unnamed" });
  });

  /*
   * The distinction the old `{ name, known }` shape could not carry, and the
   * one that decides whether a screen accuses a merchant's token of being
   * unrecognised because this app could not reach a node.
   */
  it("tells a node that has no name apart from a node that was never asked", () => {
    expect(nameForMint(UNNAMED, NODE_MINTS).kind).toBe("unnamed");
    expect(nameForMint(UNNAMED, null).kind).toBe("unasked");
    expect(nameForMint(UNNAMED, undefined).kind).toBe("asking");
  });

  it("never claims a name for a mint the node answered about and did not name", () => {
    // Belt and braces on the property that matters: no code path returns
    // `named` for an address absent from the node's answer.
    for (const mints of [NODE_MINTS, [], null, undefined]) {
      const naming = nameForMint(UNNAMED, mints);
      expect(naming.kind === "named").toBe(false);
    }
  });

  /*
   * The regression that would undo this whole change quietly, and the one
   * the tests above did not catch when I tried it: a fallback for "just the
   * few we know", added later by someone reasonably wanting wSOL to keep its
   * name against a node that has not got it yet. That is the app becoming
   * the authority again at exactly the moment nobody can check, and it is
   * how the four disagreeing tables grew in the first place.
   *
   * So the mints this app has constants for are pinned as *unnamed* when the
   * node's answer omits them. There is no local phrasebook, not even a
   * short one.
   */
  it("has no fallback table, not even for the mints it holds constants for", () => {
    const nodeNamesNothing: ReferenceMint[] = [];
    for (const address of [
      WRAPPED_SOL_MINT.toBase58(),
      DEVNET_SETTLEMENT_MINT,
      DEVNET_OPEN_MINT,
    ]) {
      expect(nameForMint(new PublicKey(address), nodeNamesNothing)).toEqual({ kind: "unnamed" });
    }
  });
});

describe("reading the phrasebook", () => {
  function nodeReturning(result: unknown, { reachable = true } = {}) {
    vi.stubGlobal("fetch", async () => {
      if (!reachable) throw new Error("offline");
      return { ok: true, status: 200, json: async () => ({ jsonrpc: "2.0", id: 1, result }) };
    });
  }

  it("returns the mints a node answered with", async () => {
    nodeReturning({ mints: NODE_MINTS });
    expect(await fetchMintNames("http://node")).toEqual(NODE_MINTS);
  });

  /*
   * Both silences arrive as `null`, and neither may throw: the screens that
   * call this read their balances from Solana, and losing the names must not
   * cost a reader the figures.
   */
  it("answers null rather than throwing when it cannot read them", async () => {
    nodeReturning(null, { reachable: false });
    expect(await fetchMintNames("http://node")).toBeNull();

    // A node built before the mint table omits the section entirely.
    nodeReturning({ currencies: [], countries: [] });
    expect(await fetchMintNames("http://node")).toBeNull();
  });
});

describe("the two names this app still says itself", () => {
  /*
   * Both are bare constants rather than labels on an address-keyed record —
   * `tests/exchange-assets.test.tsx` refuses that shape now — and both have
   * a reason the node cannot supply.
   */
  it("offers wrapped SOL as SOL, because that is what you hand over", () => {
    // A statement about the deposit flow, not about the mint. The node says
    // wSOL and the vaults panel says "held as wrapped SOL"; all three are
    // true at once and someone will eventually try to make them agree.
    expect(NATIVE_SOL_FLOW_LABEL).toBe("SOL");
    expect(nameForMint(WRAPPED_SOL_MINT, NODE_MINTS)).toEqual({ kind: "named", symbol: "wSOL" });
  });

  it("names OPEN itself, because the node deliberately never will", () => {
    // `openfiat_chain::mints` has a test asserting OPEN never appears in the
    // node's table: that table is a phrasebook of settlement mints, and the
    // escrow program holds OPEN off the allowlist until the public sale. Its
    // absence is correct and will not change when governance next updates.
    expect(PROTOCOL_TOKEN_NAME).toBe("OPEN");
    expect(NODE_MINTS.some((m) => m.mint === DEVNET_OPEN_MINT)).toBe(false);
    expect(nameForMint(new PublicKey(DEVNET_OPEN_MINT), NODE_MINTS)).toEqual({ kind: "unnamed" });
  });

  it("keeps a name off the records the picker is built from", () => {
    // The shape that went wrong. These carry what the node cannot say —
    // `note`, `obtainable`, `decimals` — and nothing that can disagree with
    // it. Asserted on the values, not just by the source-level guard.
    for (const offered of OFFERED_DEVNET_MINTS) {
      expect(offered).not.toHaveProperty("label");
      expect(offered).not.toHaveProperty("symbol");
      expect(offered).not.toHaveProperty("name");
      expect(typeof offered.note).toBe("string");
    }
  });
});
