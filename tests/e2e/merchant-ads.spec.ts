import { expect, test } from "@playwright/test";
import bs58 from "bs58";
import { generateKeypair, peerIdFromPublicKey, sign } from "@openfiat/sdk";

/**
 * The merchant console, driven through the real UI against a real node.
 *
 * Everything here is genuine except the browser-extension layer: the
 * keypair is real, `signMessage` really signs with it, the node really
 * verifies the signature and really refuses one that does not check out.
 * Nothing about the protocol interaction is stubbed.
 *
 * That matters because the thing under test is a signature over an exact
 * byte string. The node re-serializes each struct and verifies over
 * *its* rendering, so a key emitted in the wrong order produces a valid
 * signature over the wrong bytes — the UI would look right, the node
 * would answer `INVALID_SIGNATURE`, and unit tests over this app's own
 * builders would happily agree with themselves. Only a real node can
 * settle it.
 *
 * Every assertion reads the node back directly rather than the screen,
 * so a UI that merely *claims* an advertisement was paused cannot pass.
 *
 * Needs a node at `OPENFIAT_E2E_NODE_URL` (default `127.0.0.1:7080`);
 * skipped when there is none, since a red test for an absent devnet says
 * nothing about this code.
 */

const NODE = (process.env.OPENFIAT_E2E_NODE_URL ?? "http://127.0.0.1:7080").replace(/\/+$/, "");
const MINT = "2bHPi5hA4zrmPAfrvLmEexg3KJjpTjNkUcxWnzUPeRRU";

