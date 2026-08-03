/**
 * `lib/countries.ts`: the slug a country page is addressed by, and how a
 * URL gets back to the node's row.
 *
 * The suite this replaced tested `lib/data/countries.ts` — 253 rows of
 * countries with their currencies, currency names, symbols and an
 * `isRecognized` flag — and asserted properties of that table against
 * itself. What is left to test is genuinely local: a slug is this app's own
 * URL scheme, and the resolution built on it must keep every address that
 * table ever produced working.
 */
import { describe, expect, it } from "vitest";
import type { ReferenceData } from "@openfiat/sdk";

import {
  countriesUsing,
  countryBySlug,
  countrySlug,
  countryViews,
  currenciesFor,
  searchCountries,
} from "@/lib/countries";

const NODE_ANSWER: Pick<ReferenceData, "countries"> = {
  countries: [
    { code: "KE", name: "Kenya", currency: "KES", alt_currencies: [] },
    { code: "ZW", name: "Zimbabwe", currency: "ZWG", alt_currencies: ["USD", "ZAR"] },
    { code: "CI", name: "Côte d'Ivoire", currency: "XOF", alt_currencies: [] },
    { code: "DE", name: "Germany", currency: "EUR", alt_currencies: [] },
    { code: "XK", name: "Kosovo", currency: "EUR", alt_currencies: [] },
    { code: "ST", name: "São Tomé & Príncipe", currency: "STN", alt_currencies: [] },
    // A country listing its own currency as an alternate: the node is not
    // required to deduplicate for us, and a duplicate would produce a
    // `/country/x/xxx` route pointing back at the primary market.
    { code: "PA", name: "Panama", currency: "PAB", alt_currencies: ["PAB", "USD"] },
  ],
};

describe("country slugs", () => {
  it("keeps the addresses the deleted table produced", () => {
    // These URLs have been live and indexable. A slug that changed shape
    // would 404 every link to a country page anybody has ever shared.
    expect(countrySlug("Kenya")).toBe("kenya");
    expect(countrySlug("Côte d'Ivoire")).toBe("cote-d-ivoire");
    expect(countrySlug("São Tomé & Príncipe")).toBe("sao-tome-principe");
    expect(countrySlug("Bosnia & Herzegovina")).toBe("bosnia-herzegovina");
    expect(countrySlug("U.S. Virgin Islands")).toBe("u-s-virgin-islands");
  });

  it("folds diacritics rather than dropping the letters under them", () => {
    // Dropping them would give `cte-divoire`, which is not a word anybody
    // would type or recognise.
    expect(countrySlug("Réunion")).toBe("reunion");
    expect(countrySlug("Åland Islands")).toBe("aland-islands");
  });

  it("gives every country the node lists exactly one slug", () => {
    const slugs = countryViews(NODE_ANSWER).map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9-]+$/);
  });
});

describe("resolving a country from the node's answer", () => {
  it("finds a country by the slug its own name produces", () => {
    expect(countryBySlug(NODE_ANSWER, "kenya")?.code).toBe("KE");
    expect(countryBySlug(NODE_ANSWER, "cote-d-ivoire")?.currency).toBe("XOF");
  });

  it("returns nothing for a slug the node's table does not produce", () => {
    // The caller must not turn this into a 404 when the node was never
    // reached — see `app/country/[slug]/page.tsx`.
    expect(countryBySlug(NODE_ANSWER, "atlantis")).toBeUndefined();
  });

  it("lists a country's currencies primary-first, without repeating one", () => {
    const zw = countryBySlug(NODE_ANSWER, "zimbabwe")!;
    expect(currenciesFor(zw)).toEqual(["ZWG", "USD", "ZAR"]);
    // Panama's answer names PAB twice. A repeat would generate
    // `/country/panama/pab`, a second page for the primary market.
    const pa = countryBySlug(NODE_ANSWER, "panama")!;
    expect(currenciesFor(pa)).toEqual(["PAB", "USD"]);
  });
});

describe("search", () => {
  const countries = countryViews(NODE_ANSWER);

  it("matches on name, code, slug and currency code", () => {
    expect(searchCountries(countries, "kenya").map((c) => c.code)).toEqual(["KE"]);
    expect(searchCountries(countries, "ke").map((c) => c.code)).toEqual(["KE"]);
    expect(searchCountries(countries, "eur").map((c) => c.code)).toEqual(["DE", "XK"]);
  });

  it("matches a currency's name only where the node described it", () => {
    const described = new Map([["ZWG", { name: "Zimbabwe Gold" }]]);
    expect(searchCountries(countries, "gold", described).map((c) => c.code)).toEqual(["ZW"]);
    // With nothing described, the search narrows rather than breaking — the
    // control stays usable against a node that sent no currency names.
    expect(searchCountries(countries, "gold")).toEqual([]);
  });

  it("returns everything for an empty query", () => {
    expect(searchCountries(countries, "  ")).toHaveLength(countries.length);
  });
});

describe("countries using a currency", () => {
  it("counts only the country whose primary it is", () => {
    // Zimbabwe spends rand; South Africa issues it. Counting Zimbabwe would
    // put a rand market under a Zimbabwean heading.
    expect(countriesUsing(countryViews(NODE_ANSWER), "EUR")).toEqual(["Germany", "Kosovo"]);
    expect(countriesUsing(countryViews(NODE_ANSWER), "ZAR")).toEqual([]);
  });
});
