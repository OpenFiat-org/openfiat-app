import { expect, test } from "@playwright/test";
import bs58 from "bs58";
import { generateKeypair, peerIdFromPublicKey, sign } from "@openfiat/sdk";

/**
 * The taker half: a buyer arrives at the book, finds a real advertisement,
 * and opens an order against it.
 *
 * The advertisement is published straight to the node with a real signature
 * rather than through the wizard — the wizard's own path is proven in
 * `tests/e2e/merchant-journey.spec.ts`, and what this file is about is what
 * a taker sees afterwards. Everything a taker reads on the way is live: the
 * currency list, the asset pills and the payment-method filter all come from
 * the node, and the row itself comes from `getAdvertisements`.
 *
 * Needs a node at `OPENFIAT_E2E_NODE_URL` (default `127.0.0.1:7080`);
 * skipped when there is none.
 */

const NODE = (process.env.OPENFIAT_E2E_NODE_URL ?? "http://127.0.0.1:7080").replace(/\/+$/, "");
/** The devnet settlement stablecoin — 6 decimals, and the node names it. */
const MINT = "2bHPi5hA4zrmPAfrvLmEexg3KJjpTjNkUcxWnzUPeRRU";
const FIAT = "KES";

async function rpc<T>(method: string, params: unknown): Promise<T> {
  const res = await fetch(`${NODE}/rpc`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await res.json()) as { result?: T; error?: { message: string } };
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result as T;
}

