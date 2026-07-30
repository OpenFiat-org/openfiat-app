import { test, expect } from "@playwright/test";

/**
 * The connect button opens the standard Solana wallet modal.
 *
 * # Why this is asserted rather than eyeballed
 *
 * The hand-rolled modal it replaced did something worse than look
 * non-standard: it faked a connection. `connect()` defaulted the address to
 * a fixture wallet and fell back to it both when no wallet was installed and
 * when the user REJECTED the prompt, so declining still left the app showing
 * you as connected — to a wallet you do not control. Every downstream
 * feature then operated against that address.
 *
 * So the two things worth pinning are that the standard modal is what opens,
 * and that a browser with no wallet installed stays disconnected instead of
 * inventing an identity. Playwright has no wallet extension, which is
 * exactly the condition the old code mishandled.
 */

test("the connect button opens the standard wallet-adapter modal", async ({ page }) => {
  await page.goto("/");

  // `wallet-adapter-button` is the adapter's own class, so this fails if the
  // button is ever swapped back for a bespoke one.
  const connect = page.locator("button.wallet-adapter-button");
  await expect(connect).toBeVisible();
  await connect.click();

  const modal = page.locator(".wallet-adapter-modal");
  await expect(modal).toBeVisible();

  // The adapter's own copy for a browser with no wallet installed. Its
  // presence is the proof that discovery is the adapter's, not a hardcoded
  // list of four names.
  await expect(page.locator(".wallet-adapter-modal-title")).toBeVisible();
});

test("no wallet installed means no connection — not a fabricated one", async ({ page }) => {
  await page.goto("/");
  await page.locator("button.wallet-adapter-button").click();
  await expect(page.locator(".wallet-adapter-modal")).toBeVisible();
  await page.keyboard.press("Escape");

  // Dismissing the modal must leave the app disconnected. The old
  // implementation would have shown a fixture address here.
  await expect(page.locator("button.wallet-adapter-button")).toContainText(/select wallet|connect/i);

  const stored = await page.evaluate(() => window.localStorage.getItem("openfiat:wallet"));
  expect(stored, "no wallet record may be written without a real connection").toBeNull();
});
