import { defineConfig, devices } from "@playwright/test";

/**
 * E2E proof that this app's real wallet-signed on-chain flows actually
 * work against real Solana devnet state (Phase 8's own exit criterion —
 * see `tests/e2e/stake.spec.ts` for what's actually proven and why).
 * `webServer` boots a real Next.js dev server rather than mocking one,
 * matching how every other live-data cutover in this app (`/providers`,
 * `/explorer`) is meant to be exercised — against the real app, not a
 * component-level stub.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3101",
    trace: "retain-on-failure",
    // Tall enough that the wallet-connect modal's full list (including
    // its first row, Phantom) sits inside the fold — the default 720px
    // viewport clipped it above y=0.
    viewport: { width: 1280, height: 900 },
  },
  // A production build, not `next dev` — Turbopack's dev-mode HMR
  // websocket fails its handshake under Playwright's 127.0.0.1 origin
  // (a real, reproducible dev-server quirk, not an app bug — confirmed
  // by the same non-interactive symptom appearing on totally unrelated
  // components, e.g. the nav's own "My Account" dropdown, which this
  // phase never touched), which left the page fully rendered but
  // non-interactive. A production server has no HMR client at all.
  webServer: {
    command: "npx next build && npx next start --port 3101",
    url: "http://127.0.0.1:3101",
    /*
     * Reuses a server already listening on 3101 — which skips the build,
     * so **a server started before your last edit is tested instead of
     * your last edit**, and reports green.
     *
     * That is not hypothetical. It has already produced one false failure
     * here (a locator against markup the running bundle predated) and it
     * can just as easily produce a false pass, which is the dangerous
     * direction: the same shape as a cached build hiding the thing the
     * check exists to see.
     *
     * Kill the listener before a run that is meant to prove a change:
     *
     *     pkill -f "next start --port 3101"
     *
     * Two runs cannot share the tree in any case — `next build` refuses to
     * start while another is running, so concurrent suites in one checkout
     * kill each other rather than interleave.
     *
     * Left on locally regardless, because the alternative is a full
     * production build for every single-spec run. `CI` has no server to
     * reuse and always builds.
     */
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    /*
     * The node under test, pinned rather than left to the build default.
     *
     * `NEXT_PUBLIC_OPENFIAT_NODE_URL` is inlined at build time, so it has to
     * be set on the command that builds — setting it on the test process
     * would do nothing at all, and the suite would quietly exercise the
     * public node instead of the local one. Loopback over plain HTTP is fine
     * here because the page itself is served over HTTP; a deployed app on
     * HTTPS could not reach it (see `lib/node-scheme.ts`).
     *
     * There is deliberately no mock. Every route these specs touch reads
     * either this node or Solana devnet, and a stub would re-introduce
     * exactly the class of thing this suite exists to prove is gone.
     */
    env: {
      NEXT_PUBLIC_OPENFIAT_NODE_URL:
        process.env.NEXT_PUBLIC_OPENFIAT_NODE_URL ?? "http://127.0.0.1:7080",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
      // The mobile suite is device-emulated and would be meaningless at a
      // desktop user agent — the connect path it asserts on is chosen by
      // exactly that.
      testIgnore: /mobile\.spec\.ts/,
    },
    /*
     * Real device emulation, not a narrow desktop window.
     *
     * A resized Chrome reports a desktop user agent, no touch, and a device
     * pixel ratio of 1 — and the three things this suite is about all turn
     * on those. The wallet connect path is chosen by the user agent
     * (Mobile Wallet Adapter exists on Android and not on iOS), so a narrow
     * desktop window would exercise neither branch and would pass with the
     * whole feature missing.
     *
     * Both real engines. `iPhone 13` runs on WebKit, which is the only
     * engine an iPhone has: iOS Safari is the browser where connecting is
     * impossible, so it is the one that has to be tested rather than
     * imitated.
     */
    {
      name: "pixel-5",
      use: { ...devices["Pixel 5"] },
      testMatch: /mobile\.spec\.ts/,
    },
    {
      name: "iphone-13",
      use: { ...devices["iPhone 13"] },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
});
