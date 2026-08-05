import { describe, expect, it } from "vitest";

import { localizedCountryName, localizedCurrencyName } from "@/lib/display-names";
import {
  formatNumber,
  formatFiat,
  formatDate,
  formatDateShort,
  sinceLabel,
} from "@/lib/format";

/**
 * The B3 free-localization layer: country/currency names from CLDR and
 * locale-aware number/date formatting, all pinned on the invariant that the
 * `en` output is byte-for-byte what shipped before — that is what lets it land
 * without touching a single existing call site or snapshot.
 */
describe("localized display names", () => {
  it("translates ISO country codes per locale", () => {
    expect(localizedCountryName("DE", "Germany", "en")).toBe("Germany");
    expect(localizedCountryName("DE", "Germany", "es")).toBe("Alemania");
    expect(localizedCountryName("US", "United States", "de")).toBe("Vereinigte Staaten");
    expect(localizedCountryName("JP", "Japan", "fr")).toBe("Japon");
  });

  it("translates ISO currency codes per locale", () => {
    expect(localizedCurrencyName("USD", "US Dollar", "en")).toBe("US Dollar");
    expect(localizedCurrencyName("USD", "US Dollar", "es")).toBe("dólar estadounidense");
    // XOF is a real ISO 4217 code (CFA franc) and localizes via CLDR.
    expect(localizedCurrencyName("XOF", "CFA Franc BCEAO", "fr")).toContain("franc CFA");
  });

  it("falls back to the node's name for pseudo-codes the CLDR cannot name", () => {
    // XNC (Northern Cyprus) and a node-invented local unit are not ISO codes.
    expect(localizedCountryName("XNC", "Northern Cyprus", "es")).toBe("Northern Cyprus");
    expect(localizedCurrencyName("SANDDOLLAR", "Sand Dollar", "de")).toBe("Sand Dollar");
  });
});

describe("locale-aware formatting keeps en byte-identical", () => {
  it("formats numbers as before for en, localizes grouping otherwise", () => {
    expect(formatNumber(33112.5)).toBe("33,112.50");
    expect(formatNumber(33112.5, 2, "en")).toBe("33,112.50");
    expect(formatNumber(33112.5, 2, "de")).toBe("33.112,50");
    expect(formatNumber(1234567, 0, "fr")).toBe("1 234 567"); // narrow no-break space
  });

  it("keeps the code suffix and localizes only the number", () => {
    expect(formatFiat(33112.5, "KES")).toBe("33,112.50 KES");
    expect(formatFiat(33112.5, "KES", 2, "de")).toBe("33.112,50 KES");
  });

  it("formats dates as before for en, deterministically and localized otherwise", () => {
    const iso = "2026-07-12T14:32:00Z";
    expect(formatDate(iso)).toBe("12 Jul 2026 · 14:32");
    expect(formatDateShort(iso)).toBe("12 Jul 2026");
    // Localized, still 24-hour and UTC-anchored (no time-zone drift).
    expect(formatDate(iso, "es")).toContain("14:32");
    expect(formatDate(iso, "es")).toContain("2026");
    expect(formatDateShort(iso, "de")).toContain("Juli");
  });

  it("keeps the exact en relative-time strings", () => {
    const now = Date.now();
    expect(sinceLabel(now)).toBe("just now");
    expect(sinceLabel(now - 5 * 60_000)).toBe("5 minutes ago");
    expect(sinceLabel(now - 3 * 3_600_000)).toBe("3 hours ago");
    // Localized path produces a real translation, not the English literal.
    expect(sinceLabel(now - 3 * 3_600_000, "es")).not.toContain("hours ago");
  });
});
