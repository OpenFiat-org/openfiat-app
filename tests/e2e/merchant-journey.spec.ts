import { readFileSync } from "node:fs";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { expect, test } from "@playwright/test";
import bs58 from "bs58";
import { keypairFromSeed, peerIdFromPublicKey, sign } from "@openfiat/sdk";

import { fetchVault } from "@/lib/live-vaults";
import { depositInstructions, tokenProgramForMint } from "@/lib/vault-instructions";

/**
 * The whole merchant journey, driven through the real UI against a real
 * node and real Solana devnet state: become a merchant, then post an
 * advertisement end to end.
 *
 * # Nothing here is mocked except the browser extension
 *
 * The keypair is real, `signMessage` really signs with it, the liquidity
 * vault is a real account created by a real transaction on devnet, the node
 * really verifies the signature, and every assertion reads the node or the
 * chain back directly rather than reading the screen. A UI that merely
 * *claims* an advertisement was posted cannot pass.
 *
 * That matters most for the signature, which is over an exact byte string:
 * the node re-serializes the struct and verifies over *its* rendering, so a
 * field emitted in the wrong order produces a valid signature over the wrong
 * bytes. The UI would look right, the node would answer `INVALID_SIGNATURE`,
 * and unit tests over this app's own builders would agree with themselves.
 *
 * # Why wSOL, and why the vault is created here
 *
 * The wizard blocks on evidence that an advertisement is unbacked, so
 * posting one needs a real liquidity vault. wSOL is the only mint a devnet
 * wallet can fund without help — SOL is airdroppable and the deposit form's
 * own instruction builder wraps it inside the transaction. The devnet OPEN
 * mint's authority is permanently unset, so nothing denominated in OPEN can
 * ever be proven here; see `tests/e2e/stake.spec.ts` for the same
 * constraint, and the merchant-bond step below for how the UI says so.
 *
 * Needs a node at `OPENFIAT_E2E_NODE_URL` (default `127.0.0.1:7080`) and a
 * funded devnet wallet at `E2E_WALLET`; skipped when either is missing,
 * since a red test for an absent devnet says nothing about this code.
 */

const NODE = (process.env.OPENFIAT_E2E_NODE_URL ?? "http://127.0.0.1:7080").replace(/\/+$/, "");
const WALLET_FILE =
  process.env.E2E_WALLET ??
  "/tmp/claude-0/-OpenFiat/3ef7bfcd-a69d-41fa-b2e7-3ee0e08185cf/scratchpad/playwright-test-wallet.json";
const DEVNET_RPC = "https://api.devnet.solana.com";

/** Wrapped SOL. The same address on every cluster, which is why it is here. */
const WSOL = new PublicKey("So11111111111111111111111111111111111111112");
/** 0.05 SOL, enough to back the small advertisement below several times over. */
const VAULT_DEPOSIT = 50_000_000n;

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

function loadWallet(): Keypair | null {
  try {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(WALLET_FILE, "utf8"))));
  } catch {
    return null;
  }
}

/**
 * Makes sure the wallet has a wSOL liquidity vault, creating and funding one
 * if it does not — with the app's own instruction builders, so this proves
 * them too rather than reaching around them.
 */
async function ensureVault(wallet: Keypair): Promise<bigint> {
  const existing = await fetchVault(wallet.publicKey, WSOL);
  if (existing && existing.available > 0n) return existing.available;

  const connection = new Connection(DEVNET_RPC, "confirmed");
  const tokenProgram = await tokenProgramForMint(WSOL);
  const { instructions } = depositInstructions({
    merchant: wallet.publicKey,
    mint: WSOL,
    tokenProgram,
    amount: VAULT_DEPOSIT,
    from: null,
    wrappedBalance: 0n,
    createVault: existing === null,
  });
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const tx = new Transaction({
    feePayer: wallet.publicKey,
    blockhash,
    lastValidBlockHeight,
  }).add(...instructions);
  tx.sign(wallet);
  const signature = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");

  const funded = await fetchVault(wallet.publicKey, WSOL);
  if (!funded) throw new Error("vault did not appear after a confirmed deposit");
  return funded.available;
}

