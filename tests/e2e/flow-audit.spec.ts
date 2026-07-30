import { test, expect } from "@playwright/test";

/**
 * A rendered-in-a-real-browser audit of the routes the onboarding journey
 * actually passes through, rather than a `curl` of the server HTML.
 *
 * Every one of these pages fetches its data client-side, so the server
 * response contains no data at all and grepping it proves nothing either
 * way — a page that is completely broken and a page that is fine look
 * identical until the browser has run.
 *
 * This spec asserts nothing about business logic. It answers one question
 * per route: after the client has fetched, does the page show real data or
 * an error/empty state? Failures here are findings to report, not
 * regressions to hide, so it records what it sees and only fails on a hard
 * page error.
 */

const ROUTES = [
  { path: "/faucet", what: "step 1 — get test assets" },
  { path: "/open", what: "step 2 — buy OPEN on the presale" },
  { path: "/staking", what: "step 3 — stake into a role" },
  { path: "/ads", what: "step 4 — the advertisement book" },
  { path: "/providers", what: "service providers" },
  { path: "/explorer", what: "protocol events" },
  { path: "/governance", what: "proposals" },
  { path: "/orders", what: "trades" },
];

for (const route of ROUTES) {
  test(`${route.path} renders live data (${route.what})`, async ({ page }) => {
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
    });
    page.on("requestfailed", (r) => {
      failedRequests.push(`${r.method()} ${r.url().slice(0, 120)}`);
    });

    const response = await page.goto(route.path, { waitUntil: "networkidle" });
    expect(response?.status(), `${route.path} HTTP status`).toBeLessThan(400);

    // Give client-side fetches a moment past networkidle for any
    // render triggered by the resolved data.
    await page.waitForTimeout(1500);

    const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");

    console.log(`\n===== ${route.path} — ${route.what}`);
    console.log(`text (first 500): ${body.slice(0, 500)}`);
    if (consoleErrors.length) {
      console.log(`CONSOLE ERRORS (${consoleErrors.length}):`);
      consoleErrors.slice(0, 5).forEach((e) => console.log(`   ! ${e}`));
    }
    if (failedRequests.length) {
      console.log(`FAILED REQUESTS (${failedRequests.length}):`);
      failedRequests.slice(0, 5).forEach((r) => console.log(`   ! ${r}`));
    }

    // The page must have rendered *something* — a blank body means the
    // route is broken in a way no amount of data-shape checking would
    // catch.
    expect(body.length, `${route.path} rendered no text at all`).toBeGreaterThan(50);
  });
}
