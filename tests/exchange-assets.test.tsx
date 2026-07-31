import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The currency picker is not what these tests are about, and it reads a
 * separate reference-data call of its own. Stubbed so a change to it cannot
 * turn an asset-pill test red, and so this file makes exactly the two
 * requests it is asserting on.
 */
vi.mock("@/components/p2p/currency-combobox", () => ({
  CurrencyCombobox: () => null,
}));

const { P2PExchange } = await import("@/components/p2p/exchange");

/**
 * The exchange's asset pills used to be a constant in the component:
 * `["USDT", "USDC", "USD1", "SOL"]`. The book beneath them is filtered by
 * comparing a pill to the symbol the NODE resolved for each advertisement's
 * mint, so two of those four could never match anything — the node calls the
 * wrapped-SOL mint `wSOL`, and no mint on this deployment is called `USD1` —
 * while `wSOL` and `tUSDC`, names the node does answer, had no pill and so no
 * reachable book.
 *
 * These render the real component against a stubbed node and assert it takes
 * the node's answer. A pill list that happens to look right is not the
 * property under test; a pill list that came from anywhere else is the bug.
 */

/** The node's devnet mint table, spellings included — see `crates/chain/src/mints.rs`. */
const NAMED = ["wSOL", "USDC", "USDT", "tUSDC"];

function advertisement(id: string, symbol: string | null, mint: string) {
  const amount = (base_units: number) => ({ base_units, decimals: 6 });
  return {
    id,
    merchant: "merchant".padEnd(44, "x"),
    asset_mint: mint,
    asset_symbol: symbol,
    fiat_currency: "USD",
    direction: "Sell",
    status: "Active",
    pricing: { Fixed: { price: amount(129_000_000) } },
    quote: { kind: "Fixed", price: amount(129_000_000) },
    min_trade: amount(1_000_000),
    max_trade: amount(100_000_000),
    available_liquidity: amount(100_000_000),
    payment_methods: ["Mobile Money"],
  };
}

const BOOK = [
  advertisement("ad-usdc", "USDC", "2bHPi5hA4zrmPAfrvLmEexg3KJjpTjNkUcxWnzUPeRRU"),
  advertisement("ad-wsol", "wSOL", "So11111111111111111111111111111111111111112"),
  // A mint no node has a name for. It belongs to no ticker market, because
  // nothing names it — but it is still part of the book.
  advertisement("ad-unnamed", null, "J2DNkV3tjn96SpYNnJTAzVi9JUhgLFHfYHMWSFDfkdKs"),
];

function jsonRpc(result: unknown) {
  const body = { jsonrpc: "2.0", id: 1, result };
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/**
 * One node answering both calls the exchange makes, routed on the JSON-RPC
 * method so the pills and the book cannot accidentally be served the same
 * payload. `mints: undefined` is a node too old to publish the table, which
 * is silence rather than an empty answer.
 */
function nodeAnswering(mints: string[] | undefined, { reachable = true } = {}) {
  vi.stubGlobal("fetch", async (_url: string, init?: { body?: string }) => {
    const { method } = JSON.parse(init?.body ?? "{}") as { method?: string };
    if (method === "getReferenceData") {
      if (!reachable) throw new Error("offline");
      return jsonRpc({ mints: mints?.map((symbol) => ({ mint: `mint-${symbol}`, symbol })) });
    }
    return jsonRpc({ advertisements: BOOK, total: BOOK.length });
  });
}

let container: HTMLDivElement;
let root: Root;

/** Mounts the exchange and lets both of its reads settle. */
async function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(<P2PExchange showHeading={false} />);
  });
  // A second flush: the pill list and the book are separate requests, and
  // the pills are what the first one produces.
  await act(async () => {});
}

/** The asset filter buttons, in order, as a reader sees them. */
function pills(): string[] {
  return [...container.querySelectorAll("button[aria-pressed]")].map((b) =>
    (b.textContent ?? "").trim(),
  );
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
});

