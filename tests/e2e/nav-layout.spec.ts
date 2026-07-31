import { test, expect } from "@playwright/test";

/**
 * The top bar fits, and the wallet control is reachable, at every width.
 *
 * # Why this is geometry and not CSS
 *
 * The bug this guards against was a single `flex-nowrap` row with no mobile
 * treatment. Measured on a 390px viewport, `document.documentElement
 * .scrollWidth` was 1046px and the wallet connect button's right edge was at
 * 1046 — off-screen on every route, so a phone user could not connect a
 * wallet at all, and nothing in this app works without one.
 *
 * It survived because `body { overflow-x: clip }` suppressed the scrollbar
 * that would have shown it. That is the whole reason these assertions read
 * rendered rectangles rather than classes: a test that checked for a
 * `lg:hidden` somewhere would have passed against the broken bar too, and a
 * human looking at the page saw nothing wrong. Only the numbers disagreed.
 *
 * `elementFromPoint` is the last assertion for the same reason. A button can
 * be inside the viewport and still be un-tappable if something is painted
 * over it, and "visible" in Playwright's sense does not test that.
 */

/** 320 is the narrowest phone still in use; 1440 is where the full row shows. */
const WIDTHS = [320, 390, 768, 1440];

/** One route per layout shape: hero + grid, hero + table, plain, form. */
const ROUTES = ["/", "/wallet", "/explorer", "/governance"];

for (const width of WIDTHS) {
  test(`nothing overflows horizontally at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });

    for (const route of ROUTES) {
      await page.goto(route);

      const { scrollWidth, clientWidth, headerScrollWidth } = await page.evaluate(() => {
        const header = document.querySelector("header");
        return {
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          headerScrollWidth: header ? header.scrollWidth : -1,
        };
      });

      // The document must not be wider than the viewport it is being shown
      // in. `overflow-x: clip` is no longer on `body`, so a regression here
      // also produces a real scrollbar for a human.
      expect(scrollWidth, `${route} document overflows at ${width}px`).toBeLessThanOrEqual(clientWidth);

      // Asserted separately from the document because the nav is the subtree
      // that broke, and because a future body-level clip would hide it again
      // in the measurement above but not in this one.
      expect(headerScrollWidth, `${route} nav overflows at ${width}px`).toBeLessThanOrEqual(clientWidth);
    }
  });

  test(`the wallet control is reachable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");

    const connect = page.locator("button.wallet-adapter-button");
    await expect(connect).toBeVisible();

    const box = await connect.boundingBox();
    expect(box, "wallet button has no box").not.toBeNull();
    expect(box!.x, `wallet button starts off the left edge at ${width}px`).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, `wallet button runs off the right edge at ${width}px`).toBeLessThanOrEqual(width);

    // Actually on top at its own centre — not merely within the viewport.
    const onTop = await connect.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit !== null && (el === hit || el.contains(hit));
    });
    expect(onTop, `wallet button is covered at ${width}px`).toBe(true);
  });
}

test("below lg the menu opens and offers every destination the desktop row does", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/");

  const trigger = page.getByRole("button", { name: "Open menu" });
  await expect(trigger).toBeVisible();

  // The sheet does not exist until it is asked for.
  await expect(page.locator("#mobile-nav-sheet")).toHaveCount(0);
  await trigger.click();

  const sheet = page.locator("#mobile-nav-sheet");
  await expect(sheet).toBeVisible();

  // A representative route from each group: the primary row, Ecosystem, the
  // Account column and the Trust column. If any group stops being rendered,
  // one of these goes missing.
  for (const href of ["/countries", "/faucet", "/wallet", "/account/identity"]) {
    await expect(sheet.locator(`a[href="${href}"]`)).toHaveCount(1);
  }

  // Opening the menu must not itself overflow the viewport.
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(sw).toBeLessThanOrEqual(390);

  // Escape closes it and returns focus to the control that opened it.
  await page.keyboard.press("Escape");
  await expect(page.locator("#mobile-nav-sheet")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("at lg the full row is shown and the menu trigger is not", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await expect(page.getByRole("button", { name: "Open menu" })).toBeHidden();
  // The desktop row's own links, which the sheet does not render.
  await expect(page.locator("header nav a[href='/countries']")).toBeVisible();
  await expect(page.getByRole("button", { name: "My Account" })).toBeVisible();
});
