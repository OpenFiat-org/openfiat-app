import { expect, test } from "@playwright/test";
import bs58 from "bs58";
import { generateKeypair, peerIdFromPublicKey, sign } from "@openfiat/sdk";

/**
 * Filing a proposal, and voting on one, driven through the real UI against
 * a real node.
 *
 * # What is real here
 *
 * Everything but the browser-extension layer. The keypair is real,
 * `signMessage` really signs with it, and the node really verifies the
 * signature — which is the only thing that can settle whether this app
 * assembles `ProposalCreate` correctly. The node re-serializes the struct
 * with `serde_json` and verifies over *its* rendering, so a field emitted
 * in the wrong order produces a valid signature over bytes it never
 * hashes: the screen would look right, the node would answer
 * `INVALID_SIGNATURE`, and unit tests over this app's own builders would
 * agree with themselves. Confirmed by hand while writing this — moving
 * `author` one field earlier is refused with exactly that code.
 *
 * The proposal assertion reads `getProposal` back from the node rather
 * than the screen, so a UI that merely claims to have filed one cannot
 * pass.
 *
 * # What cannot be real, and is therefore asserted as honest instead
 *
 * A vote that counts. Weight comes from staked OPEN, the node never
 * trusts the weight a vote claims — it reads the `StakeAccount` off
 * Solana and decodes the amount itself — and the devnet OPEN mint's
 * authority is permanently unset, so a fresh wallet can never obtain any
 * to stake. A vote from this wallet would be accepted for its signature
 * and then dropped without a word. The test therefore asserts the UI says
 * so rather than offering a form whose every submission would vanish;
 * the same constraint `tests/e2e/stake.spec.ts` records.
 *
 * Needs a node at `OPENFIAT_E2E_NODE_URL` (default `127.0.0.1:7080`);
 * skipped when there is none, since a red test for an absent devnet says
 * nothing about this code.
 */

const NODE = (process.env.OPENFIAT_E2E_NODE_URL ?? "http://127.0.0.1:7080").replace(/\/+$/, "");

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

async function reachable(): Promise<boolean> {
  try {
    const res = await fetch(`${NODE}/health`, { signal: AbortSignal.timeout(2_000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * A fresh identity wired into the page as an injected wallet.
 *
 * Fresh per test because a proposal id is claimed network-wide and forever
 * — but so is a proposal, so the ids below carry a timestamp too. The
 * attach loop is `tests/e2e/merchant-ads.spec.ts`'s, for the reason set
 * out there: the wallet adapter's own "nothing is connected" effect clears
 * the record when it mounts, so a write that landed a moment too early is
 * undone, and checking straight after writing confirms only our own store.
 */
async function newVoter(page: import("@playwright/test").Page) {
  const keypair = await generateKeypair();
  const address = bs58.encode(keypair.publicKey);
  const peerId = bs58.encode(peerIdFromPublicKey(keypair.publicKey));

  // Signing happens in Node, so the secret never enters the page.
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

interface NodeProposal {
  id: string;
  title: string;
  summary: string;
  category: string;
  author: string;
  status: string;
  votes: unknown[];
  onchain_proposal_id: number | null;
}

test("a token holder files a proposal through the UI and the node holds it", async ({ page }) => {
  test.skip(!(await reachable()), `no node at ${NODE}`);

  const voter = await newVoter(page);
  const id = `e2e-ofip-${Date.now()}`;
  const title = "Shorten the reservation validation window";
  const summary =
    "From 30 minutes to 15, so a taker who walks away frees a merchant's liquidity sooner.";

  await page.goto("/governance/new");
  await voter.attach();

  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Id", { exact: true }).fill(id);
  await page.getByLabel("Summary", { exact: true }).fill(summary);
  await page.getByLabel("Category", { exact: true }).selectOption("Economics");

  await page.getByRole("button", { name: "Sign and file the proposal" }).click();

  // The app navigates to the proposal it just filed; the node is what
  // decides whether it exists.
  await expect(page).toHaveURL(new RegExp(`/governance/proposal/${id}$`), { timeout: 30_000 });

  const stored = await rpc<NodeProposal | null>("getProposal", { id });
  expect(stored, "the node has no proposal this run filed").not.toBeNull();
  expect(stored!.title).toBe(title);
  expect(stored!.summary).toBe(summary);
  expect(stored!.category).toBe("Economics");
  expect(stored!.author).toBe(voter.peerId);
  expect(stored!.status).toBe("Voting");
  // Left blank in the form, and an `Option<u64>` the node must have read as
  // an explicit null rather than a missing key — a missing key would have
  // changed the bytes and failed the signature before reaching here.
  expect(stored!.onchain_proposal_id).toBeNull();

  // And the words are on the page, which is the whole reason the off-chain
  // register exists: the governance program stores only their hashes.
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByText(summary)).toBeVisible();
});

test("the vote panel says a wallet with no stake cannot vote, rather than pretending", async ({
  page,
}) => {
  test.skip(!(await reachable()), `no node at ${NODE}`);

  const voter = await newVoter(page);
  const id = `e2e-ofip-vote-${Date.now()}`;

  // Filed straight at the node: what is under test here is the vote panel,
  // and driving the form again would only re-prove the previous test.
  const create = {
    id,
    title: "A proposal to vote on",
    summary: "Filed by the test fixture so the vote panel has something to render against.",
    category: "Governance",
    author: voter.peerId,
    author_public_key: voter.address,
    onchain_proposal_id: null,
    timestamp: Date.now(),
  };
  await page.goto("/governance");
  const signature = await page.evaluate(
    async (bytes: number[]) =>
      Array.from(
        await (window as unknown as { __e2eSign(b: number[]): Promise<number[]> }).__e2eSign(bytes),
      ),
    Array.from(new TextEncoder().encode(JSON.stringify(create))),
  );
  await rpc("sendProposalCreate", {
    data: Buffer.from(
      JSON.stringify({ create, signature: bs58.encode(Uint8Array.from(signature)) }),
      "utf8",
    ).toString("base64"),
  });

  await page.goto(`/governance/proposal/${id}`);
  await voter.attach();

  // The honest state, and the one that matters: a vote from a wallet with
  // no stake account would be accepted for its signature and then dropped
  // when the node read the chain, with nothing said to the voter.
  await expect(page.getByText(/no stake account/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/mint's authority is permanently unset/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);

  // The local tally is labelled as this node's verified votes and not as an
  // outcome — a node that verifies nothing would otherwise report every
  // proposal unanimously rejected.
  await expect(page.getByText("Votes this node has verified")).toBeVisible();
  await expect(page.getByText(/Not the outcome/)).toBeVisible();

  // And the chain link reports an off-chain-only proposal as exactly that,
  // rather than as a proposal whose chain half is missing.
  await expect(page.getByText("Off-chain only")).toBeVisible();
});