async function nodeReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${NODE}/health`, { signal: AbortSignal.timeout(2_000) });
    return res.ok;
  } catch {
    return false;
  }
}

const amount = (units: number) => ({ base_units: units, decimals: 6 });

test("a taker browses the book and opens an order against a real advertisement", async ({
  page,
}) => {
  test.skip(!(await nodeReachable()), `no node at ${NODE}`);
  test.setTimeout(120_000);

  // A rail the node genuinely lists for this corridor, asked for rather than
  // written down — a payment method typed into a test is the same hardcoded
  // list this whole change removed, one file further out.
  const catalogue = await rpc<{ suggested: Array<{ id: string; name: string }> }>(
    "getPaymentMethods",
    { country: "KE" },
  );
  const rail = catalogue.suggested[0];
  expect(rail, "the node suggested no rails for KE").toBeTruthy();

  const keypair = await generateKeypair();
  const merchant = bs58.encode(peerIdFromPublicKey(keypair.publicKey));
  const id = `e2e-taker-${Date.now()}`;
  const create = {
    id,
    merchant,
    merchant_public_key: bs58.encode(keypair.publicKey),
    asset_mint: MINT,
    direction: "Sell",
    fiat_currency: FIAT,
    min_trade: amount(1_000_000),
    max_trade: amount(500_000_000),
    initial_liquidity: amount(1_000_000_000),
    pricing: { Fixed: { price: { base_units: 129_500_000, decimals: 6 } } },
    payment_methods: [rail!.id],
    timestamp: Date.now(),
  };
  const signature = bs58.encode(
    await sign(keypair, new TextEncoder().encode(JSON.stringify(create))),
  );
  await rpc("sendAdvertisementCreate", {
    data: Buffer.from(JSON.stringify({ create, signature }), "utf8").toString("base64"),
  });

  await page.addInitScript(
    ({ nodeUrl }) => localStorage.setItem("openfiat:node", `custom:${nodeUrl}`),
    { nodeUrl: NODE },
  );
  await page.goto("/");

  // A taker buying is looking at merchants advertising `Sell`. Getting that
  // inversion wrong shows the wrong half of the market and is invisible
  // until somebody opens an order.
  await page.getByRole("button", { name: "Buy", exact: true }).click();

  // The currency picker is the node's list, and this is how a taker reaches
  // their own corridor.
  await page.getByRole("button", { name: /^Fiat currency/ }).click();
  await page.getByPlaceholder("Search country or currency…").fill(FIAT);
  await page
    .getByRole("listbox", { name: "Fiat currencies" })
    .getByRole("button", { name: new RegExp(FIAT) })
    .first()
    .click();

  const row = page.getByRole("row").filter({ hasText: `…${merchant.slice(-6)}` });
  await expect(row).toBeVisible({ timeout: 30_000 });

  // The row names the token by the symbol the *node* resolved for the mint —
  // never a ticker this app attached to an address.
  await expect(row).toContainText("USDC");
  /*
   * The rail is shown by the node's *name* for it. The record carries
   * `builtin:mpesa-kenya`, and a row printing that at a taker would be
   * showing them the node's internal key — the same mistake as rendering a
   * mint address where a ticker belongs.
   */
  await expect(row).toContainText(rail!.name);
  await expect(row).not.toContainText(rail!.id);

  // The payment-method filter is built from the live book, so the rail on
  // the row is selectable and filtering by it keeps the row.
  // Valued by id, labelled by name — so this asserts both halves at once.
  await page
    .getByRole("combobox")
    .filter({ hasText: "All payment methods" })
    .selectOption({ label: rail!.name });
  await expect(row).toBeVisible();

  // Opening the order.
  await row.getByRole("button", { name: /^Buy USDC$/ }).click();
  await expect(page.getByRole("heading", { name: "Advertisement" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("I will pay")).toBeVisible();
  await expect(page.getByText("I will receive")).toBeVisible();

  /*
   * The advertisement the panel opened against is the one the node has —
   * asserted against the node rather than against the screen, so a UI that
   * rendered a stale or invented row cannot pass.
   */
  const ad = await rpc<{ id: string; status: string; payment_methods: string[] }>(
    "getAdvertisement",
    { id },
  );
  expect(ad.id).toBe(id);
  expect(ad.status).toBe("Active");
  expect(ad.payment_methods).toEqual([rail!.id]);

  /*
   * And on through to the page that actually places it.
   *
   * The panel used to end here with a notice saying a reservation could not
   * be submitted. It can now, so the walk continues to the button that signs
   * one — and to the two things that button must say before anybody presses
   * it.
   */
  /*
   * First, what the panel refuses to do. This advertisement was published
   * straight to the node and has no liquidity vault on chain behind it, so
   * the panel will not open an order against it at all — it compares the
   * declared liquidity against the merchant's real vault and says the vault
   * is missing. That is the check working, and it is why the walk continues
   * by the link the panel builds rather than through the panel itself.
   */
  await expect(
    page.getByText("No vault for this mint"),
    "an advertisement with no vault behind it must say so, not just decline",
  ).toBeVisible({ timeout: 30_000 });

  // The amount travels in the *asset*, because that is the unit a
  // reservation's `amount` and this advertisement's limits are both stated
  // in. A fiat total here would be divided back out by a rounded price.
  await page.goto(`/orders/new?ad=${id}&asset=15&method=${encodeURIComponent(rail!.id)}`);
  await expect(page.getByRole("heading", { name: "Review Order" })).toBeVisible();
  // The rail is shown by its name, never by the catalogue id the record
  // carries — the same rule the order-book row follows.
  await expect(page.getByText(rail!.name).first()).toBeVisible();
  await expect(page.getByText(rail!.id)).toHaveCount(0);

  // No wallet is connected in this browser, and the page says so rather than
  // offering a button that would fail at the prompt.
  await expect(
    page.getByRole("button", { name: /^Place this order/ }),
  ).toBeDisabled();
  await expect(page.getByText(/Connect a wallet first/)).toBeVisible();

  /*
   * The release warning, read off the chain rather than written down here.
   *
   * `release_escrow` pays the settlement fee into treasuries that hold one
   * specific mint, and this advertisement settles in another — so the trade
   * could be reserved, funded and approved and then never released. Saying
   * that after the merchant's tokens are locked would be too late.
   */
  await expect(
    page.getByText(/cannot be released/),
    "a mint the fee treasuries do not hold must be called out before ordering",
  ).toBeVisible({ timeout: 30_000 });
});