/**
 * A Wallet-Standard-free stand-in for a browser extension.
 *
 * Signing happens in Node so the secret never enters the page. This is
 * `currentSigner`'s documented fallback path — an injected provider, for a
 * connection restored from storage before the wallet adapter has mounted —
 * and it is what `tests/e2e/merchant-ads.spec.ts` drives too. Registering a
 * real Wallet Standard wallet is a separate fixture.
 */
async function attachWallet(page: import("@playwright/test").Page, wallet: Keypair) {
  const address = wallet.publicKey.toBase58();
  // A Solana `secretKey` is seed(32) || publicKey(32); the SDK signs from
  // the seed. Same key, two representations — not a second identity.
  const signing = await keypairFromSeed(wallet.secretKey.slice(0, 32));
  await page.exposeFunction("__e2eSign", async (bytes: number[]) =>
    Array.from(await sign(signing, Uint8Array.from(bytes))),
  );
  await page.addInitScript(
    ({ nodeUrl }) => {
      localStorage.setItem("openfiat:node", `custom:${nodeUrl}`);
      const provider = {
        isPhantom: true,
        signMessage: async (message: Uint8Array) => ({
          signature: Uint8Array.from(
            await (window as unknown as { __e2eSign(b: number[]): Promise<number[]> }).__e2eSign(
              Array.from(message),
            ),
          ),
        }),
      };
      Object.defineProperty(window, "phantom", { value: { solana: provider }, writable: true });
    },
    { nodeUrl: NODE },
  );
  // After first paint every time, because the wallet adapter's own "nothing
  // is connected" effect clears this record on mount — so a reload drops it
  // and it has to be put back. It also races that effect: writing the record
  // before the adapter has mounted means the adapter clears it a moment
  // later, so this repeats until the app agrees a wallet is connected.
  return async () => {
    const write = async () => {
      await page.evaluate((walletAddress) => {
        localStorage.setItem(
          "openfiat:wallet",
          JSON.stringify({ wallet: "Phantom", address: walletAddress }),
        );
        window.dispatchEvent(new Event("openfiat:wallet-changed"));
      }, address);
    };
    await write();
    await expect
      .poll(
        async () => {
          await write();
          return page.evaluate(() => localStorage.getItem("openfiat:wallet") !== null);
        },
        { timeout: 20_000, intervals: [250] },
      )
      .toBe(true);
  };
}

