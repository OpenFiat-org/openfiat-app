import { describe, expect, it } from "vitest";
import { ADS, ALL_ADS, GENERATED_ADS, MARKETS, MY_ADS, ORACLE_MID, adPrice, adPriceIn, fxPerUsd, paymentMethodsForCurrency } from "@/lib/data/ads";
import {
  COUNTRIES,
  COUNTRIES_BY_SLUG,
  countriesByCurrency,
  currenciesFor,
  getCountry,
  searchCountries,
} from "@/lib/data/countries";
import { DISPUTES, DISPUTE_OUTCOMES } from "@/lib/data/disputes";
import { DISPUTE_STAGES, disputeStageIndex, evidenceVisible, isDisputeParty } from "@/lib/types";
import { PROPOSALS } from "@/lib/data/governance";
import { CATEGORY_RULES, PROPOSAL_STAKE_DEPOSIT_OPEN } from "@/lib/governance";
import { CURRENT_USER, MERCHANTS, merchantById, reputationFor } from "@/lib/data/merchants";
import { NETWORK_NODES, PROTOCOL_EVENTS, PROTOCOL_EVENT_TYPES } from "@/lib/data/network";
import { connectableNodes, defaultNode } from "@/lib/node-preference";
import { PAYMENT_METHOD_REGISTRY, searchPaymentMethods } from "@/lib/data/payment-methods";
import { PROVIDERS, PROVIDER_TYPES, getProvider, providersByType } from "@/lib/data/providers";
import { STAKING_ROLES } from "@/lib/data/staking";
import { OPEN_PRICE_USDC, PRESALE, PUBLIC_SALE_PRICE_USDC, SALE_PHASES } from "@/lib/data/sale";
import { OPEN_BALANCE, OPEN_BOND_REQUIRED } from "@/lib/data/wallet";
import { TRADES } from "@/lib/data/trades";
import { VAULTS } from "@/lib/data/wallet";
import qr from "qrcode-generator";
import { pseudoAddress, pseudoSignature } from "@/lib/format";
import { REVIEWS, reviewsFor } from "@/lib/data/reviews";
import { lifetimeOrders, ratingFor, recentOrders, verifications } from "@/lib/merchant-profile";
import { PAIRS, findPair } from "@/lib/pairs";
import { compositeScore } from "@/lib/reputation";
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

  it("Taiwan is listed, on the same footing as Hong Kong and Macau", () => {
    // This assertion previously required Taiwan to be absent. It is listed now
    // on an explicit product decision. `isRecognized: false` records
    // non-UN-membership and nothing else — the same value Hong Kong and Macau
    // carry — and the flag is never used to hide or relabel an entry.
    const tw = COUNTRIES_BY_SLUG.get("taiwan");
    expect(tw).toBeDefined();
    expect(tw!.currencyCode).toBe("TWD");
    expect(tw!.isRecognized).toBe(false);
    expect(COUNTRIES_BY_SLUG.get("hong-kong")?.isRecognized).toBe(false);
  });

  it("Taiwan has a market, so its page is not a bank-transfer fallback", () => {
    expect(paymentMethodsForCurrency("TWD")).toContain("JKOPay");
    expect(paymentMethodsForCurrency("TWD")).not.toEqual(["Bank Transfer"]);
  });

  it("Hong Kong and Macau carry their own local rails", () => {
    // Both were reachable before but had nothing local: HKD listed a bare
    // "FPS" plus Wise, and MOP had no market at all, so Macau fell through to
    // the generic ["Bank Transfer"] default.
    const hkd = paymentMethodsForCurrency("HKD");
    expect(hkd).toContain("PayMe");
    expect(hkd).toContain("FPS (Faster Payment System)");

    const mop = paymentMethodsForCurrency("MOP");
    expect(mop).toContain("MPay");
    expect(mop).not.toEqual(["Bank Transfer"]);
  });

  it("records countries that trade in more than one currency", () => {
    // A single currencyCode per country is wrong where it matters most: in a
    // dollarised economy the USD leg is often the larger P2P market, and
    // offering only the local currency hides it.
    for (const slug of ["zimbabwe", "lebanon", "cambodia", "panama"]) {
      const c = COUNTRIES_BY_SLUG.get(slug);
      expect(c, slug).toBeDefined();
      expect(c?.altCurrencies, slug).toContain("USD");
      expect(currenciesFor(c!)[0], slug).toBe(c!.currencyCode);
      expect(currenciesFor(c!).length, slug).toBeGreaterThan(1);
    }
    // Palestine's entry noted "JOD also used" in prose with nowhere structured
    // to put it.
    expect(COUNTRIES_BY_SLUG.get("palestine")?.altCurrencies).toContain("JOD");
  });

  it("never repeats a country's primary currency in its alternates", () => {
    for (const c of COUNTRIES) {
      const all = currenciesFor(c);
      expect(new Set(all).size, c.name).toBe(all.length);
    }
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

describe("merchant reviews", () => {
  it("only exists for merchants that were written, not all of them", () => {
    // Ratings are derived; reviews are prose and cannot be. Two merchants have
    // them as a sample rather than forty having fabricated testimony.
    const withReviews = new Set(REVIEWS.map((r) => r.merchantId));
    expect(withReviews.size).toBe(2);
    for (const id of withReviews) {
      expect(merchantIds.has(id), id).toBe(true);
    }
  });

  it("never claims more written reviews than total ratings", () => {
    // Most people rate without commenting, so the written subset must be the
    // smaller of the two — the reverse would be incoherent.
    for (const id of new Set(REVIEWS.map((r) => r.merchantId))) {
      const merchant = merchantById(id);
      expect(reviewsFor(id).length, id).toBeLessThan(ratingFor(merchant).count);
    }
  });

  it("includes negative reviews, since a page of praise says nothing", () => {
    for (const id of new Set(REVIEWS.map((r) => r.merchantId))) {
      expect(reviewsFor(id).some((r) => !r.positive), id).toBe(true);
    }
  });

  it("returns reviews newest first", () => {
    for (const id of new Set(REVIEWS.map((r) => r.merchantId))) {
      const list = reviewsFor(id);
      for (let i = 1; i < list.length; i++) {
        expect(list[i - 1].at >= list[i].at, id).toBe(true);
      }
    }
  });
});

describe("merchant profile figures", () => {
  it("splits orders without inventing or losing any", () => {
    for (const m of MERCHANTS) {
      const life = lifetimeOrders(m);
      expect(life.buy + life.sell, m.name).toBe(m.orders);
      const recent = recentOrders(m);
      expect(recent.buy + recent.sell, m.name).toBe(recent.total);
    }
  });

  it("never claims more recent orders than the account has ever done", () => {
    // A desk that is months old cannot have done all its trades this month.
    for (const m of MERCHANTS) {
      expect(recentOrders(m).total, m.name).toBeLessThanOrEqual(m.orders);
    }
  });

  it("keeps ratings coherent with completion rate", () => {
    // A merchant completing 99.8% of trades with a 70% rating would be
    // incoherent, and a reader would rightly not trust either number.
    for (const m of MERCHANTS) {
      const r = ratingFor(m);
      expect(Math.abs(r.goodPct - m.completionRate), m.name).toBeLessThanOrEqual(2);
      expect(r.up + r.down, m.name).toBe(r.count);
      // Most people never leave a rating.
      expect(r.count, m.name).toBeLessThan(m.orders);
    }
  });

  it("only claims a bond when there is stake behind it", () => {
    for (const m of MERCHANTS) {
      const bonded = verifications(m).find((v) => v.label === "Bonded");
      expect(bonded?.verified, m.name).toBe(m.stake > 0);
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

describe("reputation as a trading control", () => {
  it("keeps advertiser floors modest enough to be tradeable", () => {
    // A floor that excludes every new participant costs the merchant volume,
    // so the data should not model unreachable requirements.
    const withFloor = ALL_ADS.filter((a) => a.minCounterpartyReputation !== undefined);
    expect(withFloor.length).toBeGreaterThan(0);
    for (const ad of withFloor) {
      expect(ad.minCounterpartyReputation, ad.id).toBeGreaterThanOrEqual(50);
      expect(ad.minCounterpartyReputation, ad.id).toBeLessThanOrEqual(90);
    }
  });

  it("leaves most of the book open to anyone", () => {
    // The floor is a minority behaviour. If most ads carried one, a new
    // participant could not start trading at all.
    const withFloor = ALL_ADS.filter((a) => a.minCounterpartyReputation !== undefined);
    expect(withFloor.length / ALL_ADS.length).toBeLessThan(0.5);
  });

  it("has advertisers the current user can actually trade with", () => {
    const mine = compositeScore(CURRENT_USER);
    const reachable = ALL_ADS.filter(
      (a) => a.minCounterpartyReputation === undefined || mine >= a.minCounterpartyReputation,
    );
    expect(reachable.length).toBeGreaterThan(0);
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

  it("closed disputes have an outcome and a settled escrow", () => {
    for (const d of DISPUTES) {
      if (d.stage !== "Closed") continue;
      expect(d.outcome, d.id).toBeDefined();
      expect(d.settlement, d.id).toBeDefined();
      expect(d.tally, d.id).toBeDefined();
    }
  });

  it("carries the full dispute record", () => {
    // OFS-2400 §8 enumerates what a dispute contains; a record missing the
    // reservation or advertisement cannot be audited against the trade.
    for (const d of DISPUTES) {
      for (const field of [d.id, d.tradeId, d.reservationId, d.adId, d.buyerWallet, d.merchantWallet]) {
        expect(field, d.id).toBeTruthy();
      }
      expect(DISPUTE_STAGES, d.id).toContain(d.stage);
    }
  });

  it("withholds the arbitrator threshold while a case is open", () => {
    // Chapter 11 §11.9: publishing the required count would let anyone
    // estimate the value at risk, so it is only knowable once locked.
    for (const d of DISPUTES) {
      if (d.stage === "Arbitrators Joining") expect(d.seatsRequired, d.id).toBeNull();
      else expect(d.seatsRequired, d.id).toBeGreaterThan(0);
    }
  });

  it("seals evidence from arbitrators who have not committed stake", () => {
    // §11.8 information isolation — the property that makes bribery before
    // participation pointless.
    const joining = DISPUTES.find((d) => d.stage === "Arbitrators Joining");
    expect(joining).toBeDefined();
    if (!joining) return;
    expect(joining.viewerRole).toBe("Prospective arbitrator");
    expect(evidenceVisible(joining, false)).toBe(false);
    expect(evidenceVisible(joining, true)).toBe(true);

    // Reaching a later stage does not unseal it for a passer-by. Evidence goes
    // to seated arbitrators; §13 distributes references, not contents.
    const revealing = DISPUTES.find(
      (d) => d.stage === "Reveal Phase" && !isDisputeParty(d),
    );
    expect(revealing).toBeDefined();
    if (revealing) expect(evidenceVisible(revealing, false)).toBe(false);

    // A party to the trade submitted the evidence, so sealing it from them
    // would protect nothing.
    const own = DISPUTES.find((d) => isDisputeParty(d));
    expect(own).toBeDefined();
    if (own) expect(evidenceVisible(own, false)).toBe(true);
  });

  it("decides by commit-and-reveal, never by a single named arbitrator", () => {
    for (const d of DISPUTES) {
      // More than one seat on any case that has reached voting.
      if (disputeStageIndex(d.stage) >= disputeStageIndex("Commit Phase")) {
        expect(d.arbitrators.length, d.id).toBeGreaterThan(1);
      }
      // A revealed vote always has a commitment behind it: only reveals
      // matching an earlier commitment are counted (§11.12).
      for (const a of d.arbitrators) {
        if (a.revealed) expect(a.commitment, `${d.id}/${a.id}`).toBeTruthy();
      }
    }
  });

  it("slashes minority reveals partially and rewards consensus", () => {
    const closed = DISPUTES.find((d) => d.stage === "Closed");
    expect(closed).toBeDefined();
    if (!closed) return;
    const minority = closed.arbitrators.filter((a) => a.withConsensus === false);
    const majority = closed.arbitrators.filter((a) => a.withConsensus === true);
    expect(minority.length).toBeGreaterThan(0);
    expect(majority.length).toBeGreaterThan(minority.length);
    for (const a of minority) {
      expect(a.slashed, a.id).toBeGreaterThan(0);
      // §11.16: moderate and partial — honest arbitrators sometimes disagree.
      expect(a.slashed!).toBeLessThan(a.stake);
    }
    for (const a of majority) expect(a.reward, a.id).toBeGreaterThan(0);
  });

  it("does not offer partial settlement, which the spec defers", () => {
    // OFS-2400 §17 marks Partial Settlement as future work.
    expect(DISPUTE_OUTCOMES).not.toContain("Partial Settlement");
    expect(DISPUTE_OUTCOMES).toHaveLength(4);
  });
});

describe("reputation", () => {
  it("scores the eight dimensions OFS-3000 §6 defines", () => {
    const labels = reputationFor(MERCHANTS[0]).map((d) => d.label);
    expect(labels).toEqual([
      "Settlement Speed",
      "Trade Success Rate",
      "Dispute Rate",
      "Trade Volume",
      "Average Ticket Size",
      "Merchant Age",
      "Availability",
      "Payment Accuracy",
    ]);
  });

  it("summarises conduct, not scale", () => {
    // Volume, ticket size and age describe how big a desk is, not how it
    // behaves. Averaging them in dragged a 99.8%-completion Institutional
    // merchant into the 70s, which reads as mediocre. Guard against that
    // returning: a merchant with excellent conduct must score in the top band
    // regardless of how small their tickets are.
    for (const m of MERCHANTS) {
      if (m.completionRate >= 99.5 && m.availability === "Online") {
        expect(compositeScore(m), m.name).toBeGreaterThanOrEqual(80);
      }
    }
  });

  it("tracks tier order across the roster", () => {
    const byTier = (tier: string) =>
      MERCHANTS.filter((m) => m.tier === tier).map((m) => compositeScore(m));
    const institutional = byTier("Institutional");
    const explorer = byTier("Explorer");
    if (institutional.length && explorer.length) {
      const min = (xs: number[]) => Math.min(...xs);
      const max = (xs: number[]) => Math.max(...xs);
      expect(min(institutional)).toBeGreaterThan(max(explorer));
    }
  });

  it("stays inside 0-100", () => {
    for (const m of MERCHANTS) {
      const score = compositeScore(m);
      expect(score, m.name).toBeGreaterThanOrEqual(0);
      expect(score, m.name).toBeLessThanOrEqual(100);
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

describe("pair landing pages", () => {
  it("only generates pairs that have a market behind them", () => {
    // Every asset against every currency would be a thousand-odd mostly-empty
    // pages, which dilutes the ones that rank and teaches a crawler the site is
    // thin. A pair earns a page by having advertisements.
    expect(PAIRS.length).toBeGreaterThan(0);
    for (const pair of PAIRS) {
      expect(pair.ads, pair.slug).toBeGreaterThan(0);
      expect(pair.rate, pair.slug).toBeGreaterThan(0);
      expect(pair.methods.length, pair.slug).toBeGreaterThan(0);
    }
  });

  it("covers the pairs people actually search for", () => {
    for (const slug of ["usdt/kes", "usdc/kes", "usdt/ngn", "usdt/inr", "usdt/php"]) {
      const [asset, currency] = slug.split("/");
      expect(findPair(asset, currency), slug).toBeDefined();
    }
  });

  it("rejects a pair with no market rather than rendering an empty page", () => {
    expect(findPair("usdt", "zzz")).toBeUndefined();
    expect(findPair("nope", "kes")).toBeUndefined();
  });

  it("has slugs that round-trip through the lookup", () => {
    for (const pair of PAIRS) {
      const [asset, currency] = pair.slug.split("/");
      expect(findPair(asset, currency)?.slug, pair.slug).toBe(pair.slug);
    }
  });

  it("is listed in the sitemap", async () => {
    const { default: sitemap } = await import("@/app/sitemap");
    const listed = new Set(sitemap().map((e) => new URL(e.url).pathname));
    for (const pair of PAIRS) {
      expect(listed.has(`/${pair.slug}`), pair.slug).toBe(true);
    }
  });
});

describe("sitemap coverage", () => {
  it("lists every static page route", async () => {
    // The hand-written half of the sitemap is the part that drifts: four routes
    // were live and unlisted before this test existed.
    const { default: sitemap } = await import("@/app/sitemap");
    const listed = new Set(
      sitemap().map((e) => new URL(e.url).pathname.replace(/\/$/, "") || "/"),
    );
    const staticRoutes = [
      "/",
      "/countries",
      "/open",
      "/guide",
      "/guide/buy",
      "/guide/sell",
      "/guide/merchant",
      "/disputes",
      "/governance",
      "/network",
      "/explorer",
      "/providers",
      "/providers/register",
      "/staking",
      "/staking/stake",
      "/orders",
      "/orders/new",
      "/ads",
      "/ads/new",
      "/wallet",
      "/wallet/deposit",
      "/wallet/withdraw",
      "/account/identity",
      "/account/reputation",
      "/account/counterparties",
      "/settings",
    ];
    for (const route of staticRoutes) {
      expect(listed.has(route), route).toBe(true);
    }
  });

  it("lists every country, and every extra currency it trades in", async () => {
    const { default: sitemap } = await import("@/app/sitemap");
    const listed = new Set(sitemap().map((e) => new URL(e.url).pathname));
    for (const c of COUNTRIES) {
      expect(listed.has(`/country/${c.slug}`), c.slug).toBe(true);
      for (const alt of c.altCurrencies ?? []) {
        expect(listed.has(`/country/${c.slug}/${alt.toLowerCase()}`), `${c.slug}/${alt}`).toBe(true);
      }
    }
  });

  it("has no duplicate entries", async () => {
    const { default: sitemap } = await import("@/app/sitemap");
    const urls = sitemap().map((e) => e.url);
    expect(new Set(urls).size).toBe(urls.length);
  });
});

describe("QR encoding", () => {
  it("produces a scannable grid with real finder patterns", () => {
    // The failure mode of a hand-rolled encoder is a code that looks right and
    // does not scan, which is why this uses a library — and why the structure
    // is asserted rather than assumed.
    const address = pseudoAddress("openfiat-deposit-USDT");
    const code = qr(0, "M");
    code.addData(address);
    code.make();
    const n = code.getModuleCount();
    // A 44-character payload at level M needs more than the smallest version.
    expect(n).toBeGreaterThanOrEqual(25);
    // Finder pattern: a dark 7x7 ring with a light second row inside it.
    expect(code.isDark(0, 0)).toBe(true);
    expect(code.isDark(0, 6)).toBe(true);
    expect(code.isDark(1, 1)).toBe(false);
    // Present in all three corners.
    expect(code.isDark(0, n - 1)).toBe(true);
    expect(code.isDark(n - 1, 0)).toBe(true);
  });
});

describe("access nodes", () => {
  it("only offers node roles an interface can attach to", () => {
    // The picker used to offer any Online node, which let you select a
    // notification gateway, an oracle, a snapshot host or a risk-intelligence
    // provider as your access node. Those are services nodes consume, not
    // endpoints a browser talks to.
    for (const n of connectableNodes()) {
      expect(["Full Node", "Public API Node"], n.id).toContain(n.role);
      expect(n.status, n.id).toBe("Online");
    }
  });

  it("excludes the service roles from the connectable set", () => {
    const ids = new Set(connectableNodes().map((n) => n.id));
    const services = NETWORK_NODES.filter(
      (n) => !["Full Node", "Public API Node"].includes(n.role),
    );
    expect(services.length).toBeGreaterThan(0);
    for (const s of services) expect(ids.has(s.id), s.id).toBe(false);
  });

  it("defaults to the lowest-latency connectable node", () => {
    const node = defaultNode();
    expect(node).toBeDefined();
    for (const other of connectableNodes()) {
      expect(node.latencyMs).toBeLessThanOrEqual(other.latencyMs);
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

describe("service registry", () => {
  it("carries the full OFS-1500 §5 identity", () => {
    // An endpoint URL alone proves nothing: anyone can advertise a host. A node
    // needs the peer ID it expects to handshake with and the key the
    // registration was signed under, or the registry is a list of addresses an
    // attacker can impersonate.
    for (const p of PROVIDERS) {
      expect(p.wallet, p.id).toBeTruthy();
      expect(p.peerId, p.id).toBeTruthy();
      expect(p.nodeIdentity, p.id).toBeTruthy();
      expect(p.publicKey, p.id).toBeTruthy();
      expect(p.signature, p.id).toBeTruthy();
    }
  });

  it("carries everything a registration event requires (\u00a77)", () => {
    for (const p of PROVIDERS) {
      expect(p.endpoints.length, p.id).toBeGreaterThan(0);
      expect(p.protocolVersions.length, p.id).toBeGreaterThan(0);
      expect(p.region, p.id).toBeTruthy();
      expect(p.capabilities.length, p.id).toBeGreaterThan(0);
    }
  });

  it("uses only the health states the spec defines (\u00a711)", () => {
    for (const p of PROVIDERS) {
      expect(["Online", "Maintenance", "Degraded", "Offline"], p.id).toContain(p.status);
    }
  });

  it("keeps service ids unique", () => {
    const ids = PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
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
    // Minimums must match the deployed StakingConfig on devnet, because the
    // stake form submits against that program — a wrong number here is a
    // transaction that fails on chain. Flat minimum 1,000 OPEN, arbitrator
    // 10,000 (OFS-4100 §4), notification gateway 5,000.
    const minBondFor = (role: string) =>
      STAKING_ROLES.find((r) => r.role === role)?.minBond;
    expect(minBondFor("merchant")).toBe(1000);
    expect(minBondFor("node")).toBe(1000);
    expect(minBondFor("arbitrator")).toBe(10000);
    expect(minBondFor("provider")).toBe(5000);
  });
});

describe("payment methods registry", () => {
  it("names are unique and categories are valid", () => {
    const names = PAYMENT_METHOD_REGISTRY.map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
    for (const m of PAYMENT_METHOD_REGISTRY) {
      expect(["Mobile Money", "Bank Transfer", "Fintech", "Cash"]).toContain(m.category);
      expect(Array.isArray(m.aliases)).toBe(true);
    }
  });

  it("does not confuse Hong Kong's FPS with the UK's Faster Payments", () => {
    // Different rails, different central banks, same abbreviation. "fps" used
    // to resolve to the UK entry, which would have a Hong Kong merchant
    // advertising a system they cannot receive on.
    expect(searchPaymentMethods("fps")).toContain("FPS (Faster Payment System)");
    expect(searchPaymentMethods("fps")).not.toContain("Faster Payments (UK)");
    expect(searchPaymentMethods("faster payments uk")).toContain("Faster Payments (UK)");
  });

  it("keeps Hong Kong wallets distinct from their mainland namesakes", () => {
    // An AlipayHK account cannot receive from a mainland Alipay account, so
    // the two must be separately selectable.
    const names = PAYMENT_METHOD_REGISTRY.map((m) => m.name);
    expect(names).toContain("AlipayHK");
    expect(names).toContain("Alipay");
    expect(names).toContain("WeChat Pay HK");
    expect(names).toContain("WeChat Pay");
  });

  it("offers cash in every market, and as the fallback", () => {
    // Cash is the only rail that exists everywhere, and a currency with no
    // market entry is exactly where the banking rail is least dependable — so
    // bank transfer alone is the wrong default there.
    for (const mk of MARKETS) {
      expect(mk.methods, mk.currency).toContain("Cash Deposit");
      expect(mk.methods, mk.currency).toContain("Cash in Person");
    }
    const unlisted = paymentMethodsForCurrency("XZZ");
    expect(unlisted).toContain("Cash Deposit");
    expect(unlisted).toContain("Bank Transfer");
  });

  it("covers the world's larger economies with local rails", () => {
    // Most currencies used to fall through to ["Bank Transfer"], which showed
    // no local rail at all on the majority of country pages.
    for (const code of ["KRW", "PLN", "CHF", "SEK", "KZT", "NPR", "QAR", "TND", "CRC", "NZD"]) {
      const methods = paymentMethodsForCurrency(code);
      const local = methods.filter(
        (m) => m !== "Bank Transfer" && m !== "Cash Deposit" && m !== "Cash in Person",
      );
      expect(local.length, code).toBeGreaterThan(0);
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

  it("sells the entire presale bucket toward a target, not a cap", () => {
    // OFS-4100 §2-3: the Community Presale bucket is the full 20% of supply
    // (200,000,000 OPEN), and the presale has no hard cap distinct from it —
    // it sells at 1:1 toward a $20,000,000 target that demand may exceed.
    expect(PRESALE.bucketOpen).toBe(200_000_000);
    expect(PRESALE.target).toBe(20_000_000);
    expect(PRESALE.minContribution).toBeLessThan(PRESALE.maxContribution);
    // No soft cap: with no minimum to raise there is no shortfall condition,
    // so contributions are not refundable on that ground (§3). Asserted so a
    // reintroduced figure here fails rather than quietly implying refunds.
    expect(PRESALE.softCap).toBeNull();
    // Simulated `raised` deliberately exceeds `target`, to illustrate that
    // exceeding it doesn't stop the sale — see lib/data/sale.ts.
    expect(PRESALE.raised).toBeGreaterThan(PRESALE.target);
  });

  it("offers a presale and a public-sale price, with market pricing only after mainnet", () => {
    // Two priced phases against the one bucket (OFS-4100 §3): the presale at
    // 1:1, then a Public Sale at 1.25 for whatever the presale didn't sell.
    const priced = SALE_PHASES.filter((p) => p.priceUsdc !== null);
    expect(priced).toHaveLength(2);
    expect(priced[0].priceUsdc).toBe(OPEN_PRICE_USDC);
    expect(priced[1].priceUsdc).toBe(PUBLIC_SALE_PRICE_USDC);
  });
});

describe("governance", () => {
  it("vote percentages sum to 100", () => {
    for (const p of PROPOSALS) {
      expect(p.votesFor + p.votesAgainst + p.votesAbstain).toBe(100);
    }
  });

  it("uses the OFIP identifier, not the superseded OFP one", () => {
    // OFS-4100 §5: whitepaper's "OFIP" chosen over OFS-4000's "OFP".
    for (const p of PROPOSALS) {
      expect(p.id).toMatch(/^OFIP-\d{4}$/);
    }
  });

  it("derives quorum and approval threshold from category, not per-proposal", () => {
    // OFS-4100 §5: the two move together per category, they are not
    // independently configurable per proposal.
    for (const p of PROPOSALS) {
      const rule = CATEGORY_RULES[p.category];
      expect(p.quorumPct).toBe(rule.quorumPct);
      expect(p.approvalThresholdPct).toBe(rule.approvalThresholdPct);
    }
  });

  it("requires a higher bar for Protocol-Upgrade and Constitutional proposals", () => {
    for (const category of ["Protocol-Upgrade", "Constitutional"] as const) {
      expect(CATEGORY_RULES[category].quorumPct).toBe(20);
      expect(CATEGORY_RULES[category].approvalThresholdPct).toBe(66);
    }
    for (const category of ["Informational", "Standards", "Parameter"] as const) {
      expect(CATEGORY_RULES[category].quorumPct).toBe(10);
      expect(CATEGORY_RULES[category].approvalThresholdPct).toBe(50);
    }
    expect(CATEGORY_RULES.Treasury.quorumPct).toBe(10);
    expect(CATEGORY_RULES.Treasury.approvalThresholdPct).toBe(60);
  });

  it("posts the same stake deposit for every proposal", () => {
    expect(PROPOSAL_STAKE_DEPOSIT_OPEN).toBe(5000);
    for (const p of PROPOSALS) {
      expect(p.depositOpen).toBe(PROPOSAL_STAKE_DEPOSIT_OPEN);
    }
  });

  it("refunds the deposit exactly when quorum was met, regardless of outcome", () => {
    // OFS-4100 §5: refund condition is quorum-met, not proposal pass/fail —
    // OFIP-0016 below is Rejected but still refunds, since turnout cleared quorum.
    for (const p of PROPOSALS) {
      if (p.status === "Active") {
        expect(p.depositRefunded).toBeNull();
      } else {
        expect(p.depositRefunded).toBe(p.turnoutPct >= p.quorumPct);
      }
    }
    const rejectedButQuorate = PROPOSALS.find((p) => p.id === "OFIP-0016");
    expect(rejectedButQuorate?.status).toBe("Rejected");
    expect(rejectedButQuorate?.depositRefunded).toBe(true);
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
