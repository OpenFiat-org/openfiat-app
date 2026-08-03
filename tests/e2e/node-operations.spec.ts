import { expect, test } from "@playwright/test";

/**
 * The operator-facing surfaces, checked against the node they claim to be
 * quoting.
 *
 * Every assertion here reads the node directly and compares, rather than
 * asserting that *something* appeared. That is the whole point: each of
 * these panels replaced nothing — the methods behind them
 * (`getPeers`, the snapshot reads, `getRewardObservations`,
 * `getProviderFeeQuote`, `getWalletScreening`) were answered by every node
 * on the network and called by nothing in this app — so a test that only
 * checked for a heading would pass over a panel wired to the wrong node, or
 * to no node at all.
 *
 * No wallet is involved anywhere below, deliberately. Not one of these reads
 * needs one: a peer table, a snapshot list and an epoch's reward
 * observations are public by design, and OFS-4100 §9.4 publishes the last of
 * those precisely so anybody can recompute the schedule and check it.
 */

const NODE = (process.env.OPENFIAT_E2E_NODE_URL ?? "http://127.0.0.1:7080").replace(/\/+$/, "");

async function rpc<T>(method: string, params: unknown = {}): Promise<T> {
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
    return (await fetch(`${NODE}/health`, { signal: AbortSignal.timeout(2_000) })).ok;
  } catch {
    return false;
  }
}

/**
 * Bring the operator section into play.
 *
 * `/network` answers two different questions on one page, and the second —
 * the peer table and the snapshots — costs four calls to the node. Those
 * wait until the section is reached rather than firing at mount, so a
 * reader who never scrolls past the cluster view never pays for them. A
 * test therefore has to scroll, exactly as a reader does; Playwright's own
 * visibility check does not require an element to be in the viewport, so
 * without this the assertions would wait on data nobody asked for.
 */
async function reachOperatorSection(page: import("@playwright/test").Page) {
  await page
    .getByRole("heading", { name: "Your access node" })
    .scrollIntoViewIfNeeded();
}

/** Point the app at the node these assertions read, before anything renders. */
async function useTestNode(page: import("@playwright/test").Page) {
  await page.addInitScript(
    ({ nodeUrl }) => localStorage.setItem("openfiat:node", `custom:${nodeUrl}`),
    { nodeUrl: NODE },
  );
}

test.describe("what a node says about itself", () => {
  test("/network reports the node's own peer id and its real peer count", async ({ page }) => {
    test.skip(!(await reachable()), `no node at ${NODE}`);
    const peers = await rpc<{ self_peer_id: string; peers: unknown[] }>("getPeers");

    await useTestNode(page);
    await page.goto("/network");
    await reachOperatorSection(page);

    // The id an operator puts after `/p2p/` in an entrypoint, which they
    // have nowhere else to read from without parsing a log line.
    await expect(page.getByText(peers.self_peer_id, { exact: false })).toBeVisible({
      timeout: 20_000,
    });

    // The count the page carried a written apology about for months: "peer
    // count and version are still absent because no method this app calls
    // reports them."
    const metric = page.locator("p", { hasText: /^Peers$/ }).locator("..");
    await expect(metric).toContainText(String(peers.peers.length), { timeout: 20_000 });
  });

  test("/network shows the snapshot the node itself would hand a joiner", async ({ page }) => {
    test.skip(!(await reachable()), `no node at ${NODE}`);
    const latest = await rpc<{ id: string; slot: number } | null>("getLatestSnapshot");
    test.skip(latest === null, "this node knows of no snapshots");

    await useTestNode(page);
    await page.goto("/network");
    await reachOperatorSection(page);

    // Its own answer, not the highest slot this app picked out of the list.
    await expect(page.getByText(latest!.id, { exact: false })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("The one this node would hand a joiner")).toBeVisible();
  });

  test("/earnings answers for a node operator, epoch and all", async ({ page }) => {
    test.skip(!(await reachable()), `no node at ${NODE}`);
    const observations = await rpc<{ epoch: number }>("getRewardObservations");

    await useTestNode(page);
    await page.goto("/earnings");

    await expect(page.getByText("Node reward observations")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(String(observations.epoch), { exact: false })).toBeVisible({
      timeout: 20_000,
    });

    // No token figure anywhere, and the page says why rather than leaving a
    // gap: converting observations into amounts needs on-chain stake the
    // node's read path cannot fetch, so it publishes no schedule — and this
    // app will not invent one in a browser.
    await expect(page.getByText(/no amount here/i)).toBeVisible();
  });
});

test.describe("a service's fee in a token you hold", () => {
  test("/providers/[id] answers with a status rather than a number it made up", async ({ page }) => {
    test.skip(!(await reachable()), `no node at ${NODE}`);
    const services = await rpc<{ service_id: string }[]>("getProviders");
    test.skip(services.length === 0, "no services registered on this node");
    const id = services[0]!.service_id;

    await useTestNode(page);
    await page.goto(`/providers/${encodeURIComponent(id)}`);

    await expect(page.getByText("What this fee costs in another token")).toBeVisible({
      timeout: 20_000,
    });

    /*
     * Whichever branch this node's answer falls in, it is a sentence and
     * never a bare zero. `unsettleable` is the one that matters: the node's
     * own OpenRPC description tells integrators it "must never be rendered
     * as zero or as the last number you saw", and the panel has no numeric
     * field on that branch at all.
     */
    await expect(
      page.getByText(
        /(declared no price|already bills in this token|Converted from the declared|Not settleable in)/,
      ),
    ).toBeVisible({ timeout: 20_000 });
  });
});

/*
 * There is deliberately no end-to-end case for the wallet screening panel.
 *
 * It lives on `/explorer/address/[address]`, which also reads Solana for the
 * same wallet — and under the full suite, three browser projects hitting that
 * route at once puts it past any timeout worth setting. A test that is only
 * green when the machine is quiet is worse than no test: it teaches everyone
 * to re-run until it passes, and then it catches nothing.
 *
 * What that panel has to get right is not a rendering question anyway. It is
 * that three different situations arrive as one absent severity — nothing is
 * screening this network, nobody has looked at this wallet, or somebody
 * looked and the finding no longer stands — and they must not be shown as one
 * clean result. `tests/live-risk.test.ts` pins all three against fixtures, plus
 * the case that matters most: an unreachable node throws rather than screening
 * clean.
 */