async function rpc(method: string, params: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${NODE}/rpc`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result as Record<string, unknown>;
}

async function reachable(): Promise<boolean> {
  try {
    const res = await fetch(`${NODE}/health`, { signal: AbortSignal.timeout(2_000) });
    return res.ok;
  } catch {
    return false;
  }
}

const amount = (whole: number) => ({ base_units: whole * 1_000_000, decimals: 6 });

/**
 * A fresh merchant identity, wired into the page as an injected wallet.
 *
 * Generated per test rather than shared, which is what keeps these honest
 * about state the node keeps forever: a merchant may hold only 32 payment
 * method definitions and there is no delete, so a suite that reused one
 * wallet would eventually be testing the limit instead of the feature.
 */
async function newMerchant(page: import("@playwright/test").Page) {
  const keypair = await generateKeypair();
  const address = bs58.encode(keypair.publicKey);
  const merchant = bs58.encode(peerIdFromPublicKey(keypair.publicKey));

  // Signing happens in Node, so the secret never enters the page.
  await page.exposeFunction("__e2eSign", async (bytes: number[]) =>
    Array.from(await sign(keypair, Uint8Array.from(bytes))),
  );
  await page.addInitScript(
    ({ nodeUrl }) => {
      localStorage.setItem("openfiat:node", `custom:${nodeUrl}`);
      // `currentSigner`'s documented fallback: an injected provider, for a
      // connection restored from storage before the wallet adapter has
      // mounted. That is the path this drives — registering a Wallet
      // Standard wallet well enough for the adapter's own modal is a
      // separate fixture, and `tests/e2e/stake.spec.ts` says the same.
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

  // After first paint every time, because the wallet adapter's own
  // "nothing is connected" effect clears this record on mount — so a
  // reload drops it and it has to be put back.
  const attach = async () => {
    /*
     * Written until it sticks, and "sticks" means it survived — not that we
     * managed to store it.
     *
     * Two things race this fixture, and both end with the console sitting
     * on "Connect a wallet to see the advertisements published under it",
     * which is also exactly what a genuinely disconnected browser shows. So
     * the failure has nothing on screen to identify it, and it surfaced as
     * this spec failing at its first `toBeVisible` on roughly one full-suite
     * run in three — never at anything the test was about. It reproduces on
     * `HEAD` with none of the surrounding changes, so it is the fixture.
     *
     * 1. `page.goto` resolves at `load`; the console registers its
     *    `openfiat:wallet-changed` listener when React hydrates, which can
     *    be later. A single dispatch into that gap is lost.
     * 2. The wallet adapter's own "nothing is connected" effect *clears*
     *    the record when it mounts, so a write that landed a moment too
     *    early is undone.
     *
     * Checking straight after writing — which is what this used to do —
     * catches neither: it confirms our own store and always passes on the
     * first tick. So each tick reads *first*, and only rewrites when the
     * record has gone. Requiring several consecutive survivals is what
     * distinguishes "the adapter has not cleared it yet" from "the adapter
     * has mounted and left it alone".
     */
    await expect
      .poll(
        async () =>
          page.evaluate((walletAddress) => {
            const scope = window as unknown as { __e2eWalletHeld?: number };
            if (localStorage.getItem("openfiat:wallet")) {
              scope.__e2eWalletHeld = (scope.__e2eWalletHeld ?? 0) + 1;
            } else {
              scope.__e2eWalletHeld = 0;
              localStorage.setItem(
                "openfiat:wallet",
                JSON.stringify({ wallet: "Phantom", address: walletAddress }),
              );
              window.dispatchEvent(new Event("openfiat:wallet-changed"));
            }
            return scope.__e2eWalletHeld;
          }, address),
        { timeout: 20_000, intervals: [200] },
      )
      .toBeGreaterThanOrEqual(5);
  };

  /** Publishes an advertisement for this merchant straight at the node. */
  const publishAd = async (paymentMethods: string[]) => {
    const id = `e2e-${Date.now()}`;
    const create = {
      id,
      merchant,
      merchant_public_key: address,
      asset_mint: MINT,
      direction: "Sell",
      fiat_currency: "KES",
      min_trade: amount(1),
      max_trade: amount(500),
      initial_liquidity: amount(1_000),
      pricing: { Fixed: { price: { base_units: 129_000_000, decimals: 6 } } },
      payment_methods: paymentMethods,
      timestamp: Date.now(),
    };
    const signature = bs58.encode(
      await sign(keypair, new TextEncoder().encode(JSON.stringify(create))),
    );
    await rpc("sendAdvertisementCreate", {
      data: Buffer.from(JSON.stringify({ create, signature }), "utf8").toString("base64"),
    });
    return id;
  };

  return { address, merchant, attach, publishAd };
}

test("a merchant pauses, reactivates and re-terms their own advertisement", async ({ page }) => {
  test.skip(!(await reachable()), `no node at ${NODE}`);

  const { attach: attachWallet, publishAd } = await newMerchant(page);

  // The advertisement under test, published straight to the node. The
  // wizard's own publish path needs a funded liquidity vault for the
  // mint, which this environment cannot create — see `stake.spec.ts` for
  // the same constraint. What the console does to an advertisement is
  // what this file is about.
  //
  // A catalogue id, not a display name: the node validates
  // `payment_methods` against its own catalogue and answers
  // `UNSUPPORTED_PAYMENT_METHOD` for "M-Pesa". See `lib/payment-catalog.ts`.
  const id = await publishAd(["builtin:mpesa-kenya"]);

  await page.goto("/ads");
  await attachWallet();

  const row = page.getByRole("row").filter({ hasText: id });
  await expect(row).toBeVisible({ timeout: 20_000 });

  // Pause.
  await row.getByRole("button", { name: "Pause" }).click();
  await expect
    .poll(async () => (await rpc("getAdvertisement", { id })).status, { timeout: 20_000 })
    .toBe("Vacation");

  // And back on offer — the transition that did not exist at all before
  // this, because the only status event a merchant could send was a
  // disable.
  // The console reloads from the node after every change, so the row's
  // own status is the signal that the new controls are on screen.
  await expect(row).toContainText("Vacation", { timeout: 20_000 });
  const resume = row.getByRole("button", { name: "Put back on offer" });
  await expect(resume).toBeVisible({ timeout: 20_000 });
  await resume.click();
  await expect
    .poll(async () => (await rpc("getAdvertisement", { id })).status, { timeout: 20_000 })
    .toBe("Active");

  // Terms, changed in place.
  await expect(row).toContainText("Active", { timeout: 20_000 });
  const edit = row.getByRole("button", { name: "Edit terms" });
  await expect(edit).toBeEnabled({ timeout: 20_000 });
  await edit.click();
  const dialog = page.getByRole("dialog", { name: "Edit advertisement terms" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Maximum trade").fill("750");
  await dialog.getByRole("button", { name: "Sign and publish" }).click();

  await expect
    .poll(
      async () => {
        const ad = (await rpc("getAdvertisement", { id })) as {
          max_trade: { base_units: number };
        };
        return ad.max_trade.base_units;
      },
      { timeout: 20_000 },
    )
    .toBe(750_000_000);

  // The id survived every one of those, which is the whole reason these
  // are edits rather than delete-and-republish: a new id would orphan
  // every reservation, settlement and review that named the old one.
  const finalAd = (await rpc("getAdvertisement", { id })) as { id: string; status: string };
  expect(finalAd.id).toBe(id);
  expect(finalAd.status).toBe("Active");
});

/**
 * The other half of #203: a merchant whose rail this build has never heard
 * of writes it down themselves, and puts it on their own advertisement.
 *
 * This is the path an earlier build deleted. Its "add your own rail" control
 * produced `custom:whatever`, the node refused it, and the control was
 * removed — a correct response to a control that guaranteed failure, but the
 * defect was the id format rather than the feature. So the assertions here
 * are about the id: it comes back in the `<peer id>:<digest>` namespace, the
 * node resolves it, and an advertisement carrying it is accepted. A test
 * that only read the screen would have passed for the broken version too.
 */
test("a merchant defines a rail their node has never heard of and advertises it", async ({
  page,
}) => {
  test.skip(!(await reachable()), `no node at ${NODE}`);

  const { merchant, attach: attachWallet, publishAd } = await newMerchant(page);
  const id = await publishAd(["builtin:cash-in-person"]);

  await page.goto("/ads");
  await attachWallet();

  const row = page.getByRole("row").filter({ hasText: id });
  await expect(row).toBeVisible({ timeout: 20_000 });
  const edit = row.getByRole("button", { name: "Edit terms" });
  await expect(edit).toBeEnabled({ timeout: 20_000 });
  await edit.click();

  const dialog = page.getByRole("dialog", { name: "Edit advertisement terms" });
  await expect(dialog).toBeVisible();

  // A name no catalogue rail folds to, so the node's impersonation check
  // has nothing to object to. A name that *did* collide is refused, which
  // is `tests/payment-catalog.test.ts`'s business rather than this one's.
  const NAME = "Sacco Standing Order";
  await dialog.getByRole("button", { name: "Define your own rail" }).click();
  await dialog.getByLabel("Name").fill(NAME);
  await dialog.getByLabel("Kind").selectOption("BankTransfer");
  await dialog.getByRole("button", { name: "Publish and select" }).click();

  // The node's own answer, not the screen's: the definition is a signed
  // record it stores and gossips, and the id is what an advertisement can
  // carry.
  const walletParam = Buffer.from(bs58.decode(merchant)).toString("base64");
  const mine = async () => {
    const answer = (await rpc("getPaymentMethods", { wallet: walletParam })) as {
      merchant: { id: string; name: string; category: string }[];
    };
    return answer.merchant.find((m) => m.name === NAME) ?? null;
  };
  await expect.poll(async () => (await mine())?.name ?? null, { timeout: 20_000 }).toBe(NAME);
  const defined = (await mine())!;

  // `<peer id>:<16 lowercase hex>`, and the peer id is this merchant's —
  // not `custom:` anything, which is the form that could never be published.
  expect(defined.id).toBe(`${merchant}:${defined.id.split(":")[1]}`);
  expect(defined.id.split(":")[1]).toMatch(/^[0-9a-f]{16}$/);
  expect(defined.category).toBe("BankTransfer");

  // Readable by id, which is all an advertisement carries — so a
  // counterparty on another node can say what the ad means.
  const resolved = (await rpc("getPaymentMethod", { id: defined.id })) as { name: string };
  expect(resolved.name).toBe(NAME);

  // Selected, and marked as this merchant's own rather than as something
  // the network vouches for.
  await expect(dialog.getByTitle(defined.id)).toContainText(NAME);
  await expect(dialog.getByTitle(defined.id)).toContainText("yours");

  // And the node accepts it on the advertisement, which is the step the
  // deleted control could never reach.
  await dialog.getByRole("button", { name: "Sign and publish" }).click();
  await expect
    .poll(
      async () => {
        const ad = (await rpc("getAdvertisement", { id })) as { payment_methods: string[] };
        return ad.payment_methods;
      },
      { timeout: 20_000 },
    )
    .toContain(defined.id);
});
