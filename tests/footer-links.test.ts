import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FOOTER_COLUMNS, SITE_URL } from "@/components/footer-links";

// Routes live under the locale segment since the i18n retrofit: a footer link
// to `/foo` is served by `app/[locale]/foo/page.tsx`, not `app/foo/page.tsx`.
const appDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "app", "[locale]");
const allLinks = FOOTER_COLUMNS.flatMap((column) => column.links);

/**
 * The external destinations the footer is allowed to name, each one checked
 * by hand before it was added here.
 *
 * A footer is among the most-crawled parts of a site, which makes it the
 * worst place to guess. Adding a URL to the footer without adding it here —
 * or adding one here without opening it — is what this list exists to make
 * awkward.
 */
const VERIFIED_EXTERNAL = new Set([
  "https://github.com/OpenFiat-org", // the public org
  "https://github.com/OpenFiat-org/openfiat-specs/discussions", // repo tab; the org-level one is not enabled
  "https://discord.gg/Ybwn3PMkQ", // invite resolves to a guild named OpenFiat
  "https://www.reddit.com/r/openfiat/", // r/openfiat
  "https://docs.openfiat.network", // Docusaurus site, "OpenFiat Docs"
  SITE_URL,
  `${SITE_URL}/how-it-works`,
  `${SITE_URL}/whitepaper`,
  `${SITE_URL}/specs`,
  `${SITE_URL}/trust`,
  `${SITE_URL}/fees`,
  `${SITE_URL}/run-a-node`,
]);

describe("footer links", () => {
  it("points every internal link at a route this app serves", () => {
    for (const link of allLinks) {
      if (link.external) continue;
      expect(link.href.startsWith("/"), link.href).toBe(true);
      const page = path.join(appDir, link.href.slice(1), "page.tsx");
      expect(existsSync(page), `${link.href} → ${page}`).toBe(true);
    }
  });

  it("names only external destinations that have been checked", () => {
    for (const link of allLinks) {
      if (!link.external) continue;
      expect(link.href.startsWith("https://"), link.href).toBe(true);
      expect(VERIFIED_EXTERNAL.has(link.href), link.href).toBe(true);
    }
  });

  it("lists each destination once, under a heading", () => {
    const hrefs = allLinks.map((link) => link.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const column of FOOTER_COLUMNS) {
      expect(column.titleKey.trim()).toBeTruthy();
      expect(column.links.length).toBeGreaterThan(0);
    }
  });

  it("uses the same column headings as openfiat.network", () => {
    // Headings are message keys now; the English strings live in messages/en.json
    // under the `footer` namespace. The site carries one more, Project, for
    // pages about the project itself.
    expect(FOOTER_COLUMNS.map((column) => column.titleKey)).toEqual([
      "protocol",
      "participate",
      "network",
      "community",
    ]);
  });

  it("labels every link", () => {
    // A link is labelled either by a message key (translated) or by a literal
    // (a brand name like GitHub that reads the same in every language) — never
    // neither, or it renders blank.
    for (const link of allLinks) {
      expect((link.labelKey ?? link.label ?? "").trim(), link.href).toBeTruthy();
    }
  });
});
