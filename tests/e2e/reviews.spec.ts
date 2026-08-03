import { expect, test } from "@playwright/test";
import bs58 from "bs58";
import { generateKeypair, peerIdFromPublicKey, sign } from "@openfiat/sdk";

/**
 * Reviewing a trade, driven through the real UI against a real node.
 *
 * # What this proves, and what it deliberately proves negatively
 *
 * Two gated protocol calls run for real here, both with a real Ed25519
 * signature the node verifies:
 *
 * - `getMyReviews`, behind a wallet challenge signed under its own domain
 *   separator. It is the *only* way to answer "have I reviewed this
 *   trade" — the public feed carries no author and no settlement id, on
 *   purpose, so nothing can match a public row to one of your own trades.
 *   A run that got the domain or the encoding wrong is refused, not
 *   answered emptily.
 * - `sendReviewPublish`, from a wallet that was not a party to the trade.
 *   That must come back as a refusal, and it is asserted as one: a
 *   stranger holds a perfectly good key and signs correctly, and what
 *   they lack is a trade. `openfiat-reviews` calls this its load-bearing
 *   case, and the failure mode to guard against is the app showing it as
 *   a success that quietly shows up nowhere.
 *
 * Publishing an *accepted* review needs a wallet that is a party to a
 * settled trade on this node, which means driving the whole merchant
 * journey plus a funded devnet escrow — `tests/e2e/merchant-journey.spec.ts`
 * is where that lives. The accepted path is covered instead by a real
 * signed round trip against the node in the report for task #204, and by
 * the wire-shape assertions in `tests/signed-key-order.test.ts`.
 *
 * Needs a node at `OPENFIAT_E2E_NODE_URL` (default `127.0.0.1:7080`) that
 * holds at least one settled trade; skipped otherwise, since a red test
 * for an empty devnet says nothing about this code.
 */

const NODE = (process.env.OPENFIAT_E2E_NODE_URL ?? "http://127.0.0.1:7080").replace(/\/+$/, "");

interface PublicTrade {
  reservation: { id: string };
  settlement: { id: string; state: string } | null;
}

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

/**
 * A trade this node holds that got far enough to be reviewable.
 *
 * `Approved` counts as well as `Completed`, matching
 * `openfiat_reviews::is_settled`: a gossip-only node may hold at
 * `Approved` a trade an RPC-connected node holds at `Completed`, and an
 * authorization rule that gave different answers per node would not be
 * one.
 */
async function settledTrade(): Promise<PublicTrade | null> {
  try {
    const trades = await rpc<PublicTrade[]>("getTrades", {});
    return (
      trades.find(
        (trade) =>
          trade.settlement !== null &&
          (trade.settlement.state === "Approved" || trade.settlement.state === "Completed"),
      ) ?? null
    );
  } catch {
    return null;
  }
}

/** The injected-wallet fixture from `tests/e2e/merchant-ads.spec.ts`. */
async function newWallet(page: import("@playwright/test").Page) {
  const keypair = await generateKeypair();
  const address = bs58.encode(keypair.publicKey);
  const peerId = bs58.encode(peerIdFromPublicKey(keypair.publicKey));

  await page.exposeFunction("__e2eSign", async (bytes: number[]) =>
    Array.from(await sign(keypair, Uint8Array.from(bytes))),
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

  // Written until it survives, not until it is stored — see
  // `tests/e2e/merchant-ads.spec.ts` for why the difference matters.
  const attach = async () => {
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

  return { address, peerId, attach };
}

/** The "Your review" panel, innermost — the page's outer section wraps it. */
function reviewPanel(page: import("@playwright/test").Page) {
  return page.locator("section", { has: page.getByText("Your review", { exact: true }) }).last();
}

test("a settled trade offers a review, gated behind the wallet's own signature", async ({
  page,
}) => {
  const trade = await settledTrade();
  test.skip(trade === null, `no settled trade on ${NODE} to review`);

  const wallet = await newWallet(page);
  await page.goto(`/orders/${trade!.reservation.id}`);
  await wallet.attach();

  // `.last()` because the page's own outer `<section>` also contains the
  // heading; the innermost match is the panel itself.
  const panel = reviewPanel(page);
  await expect(panel).toBeVisible({ timeout: 30_000 });

  // Nothing is read on mount: a gated read costs a wallet prompt, and a
  // page that puts one up because you opened it trains people to approve
  // prompts without reading them.
  await expect(panel.getByText(/readable only by you/)).toBeVisible();

  // The real gated read — a challenge from the node, signed under
  // `openfiat-my-reviews`, and answered.
  await panel.getByRole("button", { name: "Check my reviews" }).click();
  await expect(panel.getByRole("button", { name: "Publish review" })).toBeVisible({
    timeout: 30_000,
  });

  // And the claim that must never be made on this panel.
  await expect(panel.getByText(/changes no reputation score/)).toBeVisible();
});

test("a wallet that was not in the trade is refused, and told why", async ({ page }) => {
  const trade = await settledTrade();
  test.skip(trade === null, `no settled trade on ${NODE} to review`);

  const wallet = await newWallet(page);
  await page.goto(`/orders/${trade!.reservation.id}`);
  await wallet.attach();

  const panel = reviewPanel(page);
  await panel.getByRole("button", { name: "Check my reviews" }).click();
  await panel.getByRole("textbox").fill("A stranger's opinion of somebody else's trade.");
  await panel.getByRole("button", { name: "Publish review" }).click();

  // `ReviewError::NotAParty` maps onto `INVALID_IDENTITY_CLAIM`, because
  // OFS-8000 has no general authorization code. The raw name says nothing
  // to whoever pressed publish, and — worse — a success message here would
  // leave them believing words that reached nobody.
  await expect(panel.getByText(/not a party to that trade/)).toBeVisible({ timeout: 30_000 });

  // The node holds nothing under this wallet either way.
  const stored = await rpc<unknown[]>("getReviews", {
    wallet: Buffer.from(bs58.decode(wallet.peerId)).toString("base64"),
  });
  expect(stored).toEqual([]);
});
