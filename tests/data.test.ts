import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COUNTRIES,
  COUNTRIES_BY_SLUG,
  countriesByCurrency,
  currenciesFor,
  getCountry,
  searchCountries,
} from "@/lib/data/countries";
import { CATEGORY_RULES, PROPOSAL_STAKE_DEPOSIT_OPEN } from "@/lib/governance";
import { connectableNodes, defaultNode, resolveNodeSelection } from "@/lib/node-preference";
import { STAKING_ROLES, roleByKey, unbondingLabel } from "@/lib/staking-roles";
import { OPEN_PRICE_USDC, PRESALE_BUCKET_OPEN, PUBLIC_SALE_PRICE_USDC, SALE_PHASES } from "@/lib/sale-terms";
import qr from "qrcode-generator";
import { normalisePair } from "@/lib/pairs";

describe("countries registry", () => {
  it("has global coverage (~250 entries)", () => {
    expect(COUNTRIES.length).toBeGreaterThanOrEqual(240);
  });

  it("every entry has code, name, slug, flag, and currency fields", () => {
    for (const c of COUNTRIES) {
      expect(c.code).toMatch(/^[A-Z0-9]{2,}$/);
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.slug).toMatch(/^[a-z0-9-]+$/);
      expect(c.flag.length).toBeGreaterThan(0);
      expect(c.flag).toMatch(/[\u{1F1E6}-\u{1F1FF}]/u);
      expect(c.currencyCode).toMatch(/^[A-Z]{3,4}$/);
      expect(c.currencyName.length).toBeGreaterThan(0);
      expect(c.currencySymbol.length).toBeGreaterThan(0);
    }
  });

  it("codes and slugs are unique", () => {
    expect(new Set(COUNTRIES.map((c) => c.code)).size).toBe(COUNTRIES.length);
    expect(new Set(COUNTRIES.map((c) => c.slug)).size).toBe(COUNTRIES.length);
  });

  it("partially-recognized states are present and marked isRecognized: false", () => {
    for (const slug of ["palestine", "kosovo", "vatican-city", "western-sahara", "somaliland", "transnistria"]) {
      const c = COUNTRIES_BY_SLUG.get(slug);
      expect(c, slug).toBeDefined();
      expect(c!.isRecognized).toBe(false);
    }
  });

  it("Taiwan is listed, on the same footing as Hong Kong and Macau", () => {
    // This assertion previously required Taiwan to be absent. It is listed now
    // on an explicit product decision. `isRecognized: false` records
    // non-UN-membership and nothing else — the same value Hong Kong and Macau
    // carry — and the flag is never used to hide or relabel an entry.
    const tw = COUNTRIES_BY_SLUG.get("taiwan");
    expect(tw).toBeDefined();
    expect(tw!.currencyCode).toBe("TWD");
    expect(tw!.isRecognized).toBe(false);
    expect(COUNTRIES_BY_SLUG.get("hong-kong")?.isRecognized).toBe(false);
  });

  /*
   * Two tests here asserted that Taiwan, Hong Kong and Macau had local
   * payment rails, against `paymentMethodsForCurrency` in `lib/data/ads.ts`.
   * That map is gone: which rails a currency's merchants take is a fact
   * about the advertisement book, and the country pages read it from there.
   * What this table is still the authority for — that these territories are
   * listed at all, with their own currencies and slugs — is asserted above.
   */
  it("records countries that trade in more than one currency", () => {
    // A single currencyCode per country is wrong where it matters most: in a
    // dollarised economy the USD leg is often the larger P2P market, and
    // offering only the local currency hides it.
    for (const slug of ["zimbabwe", "lebanon", "cambodia", "panama"]) {
      const c = COUNTRIES_BY_SLUG.get(slug);
      expect(c, slug).toBeDefined();
      expect(c?.altCurrencies, slug).toContain("USD");
      expect(currenciesFor(c!)[0], slug).toBe(c!.currencyCode);
      expect(currenciesFor(c!).length, slug).toBeGreaterThan(1);
    }
    // Palestine's entry noted "JOD also used" in prose with nowhere structured
    // to put it.
    expect(COUNTRIES_BY_SLUG.get("palestine")?.altCurrencies).toContain("JOD");
  });

  it("never repeats a country's primary currency in its alternates", () => {
    for (const c of COUNTRIES) {
      const all = currenciesFor(c);
      expect(new Set(all).size, c.name).toBe(all.length);
    }
  });

  it("lookups work", () => {
    expect(getCountry("KE")?.name).toBe("Kenya");
    expect(getCountry("ke")?.currencyCode).toBe("KES");
    expect(countriesByCurrency("EUR").some((c) => c.name === "Germany")).toBe(true);
    expect(countriesByCurrency("EUR").some((c) => c.name === "Kosovo")).toBe(true);
    expect(searchCountries("kenya").some((c) => c.code === "KE")).toBe(true);
    expect(searchCountries("KES").some((c) => c.code === "KE")).toBe(true);
    expect(searchCountries("palestine")[0]?.slug).toBe("palestine");
  });
});

