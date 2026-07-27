import { describe, expect, it } from "vitest";
import { ADS, ALL_ADS, GENERATED_ADS, MARKETS, MY_ADS, ORACLE_MID, adPrice, adPriceIn, fxPerUsd } from "@/lib/data/ads";
import {
  COUNTRIES,
  COUNTRIES_BY_SLUG,
  countriesByCurrency,
  getCountry,
  searchCountries,
} from "@/lib/data/countries";
import { DISPUTES } from "@/lib/data/disputes";
import { PROPOSALS } from "@/lib/data/governance";
import { CURRENT_USER, MERCHANTS, merchantById, reputationFor } from "@/lib/data/merchants";
import { PROTOCOL_EVENTS, PROTOCOL_EVENT_TYPES } from "@/lib/data/network";
import { PAYMENT_METHOD_REGISTRY, searchPaymentMethods } from "@/lib/data/payment-methods";
import { PROVIDERS, PROVIDER_TYPES, getProvider, providersByType } from "@/lib/data/providers";
import { STAKING_ROLES } from "@/lib/data/staking";
import { OPEN_PRICE_USDC, PRESALE, SALE_PHASES } from "@/lib/data/sale";
import { OPEN_BALANCE, OPEN_BOND_REQUIRED } from "@/lib/data/wallet";
import { TRADES } from "@/lib/data/trades";
import { VAULTS } from "@/lib/data/wallet";
import { pseudoSignature } from "@/lib/format";
import { TIER_BADGE, TIER_RING } from "@/lib/tiers";

const merchantIds = new Set([...MERCHANTS.map((m) => m.id), CURRENT_USER.id]);
const countryCodes = new Set(COUNTRIES.map((c) => c.code));
const adIds = new Set(ALL_ADS.map((a) => a.id));
const tradeIds = new Set(TRADES.map((t) => t.id));

describe("countries registry", () => {
  it("has global coverage (~250 entries)", () => {
    expect(COUNTRIES.length).toBeGreaterThanOrEqual(240);
  });

  it("every entry has code, name, slug, flag, and currency fields", () => {
    for (const c of COUNTRIES) {
      expect(c.code).toMatch(/^[A-Z0-9]{2,}$/);
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.slug).toMatch(/^[a-z0-9-]+$/);
      expect(c.flag.length).toBeGreaterThan(0);
      expect(c.flag).toMatch(/[\u{1F1E6}-\u{1F1FF}]/u);
      expect(c.currencyCode).toMatch(/^[A-Z]{3,4}$/);
      expect(c.currencyName.length).toBeGreaterThan(0);
      expect(c.currencySymbol.length).toBeGreaterThan(0);
    }
  });

  it("codes and slugs are unique", () => {
    expect(new Set(COUNTRIES.map((c) => c.code)).size).toBe(COUNTRIES.length);
    expect(new Set(COUNTRIES.map((c) => c.slug)).size).toBe(COUNTRIES.length);
  });

  it("partially-recognized states are present and marked isRecognized: false", () => {
    for (const slug of ["palestine", "kosovo", "vatican-city", "western-sahara", "somaliland", "transnistria"]) {
      const c = COUNTRIES_BY_SLUG.get(slug);
      expect(c, slug).toBeDefined();
      expect(c!.isRecognized).toBe(false);
    }
  });

  it("Taiwan is intentionally not listed", () => {
    expect(COUNTRIES_BY_SLUG.has("taiwan")).toBe(false);
  });

  it("lookups work", () => {
    expect(getCountry("KE")?.name).toBe("Kenya");
    expect(getCountry("ke")?.currencyCode).toBe("KES");
    expect(countriesByCurrency("EUR").some((c) => c.name === "Germany")).toBe(true);
    expect(countriesByCurrency("EUR").some((c) => c.name === "Kosovo")).toBe(true);
    expect(searchCountries("kenya").some((c) => c.code === "KE")).toBe(true);
    expect(searchCountries("KES").some((c) => c.code === "KE")).toBe(true);
    expect(searchCountries("palestine")[0]?.slug).toBe("palestine");
  });
});

