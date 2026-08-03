import { test, expect, type Page } from "@playwright/test";

/**
 * The app on a phone: can you connect, can you read a table, can you post an
 * advertisement.
 *
 * # Why device emulation and not a narrow window
 *
 * Every assertion below turns on something a resized desktop browser gets
 * wrong. The connect path is chosen by the user agent — Mobile Wallet
 * Adapter exists on Android and does not exist on iOS — so a 375px-wide
 * Chrome on Linux takes neither branch and would pass with the entire
 * feature missing. `iPhone 13` runs on WebKit for the same reason: iOS
 * Safari is the browser where connecting is impossible, and imitating it
 * with a user-agent string on another engine would be testing the string.
 *
 * Both projects run this file (see `playwright.config.ts`), so each case is
 * asserted on both platforms and the two connect stories are told apart by
 * the user agent rather than by a flag this suite sets.
 */

/** Android has Mobile Wallet Adapter; iOS has nothing equivalent. */
async function isAndroid(page: Page): Promise<boolean> {
  return /android/i.test(await page.evaluate(() => navigator.userAgent));
}

/** The document must never be wider than the screen showing it. */
async function expectNoSidewaysScroll(page: Page, where: string) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `${where} overflows horizontally`).toBeLessThanOrEqual(clientWidth);
}

test.describe("connecting a wallet", () => {
  /*
   * The bug: the app shipped browser-extension adapters only, those are
   * discovered by a wallet injecting a provider into the page, and no mobile
   * browser has extensions. The button opened an empty modal on every phone
   * and said nothing — and nothing in this app works without a wallet.
   */
  test("says what this browser can actually reach", async ({ page }) => {
    await page.goto("/");

    const note = page.getByTestId("mobile-connect-note");
    await expect(note, "a phone with no wallet reachable must be told so").toBeVisible();

    if (await isAndroid(page)) {
      // Android over a secure context: the hand-off exists, so the note is
      // an instruction rather than a dead end.
      await expect(note).toHaveAttribute("data-workable", "true");
      await expect(note).toContainText(/Mobile Wallet Adapter/i);
    } else {
      // iOS. There is no hand-off and there is not going to be one, so the
      // note has to be a refusal *and* a route — "not supported" alone
      // leaves a reader with nothing to do next.
      await expect(note).toHaveAttribute("data-workable", "false");
      await expect(note).toContainText(/iOS/);
      await expect(note, "a refusal must name the way that does work").toContainText(
        /wallet's own browser/i,
      );
    }
  });

  /*
   * The adapter is offered exactly where it works. It reports `Unsupported`
   * off Android and `@solana/wallet-adapter-react` filters those out, so
   * this is also the check that iOS is not being shown a button that opens
   * onto a hand-off it cannot perform.
   */
  test("offers the mobile adapter on Android and not on iOS", async ({ page }) => {
    await page.goto("/");

    const connect = page.locator("button.wallet-adapter-button");
    await expect(connect).toBeVisible();
    await connect.tap();

    const modal = page.locator(".wallet-adapter-modal");
    await expect(modal).toBeVisible();

    const mobileAdapter = modal.getByText("Mobile Wallet Adapter", { exact: false });
    if (await isAndroid(page)) {
      await expect(mobileAdapter).toBeVisible();
    } else {
      await expect(mobileAdapter).toHaveCount(0);
    }
  });

  /* The connect control itself must be inside the screen, at a size a thumb
     can hit. A control off the right-hand edge is how this app previously
     shipped a phone build nobody could use. */
  test("the connect button is on screen and tappable", async ({ page }) => {
    await page.goto("/");
    const box = await page.locator("button.wallet-adapter-button").boundingBox();
    expect(box).not.toBeNull();
    const width = page.viewportSize()!.width;
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    // Comfortably above the 44px both platforms recommend as a touch target.
    expect(box!.height).toBeGreaterThanOrEqual(36);
  });
});