describe("pair landing pages", () => {
  /*
   * `PAIRS` — a constant crossing a markets fixture with fifteen hand-written
   * exchange rates — used to decide which pairs existed, and the tests here
   * asserted properties of it. Both are gone: which pairs are priced is a
   * question only an oracle answers, and on devnet a publish lasts three
   * hours, so nothing fixed at build time can be right about it. See
   * `tests/live-oracle.test.ts` for the rate rules, and `lib/live-oracle.ts`
   * for why the set is read rather than declared.
   *
   * A `PAIR_ASSETS` constant outlived that clean-up and has now gone the same
   * way, for the same reason one layer down: it decided which *tokens*
   * existed. So these no longer assert against a list in the repo. They stub
   * the node's `getReferenceData` and assert that the app takes its answer —
   * including the two spellings that made the old constant wrong, `wSOL` for
   * the mint it called `SOL` and `tUSDC` for one it had never heard of.
   */
  const NAMED = ["wSOL", "USDC", "USDT", "tUSDC"];

  /** A node that answers `getReferenceData` with `mints`, as the real one does. */
  function nodeNaming(symbols: string[] | undefined) {
    vi.stubGlobal("fetch", () =>
      Promise.resolve({
        json: () =>
          Promise.resolve({
            result: { mints: symbols?.map((symbol) => ({ mint: `mint-${symbol}`, symbol })) },
          }),
      }),
    );
  }

  beforeEach(() => nodeNaming(NAMED));
  afterEach(() => vi.unstubAllGlobals());

  it("accepts the pairs people actually search for", async () => {
    for (const slug of ["usdt/kes", "usdc/kes", "usdt/ngn", "usdc/ngn"]) {
      const [asset, currency] = slug.split("/");
      expect((await normalisePair(asset!, currency!))?.slug, slug).toBe(slug);
    }
  });

  it("canonicalises case so one pair has one page", async () => {
    expect((await normalisePair("USDT", "KES"))?.slug).toBe("usdt/kes");
    expect((await normalisePair("Usdt", "Kes"))?.slug).toBe("usdt/kes");
  });

  /*
   * The defect this rewrite exists for. The node names the wrapped-SOL mint
   * `wSOL`, and the pair page matches advertisements on the symbol the node
   * resolved — so the old `"SOL"` entry produced a page that could never
   * match one, and `/wsol/kes` 404'd instead. The URL is still spelled
   * however the visitor typed it; the *pair* carries the node's spelling, so
   * the heading and the book filter both use the name the network uses.
   */
  it("resolves a ticker to the node's own spelling of it", async () => {
    expect(await normalisePair("wsol", "kes")).toMatchObject({ asset: "wSOL", slug: "wsol/kes" });
    expect(await normalisePair("WSOL", "kes")).toMatchObject({ asset: "wSOL" });
    expect(await normalisePair("tusdc", "ngn")).toMatchObject({ asset: "tUSDC" });
  });

  /*
   * The other half of the same defect. `USD1` and `SOL` were in the app's
   * constant and name no mint on this deployment, so both were pages about
   * tokens nobody can be paid in — `/usd1/kes` down to rendering a USD1 coin
   * mark. A ticker the node does not answer for is not a pair.
   */
  it("refuses a ticker no node named, however plausible it sounds", async () => {
    expect(await normalisePair("usd1", "kes")).toBeNull();
    expect(await normalisePair("sol", "kes")).toBeNull();
  });

  /*
   * `/[asset]/[currency]` sits at the root, so it would otherwise swallow any
   * two-segment URL and render a pair page about nothing. Junk is rejected on
   * shape before the node is asked — which is also the only gate left when
   * the node cannot be reached.
   */
  it("rejects a URL that is not a pair rather than rendering an empty page", async () => {
    expect(await normalisePair("nope", "kes")).toBeNull();
    expect(await normalisePair("some", "thing")).toBeNull();
    expect(await normalisePair("usdt", "toolongcode")).toBeNull();
  });

  /*
   * A currency this app has never heard of must still resolve: an oracle can
   * start publishing a corridor without anyone editing a table here, and
   * 404ing it would make the app's own list the limit of the network.
   */
  it("accepts a currency it has no country data for", async () => {
    expect((await normalisePair("usdt", "xaf"))?.slug).toBe("usdt/xaf");
  });

  /*
   * Silence is not evidence. A 404 is this app stating "there is no such
   * asset", and it has no grounds to state that because a node did not
   * answer — failing that way would 404 every legitimate pair page for the
   * duration of an outage. A node too old to publish the table is the same
   * case: `mints` absent is silence, not an empty list.
   */
  it("still resolves a pair when the node cannot be asked", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new Error("offline")));
    expect(await normalisePair("usdt", "kes")).toMatchObject({ asset: "USDT", slug: "usdt/kes" });

    nodeNaming(undefined);
    expect(await normalisePair("usdt", "kes")).toMatchObject({ asset: "USDT" });
  });

  /*
   * The reverse, and the reason `null` and `[]` are kept apart: a node that
   * answered and named nothing has told us something, and every ticker page
   * is then a page about a token it cannot confirm exists.
   */
  it("refuses every ticker when the node answers that it names none", async () => {
    nodeNaming([]);
    expect(await normalisePair("usdt", "kes")).toBeNull();
  });
});