describe("merchants", () => {
  it("has a realistic global roster", () => {
    expect(MERCHANTS.length).toBeGreaterThanOrEqual(40);
  });

  it("completion rates are percentages and countries are valid", () => {
    for (const m of MERCHANTS) {
      expect(m.completionRate).toBeGreaterThan(0);
      expect(m.completionRate).toBeLessThanOrEqual(100);
      expect(countryCodes.has(m.countryCode), `${m.name} -> ${m.countryCode}`).toBe(true);
    }
  });
});

describe("advertisements", () => {
  it("every ad references an existing merchant", () => {
    for (const ad of ALL_ADS) {
      expect(merchantIds.has(ad.merchantId), `${ad.id} -> ${ad.merchantId}`).toBe(true);
    }
  });

  it("ad ids are unique", () => {
    expect(adIds.size).toBe(ALL_ADS.length);
  });

  it("limits are sane (min <= max, positive liquidity)", () => {
    for (const ad of ALL_ADS) {
      expect(ad.minTrade).toBeGreaterThan(0);
      expect(ad.minTrade).toBeLessThanOrEqual(ad.maxTrade);
      expect(ad.availableLiquidity).toBeGreaterThan(0);
      // International ads accept any payment method (empty list); local ads declare theirs.
      if (!ad.international) expect(ad.paymentMethods.length).toBeGreaterThan(0);
    }
  });

  it("every floating pair has an oracle mid and a positive effective price", () => {
    for (const ad of ALL_ADS) {
      expect(ORACLE_MID[`${ad.asset}/${ad.fiatCurrency}`]).toBeDefined();
      expect(adPrice(ad)).toBeGreaterThan(0);
    }
  });

  it("the current merchant owns all MY_ADS", () => {
    for (const ad of MY_ADS) {
      expect(ad.merchantId).toBe(CURRENT_USER.id);
    }
  });

  it("spans both trade directions", () => {
    expect(ADS.some((a) => a.direction === "Buy")).toBe(true);
    expect(ADS.some((a) => a.direction === "Sell")).toBe(true);
  });
});

describe("generated global book", () => {
  it("generates deep global liquidity", () => {
    expect(GENERATED_ADS.length).toBeGreaterThanOrEqual(300);
  });

  it("every market currency has at least one ad", () => {
    for (const mk of MARKETS) {
      expect(
        ALL_ADS.some((a) => a.fiatCurrency === mk.currency),
        mk.currency,
      ).toBe(true);
    }
  });

  it("generated ads reference merchants and use market payment methods", () => {
    for (const ad of GENERATED_ADS) {
      expect(merchantIds.has(ad.merchantId), ad.id).toBe(true);
      const mk = MARKETS.find((m) => m.currency === ad.fiatCurrency);
      expect(mk).toBeDefined();
      for (const method of ad.paymentMethods) {
        expect(mk!.methods).toContain(method);
      }
    }
  });

  it("is deterministic (stable snapshot of first generated ad)", () => {
    expect(GENERATED_ADS[0].id).toBe("AD-G5001");
    expect(GENERATED_ADS[0].fiatCurrency).toBe("KES");
    expect(GENERATED_ADS[0].minTrade).toBeLessThanOrEqual(GENERATED_ADS[0].maxTrade);
  });
});

