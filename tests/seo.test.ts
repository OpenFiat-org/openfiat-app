import { describe, expect, it } from "vitest";

import { localePath, hreflangLanguages, alternatesFor, SITE_ORIGIN } from "@/lib/seo";
import { LOCALE_CODES } from "@/i18n/locales";

/**
 * The per-locale SEO contract (B6). These assertions are the difference
 * between "the site has 27 languages" and "search engines know it does": a
 * wrong prefix or a missing x-default silently de-indexes every translation.
 */
describe("locale URLs", () => {
  it("leaves the default locale unprefixed and prefixes the rest", () => {
    expect(localePath("/countries", "en")).toBe("/countries");
    expect(localePath("/countries", "es")).toBe("/es/countries");
    expect(localePath("", "en")).toBe("/");
    expect(localePath("", "ar")).toBe("/ar");
  });
});

describe("hreflang alternates", () => {
  it("covers every shipped locale plus x-default", () => {
    const langs = hreflangLanguages("/countries");
    for (const code of LOCALE_CODES) {
      expect(langs[code]).toBeDefined();
    }
    expect(Object.keys(langs)).toContain("x-default");
    // x-default is the unprefixed default-locale URL — the honest answer for
    // "no declared language matched", since that is what the bare URL serves.
    expect(langs["x-default"]).toBe(`${SITE_ORIGIN}/countries`);
    expect(langs["en"]).toBe(`${SITE_ORIGIN}/countries`);
    expect(langs["es"]).toBe(`${SITE_ORIGIN}/es/countries`);
  });

  it("builds a self-referential canonical per locale", () => {
    expect(alternatesFor("/country/kenya", "de").canonical).toBe(
      `${SITE_ORIGIN}/de/country/kenya`,
    );
    expect(alternatesFor("/country/kenya", "en").canonical).toBe(
      `${SITE_ORIGIN}/country/kenya`,
    );
  });
});