describe("sitemap coverage", () => {
  /*
   * Pair routes are read from a node's oracle index now. Stubbing the call to
   * fail keeps this suite offline and deterministic — `fetchPricedPairs`
   * answers with an empty list rather than throwing, so the hand-written and
   * country-derived halves of the sitemap, which is what these tests are
   * about, are unaffected.
   */
  beforeEach(() => {
    vi.stubGlobal("fetch", () => Promise.reject(new Error("offline")));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists every static page route", async () => {
    // The hand-written half of the sitemap is the part that drifts: four routes
    // were live and unlisted before this test existed.
    const { default: sitemap } = await import("@/app/sitemap");
    const listed = new Set(
      (await sitemap()).map((e) => new URL(e.url).pathname.replace(/\/$/, "") || "/"),
    );
    const staticRoutes = [
      "/",
      "/countries",
      "/open",
      "/guide",
      "/guide/buy",
      "/guide/sell",
      "/guide/merchant",
      "/disputes",
      "/governance",
      "/network",
      "/explorer",
      "/providers",
      "/providers/register",
      "/staking",
      "/staking/stake",
      "/orders",
      "/orders/new",
      "/ads",
      "/ads/new",
      "/wallet",
      "/wallet/deposit",
      "/wallet/withdraw",
      "/account/identity",
      "/account/reputation",
      "/account/counterparties",
      "/settings",
    ];
    for (const route of staticRoutes) {
      expect(listed.has(route), route).toBe(true);
    }
  });

  it("lists every country, and every extra currency it trades in", async () => {
    const { default: sitemap } = await import("@/app/sitemap");
    const listed = new Set((await sitemap()).map((e) => new URL(e.url).pathname));
    for (const c of COUNTRIES) {
      expect(listed.has(`/country/${c.slug}`), c.slug).toBe(true);
      for (const alt of c.altCurrencies ?? []) {
        expect(listed.has(`/country/${c.slug}/${alt.toLowerCase()}`), `${c.slug}/${alt}`).toBe(true);
      }
    }
  });

  it("has no duplicate entries", async () => {
    const { default: sitemap } = await import("@/app/sitemap");
    const urls = (await sitemap()).map((e) => e.url);
    expect(new Set(urls).size).toBe(urls.length);
  });
});