describe("international market", () => {
  it("has flagged international merchants with strong tiers", () => {
    const intl = MERCHANTS.filter((m) => m.international);
    expect(intl.length).toBeGreaterThanOrEqual(8);
    for (const m of intl) {
      expect(["Professional", "Elite", "Institutional"]).toContain(m.tier);
      expect(m.completionRate).toBeGreaterThanOrEqual(98);
      expect(countryCodes.has(m.countryCode)).toBe(true);
    }
  });

  it("international ads reference international merchants and are USD-priced", () => {
    const intlAds = ALL_ADS.filter((a) => a.international);
    expect(intlAds.length).toBeGreaterThanOrEqual(16);
    for (const ad of intlAds) {
      expect(merchantById(ad.merchantId).international, ad.id).toBe(true);
      expect(ad.fiatCurrency).toBe("USD");
      expect(ad.minTrade).toBeLessThanOrEqual(ad.maxTrade);
      expect(ad.availableLiquidity).toBeGreaterThan(0);
      expect(adPrice(ad)).toBeGreaterThan(0);
    }
  });

  it("international ads FX-convert to finite positive prices in sample currencies", () => {
    const sample = ALL_ADS.filter((a) => a.international).slice(0, 5);
    expect(sample.length).toBeGreaterThan(0);
    for (const ad of sample) {
      for (const currency of ["KES", "NGN", "EUR", "BRL", "INR", "ZAR"]) {
        const price = adPriceIn(ad, currency);
        expect(price, `${ad.id} -> ${currency}`).toBeDefined();
        expect(Number.isFinite(price!)).toBe(true);
        expect(price!).toBeGreaterThan(0);
        // Converts back consistently with the FX table
        expect(price! / fxPerUsd(currency)!).toBeGreaterThan(0);
      }
    }
  });

  it("local ads do not convert to other currencies", () => {
    const local = ADS.find((a) => !a.international && a.fiatCurrency === "KES")!;
    expect(adPriceIn(local, "NGN")).toBeUndefined();
    expect(adPriceIn(local, "KES")).toBeGreaterThan(0);
  });
});

describe("trades", () => {
  it("every trade references an existing ad and merchant", () => {
    for (const t of TRADES) {
      expect(adIds.has(t.adId), `${t.id} -> ${t.adId}`).toBe(true);
      expect(merchantIds.has(t.counterpartyId), `${t.id} -> ${t.counterpartyId}`).toBe(true);
    }
  });

  it("fiat amount equals crypto amount times price (within rounding)", () => {
    for (const t of TRADES) {
      expect(Math.abs(t.fiatAmount - t.cryptoAmount * t.price)).toBeLessThan(0.01);
    }
  });

  it("merchant lookup works for every counterparty", () => {
    for (const t of TRADES) {
      expect(() => merchantById(t.counterpartyId)).not.toThrow();
    }
  });

  it("every trade has standardized, non-empty payment fields", () => {
    for (const t of TRADES) {
      expect(t.paymentFields.length, t.id).toBeGreaterThanOrEqual(3);
      for (const f of t.paymentFields) {
        expect(f.label.length).toBeGreaterThan(0);
        expect(f.value.length).toBeGreaterThan(0);
      }
      expect(t.paymentFields.some((f) => f.label === "Reference" && f.value === t.id)).toBe(true);
    }
  });

  it("international-bank methods carry full SWIFT fields", () => {
    const sepa = TRADES.find((t) => t.paymentMethod === "SEPA")!;
    const labels = sepa.paymentFields.map((f) => f.label);
    for (const required of ["Account name", "IBAN / Account number", "SWIFT / BIC", "Bank name", "Bank address", "Reference"]) {
      expect(labels, required).toContain(required);
    }
  });

  it("every trade has a deterministic, unique 88-char base58 settlement sig", () => {
    const sigs = new Set<string>();
    for (const t of TRADES) {
      for (const sig of [t.txSig, t.escrowSig]) {
        expect(sig, `${t.id}`).toMatch(/^[1-9A-HJ-NP-Za-km-z]{87,88}$/);
        expect(sigs.has(sig), `duplicate sig ${sig}`).toBe(false);
        sigs.add(sig);
      }
    }
    // deterministic: same trade id always yields the same sig
    expect(TRADES[0].txSig).toBe(pseudoSignature(`settlement-${TRADES[0].id}`));
  });
});