describe("the exchange's asset pills", () => {
  it("are the names the node answered, in the node's own spelling", async () => {
    nodeAnswering(NAMED);
    await mount();
    // `wSOL` and `tUSDC` are present and correctly cased. Neither had a pill
    // before, and neither survives being upper-cased on the way into the
    // book filter, which compares against the node's spelling exactly.
    expect(pills()).toEqual(["All assets", ...NAMED]);
  });

  it("offers no pill for a ticker no node named, however familiar it sounds", async () => {
    nodeAnswering(NAMED);
    await mount();
    // The two the old constant declared. `SOL` was a filter for a name
    // nothing answers to; `USD1` names no mint on this deployment at all.
    expect(pills()).not.toContain("SOL");
    expect(pills()).not.toContain("USD1");
  });

  it("filters the book to the pill, and shows the whole book when none is chosen", async () => {
    nodeAnswering(NAMED);
    await mount();

    // No pill chosen: everything, including the advertisement in a mint the
    // node cannot name. That ad belongs to no ticker market and must still
    // be reachable, because it is a real offer.
    expect(container.querySelectorAll("tbody tr").length).toBe(BOOK.length);

    const usdc = [...container.querySelectorAll("button[aria-pressed]")].find(
      (b) => b.textContent?.trim() === "USDC",
    )!;
    await act(async () => usdc.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const rows = [...container.querySelectorAll("tbody tr")];
    expect(rows.length).toBe(1);
    // The surviving row is the USDC one, identified by the mint it carries
    // rather than by the name beside it — the mint is the identity, and it
    // is what `AssetLabel` puts in `title` on every row.
    expect(rows[0]!.innerHTML).toContain("2bHPi5hA4zrmPAfrvLmEexg3KJjpTjNkUcxWnzUPeRRU");
    expect(rows[0]!.innerHTML).not.toContain("So11111111111111111111111111111111111111112");
  });

  /*
   * Silence is not an answer. A node that could not be asked — unreachable,
   * or a build from before it published its mint table — tells us nothing
   * about which assets are traded, so the book must not be filtered down to
   * an empty one and the interface must not say there are none.
   */
  it("leaves the book unfiltered, and says why, when the node cannot be asked", async () => {
    nodeAnswering(undefined, { reachable: false });
    await mount();

    expect(pills()).toEqual(["All assets"]);
    expect(container.textContent).toContain("Could not ask this node which assets it names");
    // The claim it must never make on the strength of a failed request.
    expect(container.textContent).not.toContain("This node names no assets");
    // And the book is still there, in full.
    expect(container.querySelectorAll("tbody tr").length).toBe(BOOK.length);
  });

  it("treats a node too old to publish the table as silence, not as an empty answer", async () => {
    nodeAnswering(undefined);
    await mount();
    expect(container.textContent).toContain("Could not ask this node which assets it names");
  });

  /*
   * The other empty answer, which is a finding rather than a failure: the
   * node answered and named nothing. Same unfiltered book, different
   * sentence, because the two send a reader in different directions.
   */
  it("distinguishes a node that names nothing from one that could not be asked", async () => {
    nodeAnswering([]);
    await mount();

    expect(pills()).toEqual(["All assets"]);
    expect(container.textContent).toContain("This node names no assets");
    expect(container.textContent).not.toContain("Could not ask this node");
  });
});

/*
 * The rendering above can be right while the next screen declares its own
 * four tickers — which is exactly how this defect survived the change that
 * took ticker fields out of the protocol records. `lib/pairs.ts` kept a
 * `PAIR_ASSETS` constant and `components/p2p/exchange.tsx` kept
 * `TRADED_ASSETS`, both plausible-looking, both wrong in the same two
 * entries, and neither noticed for a release.
 *
 * So the property is checked in the source as well: no module declares a
 * list of asset tickers. The node names mints; nothing in this app does.
 */
const ROOTS = ["app", "components", "lib"];

/**
 * Exempt, with reasons, because both answer to a different authority:
 *
 * - `lib/data/**` is the retired fixture layer. Its tables are sample data
 *   for screens not yet cut over to live reads, not claims about which
 *   mints this deployment settles.
 * - the faucet is a separate, non-protocol service (`openfiat-faucet`), and
 *   `FaucetAssetSymbol` is that service's request vocabulary. "SOL" there is
 *   native SOL and not a mint at all, and it dispenses OPEN, which the
 *   escrow program deliberately does not settle. Making it agree with the
 *   node's mint table would be wrong, not right.
 */
const NOT_THIS_APPS_TO_NAME = [join("lib", "data"), join("components", "faucet"), "faucet-client"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

/**
 * Comments are stripped first. Every module that got this wrong now carries
 * a paragraph quoting the list it used to declare, and a check that cannot
 * tell prose from code would flag the explanation as the offence.
 */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/** An array literal of two or more quoted, ticker-shaped, upper-case names. */
const TICKER_LIST = /\[\s*"(?:USD|SOL|BTC|ETH)[A-Z0-9]*"\s*,\s*"[A-Z0-9]{2,10}"/;

describe("asset tickers", () => {
  it("are never declared as a list in this app", () => {
    const offenders = ROOTS.flatMap(sourceFiles)
      .filter((path) => !NOT_THIS_APPS_TO_NAME.some((exempt) => path.includes(exempt)))
      .filter((path) => TICKER_LIST.test(code(readFileSync(path, "utf8"))));
    expect(offenders).toEqual([]);
  });

  /** The check is worthless if its own pattern has drifted out of matching. */
  it("would be caught by this check if one came back", () => {
    expect(TICKER_LIST.test(code(`const TRADED = ["USDT", "USDC", "USD1", "SOL"];`))).toBe(true);
    expect(TICKER_LIST.test(code(`// const TRADED = ["USDT", "USDC"];`))).toBe(false);
  });
});
