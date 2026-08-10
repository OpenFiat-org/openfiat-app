import { test, expect } from "@playwright/test";

/**
 * SP-B Task 3's "pay from another chain" flow — render shell only, no
 * wallet required.
 *
 * Everything past "connect a source-chain wallet" needs `window.ethereum`
 * or `window.tronLink`, which this suite's other specs cover for the
 * Solana wallet-adapter modal (`wallet-modal.spec.ts`) by never simulating
 * an installed extension either — the same discipline applies here: no
 * fabricated `window.ethereum`/`window.tronLink` standing in for a real
 * wallet. What this proves instead is that `PayCrossChain` is actually
 * wired into `/open` (not just present in the component tree unreferenced)
 * and that its collapsed entry point expands into the real step-by-step
 * panel from `components/open/pay-cross-chain.tsx`, not a placeholder.
 */

test("the cross-chain entry point expands into the pay panel", async ({ page }) => {
  await page.goto("/open");

  const entry = page.getByRole("button", { name: /pay from another chain/i });
  await expect(entry).toBeVisible();
  await entry.click();

  // The panel's own steps, not just any text — proves the real component
  // rendered rather than the entry point silently doing nothing.
  await expect(page.getByText(/connect the wallet you're paying from/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Ethereum" })).toBeVisible();
  await expect(page.getByRole("button", { name: "BNB Chain" })).toBeVisible();
  await expect(page.getByRole("button", { name: "TRON" })).toBeVisible();
  await expect(page.getByPlaceholder("Solana address")).toBeVisible();

  // Nothing signs or submits without a connected wallet — the build button
  // starts disabled, and stays that way with no wallet, no recipient and
  // no amount entered.
  await expect(page.getByRole("button", { name: /build order/i })).toBeDisabled();
});