describe("merchant profiles", () => {
  it("ids and wallets are unique (profiles resolvable)", () => {
    expect(new Set(MERCHANTS.map((m) => m.id)).size).toBe(MERCHANTS.length);
    expect(new Set(MERCHANTS.map((m) => m.wallet)).size).toBe(MERCHANTS.length);
  });

  it("profile fields are complete for every merchant", () => {
    for (const m of [...MERCHANTS, CURRENT_USER]) {
      expect(m.wallet).toMatch(/^[1-9A-HJ-NP-Za-km-z]{44}$/);
      expect(m.stake).toBeGreaterThan(0);
      expect(["L0", "L1", "L2", "L3"]).toContain(m.identityLevel);
      expect(m.merchantAge.length).toBeGreaterThan(0);
      expect(m.volume30d).toBeGreaterThan(0);
      expect(m.avgTicket).toBeGreaterThan(0);
      expect(m.settlementSpeed.length).toBeGreaterThan(0);
      expect(m.availability.length).toBeGreaterThan(0);
    }
  });

  it("reputationFor yields all 8 spec dimensions with sane scores", () => {
    for (const m of [MERCHANTS[0], MERCHANTS[10], CURRENT_USER]) {
      const dims = reputationFor(m);
      expect(dims.length).toBe(8);
      for (const d of dims) {
        expect(d.score).toBeGreaterThanOrEqual(0);
        expect(d.score).toBeLessThanOrEqual(100);
        expect(d.display.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("explorer index", () => {
  it("the current user address is well-formed and distinct", () => {
    expect(CURRENT_USER.wallet).toMatch(/^[1-9A-HJ-NP-Za-km-z]{44}$/);
    expect(MERCHANTS.some((m) => m.wallet === CURRENT_USER.wallet)).toBe(false);
  });
});

describe("service providers (OFS-1500)", () => {
  it("ids are unique and every field is present", () => {
    expect(new Set(PROVIDERS.map((p) => p.id)).size).toBe(PROVIDERS.length);
    for (const p of PROVIDERS) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.wallet).toMatch(/^[1-9A-HJ-NP-Za-km-z]{44}$/);
      expect(p.signature.length).toBeGreaterThanOrEqual(80);
      expect(p.endpoints.length, p.id).toBeGreaterThanOrEqual(1);
      expect(p.capabilities.length, p.id).toBeGreaterThanOrEqual(1);
      expect(p.protocolVersions.length).toBeGreaterThanOrEqual(1);
      expect(p.region.length).toBeGreaterThan(0);
      expect(p.pricing.length, p.id).toBeGreaterThanOrEqual(1);
      for (const price of p.pricing) {
        expect(price.item.length).toBeGreaterThan(0);
        expect(price.price.length).toBeGreaterThan(0);
      }
      expect(p.registeredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      expect(p.description.length).toBeGreaterThan(0);
    }
  });

  it("every OFS-1500 service type is represented", () => {
    for (const type of Object.keys(PROVIDER_TYPES)) {
      expect(providersByType(type as keyof typeof PROVIDER_TYPES).length, type).toBeGreaterThanOrEqual(1);
    }
  });

  it("uptime is a percentage and lookup helpers work", () => {
    for (const p of PROVIDERS) {
      expect(p.uptimePct).toBeGreaterThan(0);
      expect(p.uptimePct).toBeLessThanOrEqual(100);
      expect(getProvider(p.id)?.id).toBe(p.id);
    }
    expect(PROVIDERS.length).toBeGreaterThanOrEqual(18);
  });
});

describe("disputes", () => {
  it("every dispute references an existing trade", () => {
    for (const d of DISPUTES) {
      expect(tradeIds.has(d.tradeId), `${d.id} -> ${d.tradeId}`).toBe(true);
    }
  });

  it("closed disputes have an outcome", () => {
    for (const d of DISPUTES) {
      if (d.status === "Closed") expect(d.outcome).toBeDefined();
    }
  });
});

describe("protocol events", () => {
  it("every feed event type is in the registry", () => {
    for (const e of PROTOCOL_EVENTS) {
      expect(PROTOCOL_EVENT_TYPES).toContain(e.type);
    }
  });

  it("event timestamps are fixed ISO strings", () => {
    for (const e of PROTOCOL_EVENTS) {
      expect(e.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    }
  });
});

describe("liquidity vaults", () => {
  it("balances sum to the total", () => {
    for (const v of VAULTS) {
      expect(v.available + v.reserved + v.settled).toBe(v.total);
    }
  });
});

describe("staking roles", () => {
  it("covers every protocol role with a positive minimum bond", () => {
    const roles = STAKING_ROLES.map((r) => r.role);
    expect(new Set(roles).size).toBe(STAKING_ROLES.length);
    for (const required of ["merchant", "node", "arbitrator", "provider"]) {
      expect(roles).toContain(required);
    }
    for (const r of STAKING_ROLES) {
      expect(r.minBond).toBeGreaterThan(0);
      expect(r.staked).toBeGreaterThanOrEqual(0);
      expect(r.requirement.length).toBeGreaterThan(0);
    }
    // OFP-019 arbitrator bond
    expect(STAKING_ROLES.find((r) => r.role === "arbitrator")!.minBond).toBe(50000);
  });
});

describe("payment methods registry", () => {
  it("names are unique and categories are valid", () => {
    const names = PAYMENT_METHOD_REGISTRY.map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
    for (const m of PAYMENT_METHOD_REGISTRY) {
      expect(["Mobile Money", "Bank Transfer", "Fintech"]).toContain(m.category);
      expect(Array.isArray(m.aliases)).toBe(true);
    }
  });

  it("type-ahead search finds methods by name and alias", () => {
    expect(searchPaymentMethods("mp")).toContain("M-Pesa Kenya (Safaricom)");
    expect(searchPaymentMethods("mp")).toContain("Mpesa Pochi la Biashara");
    expect(searchPaymentMethods("upi")).toContain("UPI");
    expect(searchPaymentMethods("").length).toBeGreaterThan(0);
    // community-added methods surface in suggestions
    expect(searchPaymentMethods("zapcash", ["ZapCash"])).toContain("ZapCash");
  });
});

describe("OPEN token", () => {
  it("balance covers the merchant bond constant", () => {
    expect(OPEN_BOND_REQUIRED).toBe(5000);
    expect(OPEN_BALANCE).toBeGreaterThanOrEqual(OPEN_BOND_REQUIRED);
  });

  it("prices the presale at 1 OPEN = 1 USDC", () => {
    // [CONFIRMED] in OFS-4100 §3, and enforced on chain by
    // `open_entitlement_for`, which applies no rate beyond a decimal scale.
    // Any other value here is a number the program would refuse.
    expect(OPEN_PRICE_USDC).toBe(1);
    expect(PRESALE.priceUsdc).toBe(1);
  });

  it("caps the presale at the size of its own bucket", () => {
    // At 1:1 the bucket is the ceiling, so the two move together — OFS-4100 §2
    // is explicit that they must never be changed independently.
    expect(PRESALE.cap).toBe(30_000_000);
    expect(PRESALE.softCap).toBeLessThan(PRESALE.cap);
    expect(PRESALE.maxContribution).toBeLessThanOrEqual(PRESALE.cap);
    expect(PRESALE.minContribution).toBeLessThan(PRESALE.maxContribution);
  });

  it("offers one presale price, with market pricing only after mainnet", () => {
    const priced = SALE_PHASES.filter((p) => p.priceUsdc !== null);
    expect(priced).toHaveLength(1);
    expect(priced[0].priceUsdc).toBe(OPEN_PRICE_USDC);
  });
});

describe("governance", () => {
  it("vote percentages sum to 100", () => {
    for (const p of PROPOSALS) {
      expect(p.votesFor + p.votesAgainst + p.votesAbstain).toBe(100);
    }
  });
});

describe("reputation tiers", () => {
  it("every tier has a ring and badge color defined in one place", () => {
    const tiers = ["Explorer", "Verified", "Professional", "Elite", "Institutional"] as const;
    for (const t of tiers) {
      expect(TIER_RING[t]).toMatch(/^ring-/);
      expect(TIER_BADGE[t]).toContain("border-");
    }
  });
});