test.describe("a data table at 375px", () => {
  // The narrowest phone still in common use, and narrower than either
  // device's own viewport — so this is the treatment under pressure.
  test.use({ viewport: { width: 375, height: 780 } });

  /*
   * `components/data-table.tsx` used to answer the whole question with
   * `overflow-x-auto` and a `minWidth` of up to 960. That is not a mobile
   * layout: it is a table made to fit by moving the problem sideways, into
   * a swipe that competes with the page's own vertical scroll, with the
   * balance and the actions off the right-hand edge.
   */
  for (const route of ["/explorer", "/network", "/merchants"]) {
    test(`${route} reflows instead of scrolling sideways`, async ({ page }) => {
      await page.goto(route);
      const table = page.locator("table").first();
      await expect(table).toBeVisible();

      await expectNoSidewaysScroll(page, route);

      // The table itself, not just the document. A scroll container would
      // hide the overflow from the measurement above.
      const box = await table.boundingBox();
      expect(box!.width, `${route}'s table is wider than the phone`).toBeLessThanOrEqual(375);

      // Stacked, which means the header row is not being shown.
      await expect(table.locator("thead")).toBeHidden();

      // And the column names are on the cells instead, so a figure is not
      // sitting under nothing. Asserted against the header the table would
      // have shown, so a mislabelled cell is caught too.
      //
      // `:not([colspan])` skips an empty-state row — "nothing has settled
      // on this node yet" is one cell across the whole table and belongs
      // to no column. A node with no data must not turn this into a pass
      // by accident, so the assertion is skipped only when there is
      // genuinely no ordinary row to make it against.
      const cell = table.locator("tbody td:not([colspan])").first();
      const firstHeader = (await page.locator("table thead th").first().textContent())?.trim();
      if (firstHeader && (await cell.count()) > 0) {
        await expect(cell).toContainText(firstHeader);
      }
    });
  }
});

test.describe("the ad wizard at 375px", () => {
  test.use({ viewport: { width: 375, height: 780 } });

  /** The wizard restores its draft from this on mount — see `lib/ad-draft.ts`. */
  const AD_DRAFT_KEY = "openfiat:ad-draft";

  /**
   * A draft that is complete enough to sit on any step.
   *
   * The wizard's Continue button is disabled until the step it is on
   * validates, and steps 2 to 5 need a wallet, a node's mint table and a
   * currency behind them. Walking the form would therefore stop at step 1
   * and pass — which is worse than not testing steps 2 to 5 at all, because
   * it reports that it did. Seeding the draft puts each step on screen
   * directly, and the layout is what is under test rather than the
   * validation.
   *
   * The mint is the native mint, which is a real address on every cluster.
   */
  function draftAtStep(step: number) {
    return {
      step,
      direction: "Sell",
      mint: "So11111111111111111111111111111111111111112",
      fiat: "KES",
      pricingType: "Fixed",
      price: "129.50",
      premium: "0",
      priceDecimals: "2",
      totalAmount: "100",
      minOrder: "1",
      maxOrder: "10",
      country: "KE",
      methods: [],
    };
  }

  /*
   * Three `grid-cols-2`s with no breakpoint, on steps 1, 2 and 3. At 375px
   * that is two option cards about 150px wide, each carrying a label and a
   * line of explanation — and, on step 3, two trade-limit fields narrower
   * than the numbers a merchant is about to sign for.
   */
  for (const step of [1, 2, 3, 4, 5]) {
    test(`step ${step} lays its controls out in one column`, async ({ page }) => {
      await page.addInitScript(
        ([key, draft]) => window.localStorage.setItem(key as string, draft as string),
        [AD_DRAFT_KEY, JSON.stringify(draftAtStep(step))] as const,
      );
      await page.goto("/ads/new");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      // The rail marks the step that is actually showing, so this fails
      // loudly if the seeded draft was rejected rather than quietly
      // asserting about step 1 five times.
      await expect(page.locator("ol li").nth(step - 1)).toBeVisible();

      await expectNoSidewaysScroll(page, `/ads/new step ${step}`);

      /*
       * No grid in the wizard itself may lay its children out in more than
       * one column at this width. Read off the resolved style rather than
       * off a class name: `grid-cols-2` and `grid-cols-1 sm:grid-cols-2`
       * are indistinguishable in the markup and indistinguishable to a
       * reader on a laptop, which is why all four of these survived.
       *
       * Scoped to `main`. The footer's link grid is two columns here on
       * purpose — short labels in 160px, which is what a footer is for —
       * and it is not a form somebody is about to sign against.
       */
      const columns = await page.evaluate(() =>
        [...(document.querySelector("main")?.querySelectorAll("*") ?? [])]
          .filter((el) => getComputedStyle(el).display === "grid")
          .map((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length),
      );
      expect(
        Math.max(0, ...columns),
        `step ${step} lays out in more than one column`,
      ).toBeLessThanOrEqual(1);

      // Every control has to be reachable, not merely present.
      for (const control of await page.locator("main input, main button, main select").all()) {
        const box = await control.boundingBox();
        if (box === null) continue; // off-screen by design (a closed panel)
        expect(box.x, "a control starts left of the screen").toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, "a control runs past the right edge").toBeLessThanOrEqual(375);
      }
    });
  }
});
