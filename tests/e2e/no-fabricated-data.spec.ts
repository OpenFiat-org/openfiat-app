import { test, expect } from "@playwright/test";

/**
 * The routes that used to render fixtures, driven in a real browser against
 * a real node — and checked for the specific numbers they used to invent.
 *
 * # Why the assertions name the old values
 *
 * A test asserting "the page shows some data" passes just as happily on a
 * fabricated table as on a live read; that is how these routes stayed
 * fabricated through several rounds of green tests. So each check here is
 * two-sided: the page must show something that could only have come from the
 * node or the chain, **and** must not show the figure the fixture used to
 * put there. `24,500,000` raised, `128` nodes online, `217` ratings and the
 * rest were all real strings on real screens.
 *
 * # No mocking, deliberately
 *
 * `playwright.config.ts` points the build at `http://127.0.0.1:7080` and
 * nothing here intercepts a request. A route that cannot reach its node is
 * expected to say so — an honest empty state is a pass, and several of these
 * assert one, because an empty book and an unreachable node are different
 * facts the app is required to distinguish.
 */

const NODE = process.env.NEXT_PUBLIC_OPENFIAT_NODE_URL ?? "http://127.0.0.1:7080";

interface Ad {
  merchant: string;
  merchant_public_key: string;
  fiat_currency: string;
  payment_methods: string[];
  status: string;
}

async function book(): Promise<Ad[]> {
  const res = await fetch(`${NODE}/rpc`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getAdvertisements",
      params: {},
    }),
  });
  const body = (await res.json()) as { result: { advertisements: Ad[] } };
  return body.result.advertisements;
}

/**
 * Page text, whitespace-collapsed, after client fetches have settled.
 *
 * Lower-cased, and every assertion below compares lower-cased. Several
 * headings are upper-cased by CSS `text-transform`, which `innerText`
 * faithfully reports — so a case-sensitive check on "On chain" fails against
 * a page correctly rendering "ON CHAIN". That is a fault in the test, and it
 * is worth failing loudly on the app's behalf rather than working around it
 * per assertion and forgetting once.
 */
async function textOf(page: import("@playwright/test").Page, path: string): Promise<string> {
  const response = await page.goto(path, { waitUntil: "networkidle" });
  expect(response?.status(), `${path} HTTP status`).toBeLessThan(400);
  await page.waitForTimeout(1500);
  return (await page.locator("body").innerText()).replace(/\s+/g, " ").toLowerCase();
}

/** The same comparison the page text has already been put through. */
function has(text: string, needle: string): boolean {
  return text.includes(needle.toLowerCase());
}

test("the merchant directory lists the wallets actually advertising", async ({ page }) => {
  const ads = await book();
  const peers = [...new Set(ads.filter((a) => a.status !== "Deleted").map((a) => a.merchant))];
  test.skip(peers.length === 0, "no advertisements on this node to assert against");

  const text = await textOf(page, "/merchants");

  // Every merchant is shown by the last six characters of their PeerId, which
  // is the only identity the protocol carries for them.
  for (const peer of peers.slice(0, 5)) {
    expect(has(text, peer.slice(-6)), `merchant ${peer} missing from the directory`).toBe(true);
  }

  // The fixture's 68 invented merchants had names. No wallet on this node has
  // published a MerchantName claim, so none of them may appear.
  for (const invented of ["KenyaStarTrades", "Institutional", "Professional tier"]) {
    expect(has(text, invented), `fixture merchant vocabulary "${invented}" still on screen`).toBe(
      false,
    );
  }
});

test("a merchant profile reads the node, and scores nothing", async ({ page }) => {
  const ads = await book();
  const live = ads.filter((a) => a.status !== "Deleted");
  test.skip(live.length === 0, "no advertisements on this node to assert against");
  const peer = live[0]!.merchant;

  const text = await textOf(page, `/merchants/${peer}`);

  // The wallet's real pair and rail, off the book.
  expect(has(text, live[0]!.fiat_currency)).toBe(true);
  for (const method of live[0]!.payment_methods) expect(has(text, method)).toBe(true);

  // The protocol defines no composite score, no tier and no star ladder —
  // `getReputation` returns counters and never serialises a tier. The fixture
  // profile rendered "84/100", eight scored dimensions and a tier badge.
  expect(text, "a composite reputation score is back").not.toMatch(/\b\d{1,3}\/100\b/);
  for (const invented of ["Reputation — 8 dimensions", "Settlement Speed", "Ad capacity"]) {
    expect(has(text, invented), `fixture profile section "${invented}" still rendered`).toBe(false);
  }

  // A wallet with no reviews on this node says so, rather than showing
  // invented testimony. This is the honest empty state, and it is a pass.
  expect(has(text, "no reviews of this wallet on this node") || text.includes("★")).toBe(true);
});

