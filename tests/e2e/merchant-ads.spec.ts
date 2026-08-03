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

test("a merchant pauses, reactivates and re-terms their own advertisement", async ({ page }) => {
  test.skip(!(await reachable()), `no node at ${NODE}`);

  const keypair = await generateKeypair();
  const address = bs58.encode(keypair.publicKey);
  const merchant = bs58.encode(peerIdFromPublicKey(keypair.publicKey));
  const signBytes = async (bytes: number[]) =>
    Array.from(await sign(keypair, Uint8Array.from(bytes)));

  // The advertisement under test, published straight to the node. The
  // wizard's own publish path needs a funded liquidity vault for the
  // mint, which this environment cannot create — see `stake.spec.ts` for
  // the same constraint. What the console does to an advertisement is
  // what this file is about.
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
    // A catalogue id, not a display name: the node validates
    // `payment_methods` against its own catalogue and answers
    // `UNSUPPORTED_PAYMENT_METHOD` for "M-Pesa". See `lib/payment-catalog.ts`.
    payment_methods: ["builtin:mpesa-kenya"],
    timestamp: Date.now(),
  };
  const createSig = bs58.encode(
    await sign(keypair, new TextEncoder().encode(JSON.stringify(create))),
  );
  await rpc("sendAdvertisementCreate", {
    data: Buffer.from(JSON.stringify({ create, signature: createSig }), "utf8").toString("base64"),
  });

  // Signing happens in Node, so the secret never enters the page.
  await page.exposeFunction("__e2eSign", signBytes);
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
  const attachWallet = async () => {
    await page.evaluate((walletAddress) => {
      localStorage.setItem(
        "openfiat:wallet",
        JSON.stringify({ wallet: "Phantom", address: walletAddress }),
      );
      window.dispatchEvent(new Event("openfiat:wallet-changed"));
    }, address);
  };

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