describe("QR encoding", () => {
  it("produces a scannable grid with real finder patterns", () => {
    // The failure mode of a hand-rolled encoder is a code that looks right and
    // does not scan, which is why this uses a library — and why the structure
    // is asserted rather than assumed.
    // A real base58 Solana address, not a generated one. `pseudoAddress`
    // used to supply this: a deterministic fake that also fed the merchant
    // fixture's wallets, so it went when they did. What is being tested is
    // the encoder, and any 44-character payload exercises it.
    const address = "ALLENLMtV1zEAHT3xpVryqcbdPCB8c9JhM1Jdbe5XHg5";
    const code = qr(0, "M");
    code.addData(address);
    code.make();
    const n = code.getModuleCount();
    // A 44-character payload at level M needs more than the smallest version.
    expect(n).toBeGreaterThanOrEqual(25);
    // Finder pattern: a dark 7x7 ring with a light second row inside it.
    expect(code.isDark(0, 0)).toBe(true);
    expect(code.isDark(0, 6)).toBe(true);
    expect(code.isDark(1, 1)).toBe(false);
    // Present in all three corners.
    expect(code.isDark(0, n - 1)).toBe(true);
    expect(code.isDark(n - 1, 0)).toBe(true);
  });
});

describe("access nodes", () => {
  // These used to assert over `NETWORK_NODES`, a fixture of ten invented
  // nodes, and checked things like "the default has the lowest declared
  // latency" — a property of the fixture's own made-up numbers, not of the
  // network. The picker now lists the real cluster, so the properties worth
  // holding are different ones.

  it("offers only nodes with a usable endpoint", () => {
    const nodes = connectableNodes();
    expect(nodes.length).toBeGreaterThan(0);
    for (const n of nodes) {
      expect(n.url, n.id).toMatch(/^https?:\/\//);
      expect(["RpcConnected", "GossipOnly"], n.id).toContain(n.chainMode);
    }
  });

  // An RpcConnected node reads Solana directly; a GossipOnly one learns
  // on-chain facts second-hand and can lag. Defaulting to the connected one
  // means the app's first answers are the current ones.
  it("defaults to an RPC-connected node when the cluster has one", () => {
    const nodes = connectableNodes();
    const node = defaultNode();
    expect(node).toBeDefined();
    if (nodes.some((n) => n.chainMode === "RpcConnected")) {
      expect(node.chainMode).toBe("RpcConnected");
    }
  });

  it("resolves a custom selection to the host the user typed", () => {
    const selection = resolveNodeSelection("custom:my.node.example:9000");
    expect(selection.custom).toBe(true);
    expect(selection.url).toBe("http://my.node.example:9000");
    // Null rather than a guess: the app cannot know whether someone else's
    // node reads Solana directly, and claiming either way would misstate how
    // current its on-chain answers are.
    expect(selection.chainMode).toBeNull();
  });

  // A stale id left in localStorage by an earlier build must not leave the
  // app unable to reach any node at all.
  it("falls back to the default for an unrecognised stored id", () => {
    const selection = resolveNodeSelection("node-ke-full-01");
    expect(selection.id).toBe(defaultNode().id);
    expect(selection.custom).toBe(false);
  });

  /*
   * Several consoles used to gate themselves on `selection.custom`, treating
   * every non-custom selection as a simulated one that could not be queried —
   * which hid the counterparties, earnings and arbitration pages behind "pick
   * a real access node" for everyone who never opened the picker. The state
   * they were testing for cannot occur: whatever is stored, resolution yields
   * a selection whose `url` is somewhere a request can actually go.
   *
   * `id` is emphatically not that field. For a custom node it is
   * `custom:<host>`, so the one path those consoles did allow built
   * `http://custom:host` and could not have worked either.
   */
  it("resolves every stored value to a requestable url", () => {
    const stored = [
      null,
      "",
      "devnet-public",
      "node-ke-full-01",
      "custom:my.node.example:9000",
      "custom:https://node.example",
    ];
    for (const raw of stored) {
      const selection = resolveNodeSelection(raw);
      expect(selection.url, String(raw)).toMatch(/^https?:\/\/[^/]+/);
      expect(selection.url, String(raw)).not.toContain("custom:");
    }
  });
});

/*
 * The "liquidity vaults" suite that stood here asserted
 * `available + reserved + settled === total` over a fixture. That is not the
 * escrow program's invariant — on chain, `settled` counts tokens that have
 * already left the vault, so adding it back to a spendable balance
 * double-counts money that is gone, and `total` is only ever moved by
 * deposits and withdrawals. The test passed because the fixture had been
 * written to satisfy it.
 *
 * Vault decoding is now covered by `tests/onchain-decode.test.ts` against
 * hand-built account bytes, and the counters' real behaviour by
 * `scripts/prove-devnet-vault-deposit-withdraw.ts` against devnet.
 */


describe("staking roles", () => {
  /*
   * This block used to assert the fixture's minimums — 1,000 merchant,
   * 10,000 arbitrator — with a comment insisting they "must match the
   * deployed StakingConfig on devnet, because the stake form submits against
   * that program". They did not match: the live config holds 500 for both.
   * The test passed for as long as it did precisely because it checked the
   * repository's copy against itself.
   *
   * So there are no figures here at all now. `lib/staking-roles.ts` carries
   * only the vocabulary; every number comes from the chain and is asserted
   * against hand-built account bytes in `tests/onchain-decode.test.ts`.
   */
  it("gives every on-chain Role exactly one row", () => {
    // `StakeAccount` is keyed by (owner, role), so a UI bucket standing in
    // for several roles opens the wrong account. The fixture had one
    // "Service Provider" row mapped to NotificationProvider, covering four
    // distinct roles with four different minimums.
    const discriminants = STAKING_ROLES.map((r) => r.onchain).sort((a, b) => a - b);
    expect(discriminants).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("keys are unique and URL-safe, and each carries a requirement", () => {
    const keys = STAKING_ROLES.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const role of STAKING_ROLES) {
      expect(role.key).toMatch(/^[a-z-]+$/);
      expect(role.title.length).toBeGreaterThan(0);
      expect(role.requirement.length).toBeGreaterThan(0);
    }
  });

  it("states no minimum bond anywhere in the module", () => {
    // The point of the rewrite, pinned: a governance-updatable on-chain
    // parameter copied into this repository is a copy that goes stale
    // silently and is believed anyway.
    for (const role of STAKING_ROLES) {
      expect(Object.keys(role)).toEqual(["key", "onchain", "title", "requirement"]);
      expect(role.requirement).not.toMatch(/[0-9],?[0-9]{3}\s*OPEN/);
    }
  });

  it("resolves a role by its URL key and refuses an unknown one", () => {
    expect(roleByKey("merchant")?.onchain).toBe(0);
    expect(roleByKey("arbitrator")?.onchain).toBe(1);
    expect(roleByKey("provider")).toBeUndefined();
    expect(roleByKey(undefined)).toBeUndefined();
  });

  it("renders each of the three real unbonding periods distinctly", () => {
    // 86400 / 259200 / 604800 are what the live config holds. One flat
    // "7 days" was printed for all three.
    expect(unbondingLabel(86_400n)).toBe("24 hours");
    expect(unbondingLabel(259_200n)).toBe("3 days");
    expect(unbondingLabel(604_800n)).toBe("7 days");
  });
});

/*
 * The payment-methods block that stood here is gone with the table it
 * tested. `lib/data/payment-methods.ts` was an 84-entry snapshot of the
 * node's own list, kept alive by one synchronous caller — the settings
 * screen's "which rail is this account on" dropdown — and its own doc
 * comment said so and asked that no reader be added. That caller now reads
 * `getReferenceData` like every other picker, so the copy has none.
 *
 * The properties it asserted are asserted where they belong: the alias and
 * search rules in `tests/reference.test.ts`, against the shape the node
 * sends, and the table's own contents (the FPS/Faster Payments distinction,
 * AlipayHK against Alipay) in `crates/rpc/src/methods/reference.rs`.
 */

describe("OPEN sale terms", () => {
  /*
   * These used to assert `PRESALE.raised > PRESALE.target` — a test whose
   * whole content was that an invented fundraising total had been positioned
   * above an invented goal, so the page could show a sale overshooting. The
   * figure and the assertion are both gone. What a sale has raised is a
   * field on the on-chain `SaleConfig`, read by `lib/live-presale.ts`, and
   * there is no account on devnet — so the page says the sale is not open
   * rather than showing a number.
   */
  it("prices the presale at 1 OPEN = 1 USDC", () => {
    // [CONFIRMED] in OFS-4100 §3, and enforced on chain by
    // `open_entitlement_for`, which applies no rate beyond a decimal scale.
    // Any other value here is a number the program would refuse.
    expect(OPEN_PRICE_USDC).toBe(1);
  });

  it("sizes the presale at the whole Community Presale bucket", () => {
    // OFS-4100 §2-3: the bucket is the full 20% of supply, and the presale
    // has no hard cap distinct from it.
    expect(PRESALE_BUCKET_OPEN).toBe(200_000_000);
  });

  it("offers a presale and a public-sale price, with market pricing after", () => {
    const priced = SALE_PHASES.filter((p) => p.priceUsdc !== null);
    expect(priced).toHaveLength(2);
    expect(priced[0]!.priceUsdc).toBe(OPEN_PRICE_USDC);
    expect(priced[1]!.priceUsdc).toBe(PUBLIC_SALE_PRICE_USDC);
  });

  it("carries no status, raised total, cap or contribution limit", () => {
    // Every one of those is a fact about a chain account. A "Live" status
    // written here made `/open` say the sale was open on a cluster where no
    // SaleConfig exists.
    for (const phase of SALE_PHASES) {
      expect(Object.keys(phase)).toEqual(["name", "priceUsdc", "allocation", "note"]);
    }
  });
});

describe("governance rules", () => {
  /*
   * The `PROPOSALS` fixture is gone — six invented OFIPs with invented vote
   * splits and turnout, which `/governance` no longer reads (it reads
   * `lib/live-governance.ts`). What is left is `lib/governance.ts`, which is
   * not data about anybody: it is OFS-4100 §5's rule table, the same for
   * every deployment, and the app derives a proposal's quorum and threshold
   * from its category through it rather than reading per-proposal knobs.
   */
  it("requires a higher bar for Protocol-Upgrade and Constitutional proposals", () => {
    for (const category of ["Protocol-Upgrade", "Constitutional"] as const) {
      expect(CATEGORY_RULES[category].quorumPct).toBe(20);
      expect(CATEGORY_RULES[category].approvalThresholdPct).toBe(66);
    }
    for (const category of ["Informational", "Standards", "Parameter"] as const) {
      expect(CATEGORY_RULES[category].quorumPct).toBe(10);
      expect(CATEGORY_RULES[category].approvalThresholdPct).toBe(50);
    }
    expect(CATEGORY_RULES.Treasury.quorumPct).toBe(10);
    expect(CATEGORY_RULES.Treasury.approvalThresholdPct).toBe(60);
  });

  it("posts the same stake deposit for every proposal", () => {
    expect(PROPOSAL_STAKE_DEPOSIT_OPEN).toBe(5000);
  });
});

/*
 * A "reputation tiers" block used to assert that every tier in
 * `lib/tiers.ts` had a ring and a badge colour. There are no tiers: the
 * protocol defines none, `ReputationProfile::tier()` is a method whose
 * thresholds the crate marks as placeholders and which `getReputation` never
 * serializes, and the ladder this app drew — Explorer through Institutional
 * — was its own invention. The module, the badge and the ring are gone with
 * the merchant fixture that fed them.
 */