test("an explorer address answers for a real wallet instead of a fixture index", async ({
  page,
}) => {
  const ads = await book();
  test.skip(ads.length === 0, "no advertisements on this node to assert against");
  const address = ads[0]!.merchant_public_key;

  const text = await textOf(page, `/explorer/address/${address}`);

  // The page used to answer only for invented wallets and told every real one
  // it was "Not found in the simulated index".
  expect(has(text, "simulated index"), "the simulated index is back").toBe(false);
  expect(has(text, "on chain")).toBe(true);
  expect(has(text, "on the protocol")).toBe(true);
  // This address is a merchant, so its advertisements must be here.
  expect(has(text, ads[0]!.fiat_currency)).toBe(true);

  // `STAKING_SUMMARY`'s 25,000 staked OPEN was shown as *your* position for
  // every visitor.
  expect(has(text, "25,000 OPEN"), "the fixture staking summary is back").toBe(false);
});

test("an address with no history gets a real answer, not a not-found", async ({ page }) => {
  // A well-formed devnet address that has done nothing on this network. The
  // honest answer is "nothing here", and it must be about this address rather
  // than about a fixture the address is absent from.
  const text = await textOf(page, "/explorer/address/11111111111111111111111111111111");
  expect(has(text, "address")).toBe(true);
  expect(has(text, "simulated index")).toBe(false);
});

test("the OPEN page states there is no sale rather than inventing a total", async ({ page }) => {
  const text = await textOf(page, "/open");

  // `PRESALE.raised` was 24,500,000, rendered as "$24,500,000 / $20,000,000
  // (123%)" over a progress bar with a Buy button under it. No SaleConfig
  // account exists on devnet, so no raised figure may appear at all.
  expect(has(text, "24,500,000"), "the fabricated raised total is back").toBe(false);
  expect(text, "a raised figure appeared with no sale account").not.toMatch(
    /raised.*\$[\d,]+ *\/ *\$[\d,]+/,
  );
  expect(has(text, "not open")).toBe(true);
  // The confirmed price the deployed program enforces is still stated.
  expect(has(text, "1 OPEN = 1 USDC")).toBe(true);
  // And nothing offers to take money.
  expect(
    has(text, "buy open"),
    "a purchase control is back on a sale that does not exist",
  ).toBe(false);
});

test("staking shows the chain's own minimums and per-role unbonding", async ({ page }) => {
  const text = await textOf(page, "/staking");

  // The live StakingConfig holds 500 OPEN floors for Merchant and Arbitrator
  // and three different unbonding periods. The fixture said 1,000 and 10,000
  // and printed a flat "7 days" for every role.
  expect(
    has(text, "10,000 OPEN"),
    "the stale 10,000 OPEN arbitrator minimum is back",
  ).toBe(false);
  expect(has(text, "500 OPEN")).toBe(true);
  expect(has(text, "24 hours")).toBe(true);
  expect(has(text, "3 days")).toBe(true);
  // All seven on-chain roles, not four UI buckets.
  for (const role of ["Merchant bond", "Arbitrator bond", "Node Operator", "Oracle Provider"]) {
    expect(has(text, role), `role "${role}" missing`).toBe(true);
  }
});

test("a country page asks the book which rails are on offer", async ({ page }) => {
  const ads = await book();
  const kes = ads.filter((a) => a.status === "Active" && a.fiat_currency === "KES");

  const text = await textOf(page, "/country/kenya");

  if (kes.length > 0) {
    // The rails on the page must be the ones merchants actually named.
    for (const method of [...new Set(kes.flatMap((a) => a.payment_methods))]) {
      expect(has(text, method), `rail "${method}" from the book missing from the page`).toBe(true);
    }
  } else {
    expect(has(text, "no wallet is currently advertising")).toBe(true);
  }

  // The fixture map printed these on Kenya's page regardless of the book.
  for (const invented of ["Equity Bank", "Mpesa Pochi la Biashara"]) {
    expect(has(text, invented), `fixture rail "${invented}" still on the page`).toBe(false);
  }
});

test("settings offers the node's rails and the real subscription categories", async ({ page }) => {
  const text = await textOf(page, "/settings");

  expect(has(text, "notifications (OFS-6000)")).toBe(true);

  /*
   * No wallet is connected in this spec, and the honest state for that is
   * "there is nothing to show" — a subscription is a signed event, not a
   * browser setting, so five switches drawn for an anonymous visitor would
   * be exactly the fiction this replaced. The categories themselves are
   * asserted in `tests/notifications.test.ts`, which does not need a wallet.
   */
  expect(has(text, "a subscription is an event your key signs")).toBe(true);

  // The four channel toggles are gone, and so are the carriers that were
  // once named as delivering them.
  for (const invented of ["PingRelay", "NotifyHive", "TgramBridge", "PushSignal"]) {
    expect(has(text, invented), `invented provider "${invented}" is back`).toBe(false);
  }

  // And the page no longer confesses that its own controls do nothing.
  expect(
    has(text, "Preferences are simulated"),
    "the simulated-preferences footer is back",
  ).toBe(false);
});

test("no route carries a sample-data badge, because none renders a fixture", async ({ page }) => {
  // The badge was driven by a hand-maintained list of fixture routes. It went
  // stale in both directions — it labelled the fully live `/providers/[id]`
  // as fabricated, and never learned `/staking` had drifted from the chain.
  for (const path of ["/merchants", "/open", "/country/kenya", "/explorer", "/settings"]) {
    const text = await textOf(page, path);
    expect(has(text, "sample data"), `${path} still declares itself sample data`).toBe(false);
  }
});
