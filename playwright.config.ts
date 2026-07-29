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
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
    },
  ],
});