test.describe("the merchant journey", () => {
  test("become-a-merchant reads the bond from the chain and says what devnet cannot do", async ({
    page,
  }) => {
    test.skip(!(await nodeReachable()), `no node at ${NODE}`);
    const wallet = loadWallet();
    test.skip(wallet === null, `no devnet wallet at ${WALLET_FILE}`);

    const reconnect = await attachWallet(page, wallet!);
    await page.goto("/become-a-merchant");
    await reconnect();

    // Step one is the wallet, and it reports the real address rather than a
    // placeholder.
    await expect(page.getByText(wallet!.publicKey.toBase58())).toBeVisible({ timeout: 20_000 });

    /*
     * The bond figure comes from `StakingConfig.min_stake_by_role[Merchant]`
     * on chain. This asserts it is *a* figure and that it is not the two
     * numbers an earlier build hardcoded — 1,000 and 10,000 OPEN — which the
     * stake form then used to refuse the real 500 OPEN minimum. It
     * deliberately does not assert 500 either: the field is
     * governance-updatable, and a test pinning it would be this repository
     * writing down a number the chain owns all over again.
     */
    const bond = page.getByText(/OPEN, bonded for the merchant role|No staking config exists/);
    await expect(bond).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/1,000 OPEN minimum|10,000 OPEN minimum/)).toHaveCount(0);

    // And the one step this cluster cannot finish is said on the page, not
    // discovered at the signature.
    await expect(
      page.getByText(/OPEN mint.s authority is permanently unset/),
    ).toBeVisible();

    // No merchant tier, no completion rate, no 30-day volume. The protocol
    // defines none of them, and Binance's version of this screen shows all
    // three — which is exactly why their absence is worth pinning.
    await expect(page.getByText(/completion rate/i)).toHaveCount(0);
    await expect(page.getByText(/30-day volume/i)).toHaveCount(0);
    await expect(page.getByText(/\bTier\b/)).toHaveCount(0);
  });

  test("a merchant posts an advertisement through the wizard, and the node has it", async ({
    page,
  }) => {
    test.skip(!(await nodeReachable()), `no node at ${NODE}`);
    const wallet = loadWallet();
    test.skip(wallet === null, `no devnet wallet at ${WALLET_FILE}`);
    test.setTimeout(180_000);

    const available = await ensureVault(wallet!);
    expect(available).toBeGreaterThan(0n);

    const merchant = bs58.encode(peerIdFromPublicKey(wallet!.publicKey.toBytes()));
    /*
     * The ids this merchant already has, not how many.
     *
     * A count was the obvious assertion and it is the wrong one: this wallet
     * accumulates a real advertisement on every run, `getAdvertisements`
     * answers a page rather than the whole book, and once the page is full
     * "one more than before" is a comparison between two numbers that are
     * both the page size. The identity of the advertisement this run posted
     * is the thing under test anyway, and it survives paging, eviction and
     * whatever the previous fifty runs left behind.
     */
    const before = await rpc<{ advertisements: Array<{ id: string }> }>("getAdvertisements", {
      merchant,
    });
    const idsBefore = new Set(before.advertisements.map((ad) => ad.id));

    const reconnect = await attachWallet(page, wallet!);
    await page.goto("/ads/new");
    await reconnect();

    // Every draft is per-browser and this run must start from an empty one,
    // or a previous run's step number decides where the wizard opens.
    await page.evaluate(() => localStorage.removeItem("openfiat:ad-draft"));
    await page.reload();
    await reconnect();

    // ── Step 1: ad type and asset ──────────────────────────────────────
    await page.getByRole("button", { name: "Sell You sell crypto for fiat" }).click();

    /*
     * The asset is chosen by name. This is the defect the rebuild exists
     * for: the field here used to be a text input with the placeholder
     * "Base58 mint address", and the merchant was expected to produce a
     * 32-byte public key from memory.
     */
    await expect(page.getByPlaceholder("Base58 mint address")).toHaveCount(0);
    /*
     * `SOL`, not the node's `wSOL`. The mint is the same one, and the row
     * shows its address; the name is what a merchant is going to advertise
     * in, and they hand over plain SOL — the deposit wraps it inside its own
     * transaction. See `lib/asset-display.ts`. The advertisement this posts
     * still carries the mint, which is asserted against the node below.
     */
    const solOption = page.getByRole("button", { name: /\bSOL\b/ });
    await expect(solOption).toBeVisible({ timeout: 30_000 });
    await solOption.click();
    // The node's own precision for that mint is on screen beside it, because
    // every amount below is scaled by it.
    await expect(page.getByText("9 decimals")).toBeVisible();

    await page.getByRole("button", { name: /^Fiat currency/ }).click();
    await page.getByPlaceholder("Search country or currency…").fill("KES");
    // Scoped to the panel: the trigger's own accessible name now carries the
    // selected code too, so an unscoped match would find the trigger.
    await page
      .getByRole("listbox", { name: "Fiat currencies" })
      .getByRole("button", { name: /KES/ })
      .first()
      .click();

    await page.getByRole("button", { name: "Continue" }).click();

    // ── Step 2: price ──────────────────────────────────────────────────
    await page.getByRole("button", { name: /^Fixed/ }).click();
    await page.getByLabel(/^Price —/).fill("129.50");
    // A fixed price is signed at the precision it was typed at, and the
    // screen says which that is rather than asking for it separately.
    await expect(page.getByText(/2 decimal places/)).toBeVisible();
    // Bybit's estimated ad ranking, done as a count because we have the book.
    await expect(
      page.getByText(/of \d+ at|Nobody else is advertising|Could not read the current book/),
    ).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Continue" }).click();

    // ── Step 3: amount and limits ──────────────────────────────────────
    await page.getByLabel(/Total trading amount/).fill("0.01");
    await page.getByLabel(/Minimum order/).fill("0.001");
    await page.getByLabel(/Maximum order/).fill("0.005");
    // The vault behind it is read from the chain, and it is what lets this
    // step pass at all.
    await expect(page.getByText(/^Backed —/)).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Continue" }).click();

    // ── Step 4: payment ────────────────────────────────────────────────
    // The country is selected only so the node can order the rails; it is
    // not part of the advertisement, and the screen says so.
    await page.getByLabel("Where you settle fiat").selectOption("KE");
    await page.getByLabel("Search payment methods").click();
    const firstRail = page.locator("ul li button").first();
    await expect(firstRail).toBeVisible({ timeout: 30_000 });
    // The button shows the rail's *name*; what the record carries is its id.
    // Both are asserted below, against the node's own catalogue — a picker
    // that stored the name would publish an advertisement the node refuses.
    const railName = (await firstRail.innerText()).split("\n")[0]!.trim();
    await firstRail.click();
    await expect(page.getByText("1 of 5")).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();

    // ── Step 5: review and confirm ─────────────────────────────────────
    await expect(page.getByText(WSOL.toBase58())).toBeVisible();
    await page.getByRole("button", { name: "Confirm to post" }).click();
    await expect(page.getByText("Advertisement posted")).toBeVisible({ timeout: 60_000 });

    /*
     * Read back from the node, not from the screen. The confirmation panel
     * is this app's own state; the advertisement is the network's.
     */
    const after = await rpc<{
      advertisements: Array<{
        id: string;
        created_at: number;
        asset_mint: string;
        fiat_currency: string;
        direction: string;
        payment_methods: string[];
        min_trade: { base_units: number; decimals: number };
        max_trade: { base_units: number; decimals: number };
        pricing: { Fixed?: { price: { base_units: number; decimals: number } } };
      }>;
    }>("getAdvertisements", { merchant });

    // Newest by `created_at`, not last in the list: `getAdvertisements`
    // makes no ordering promise, and this wallet accumulates advertisements
    // across runs.
    const posted = [...after.advertisements].sort((a, b) => b.created_at - a.created_at)[0]!;
    // And it is genuinely new. Without this the assertions below would pass
    // against a previous run's advertisement if this run's publish had
    // silently done nothing.
    expect(idsBefore.has(posted.id), "the node has no advertisement this run created").toBe(false);
    expect(posted.asset_mint).toBe(WSOL.toBase58());
    expect(posted.fiat_currency).toBe("KES");
    expect(posted.direction).toBe("Sell");
    expect(posted.payment_methods).toHaveLength(1);
    const railId = posted.payment_methods[0]!;
    expect(railId, "an advertisement carries the catalogue id, not the name").toMatch(/^builtin:/);
    const catalogue = await rpc<{ suggested: Array<{ id: string; name: string }> }>(
      "getPaymentMethods",
      { country: "KE" },
    );
    expect(catalogue.suggested.find((m) => m.id === railId)?.name).toBe(railName);
    // Scaled by the node's own decimals for wSOL — 9, not the 6 a
    // stablecoin-shaped guess would have used. A wrong precision here
    // publishes limits a thousand times off and nothing downstream notices.
    expect(posted.min_trade).toEqual({ base_units: 1_000_000, decimals: 9 });
    expect(posted.max_trade).toEqual({ base_units: 5_000_000, decimals: 9 });
    // And the price carries the two decimals the merchant typed, not the
    // asset's nine.
    expect(posted.pricing.Fixed?.price).toEqual({ base_units: 12_950, decimals: 2 });
  });
});
