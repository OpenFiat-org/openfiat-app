import { describe, expect, it } from "vitest";
import type { ServicePricing, ServiceType } from "@openfiat/sdk";
import {
  base64,
  classifyFailure,
  formatAmount,
  formatPricing,
  paymentModelFor,
  serviceTypeLabel,
  shortMint,
  FAILURE_MESSAGE,
} from "@/lib/earnings";
import en from "@/messages/en.json";

const MINT = "29w8TroBTYoaqrXBDcpv5L54VZRA8Kf7kU5U1cakvFdj";

// formatPricing now resolves its unit through the caller's catalogue.
const UNIT = (en as unknown as { earnings: { billingUnit: Record<string, string> } }).earnings.billingUnit;
const unitT = (key: string): string => UNIT[key.replace("billingUnit.", "")] ?? key;

// The per-role payment copy moved to the message catalogue so it translates;
// these regression guards now assert against the English source of truth.
const MODEL = (en as { earnings: { model: Record<string, { consumerPays: string; providerReceives: string; blockedBy?: string }> } }).earnings.model;

describe("payment model per role", () => {
  const oracle: ServiceType = { MarketData: "FxOracle" };
  const risk: ServiceType = { Security: "RiskIntelligenceProvider" };
  const snapshot: ServiceType = { Infrastructure: "SnapshotProvider" };
  const notification: ServiceType = { Notifications: "Email" };
  const bootstrap: ServiceType = { Infrastructure: "BootstrapNode" };

  // The whole point of this page: zero means something different per role,
  // and telling every provider the same story would be wrong for most.
  it("gives each role a distinct status and role key", () => {
    expect(paymentModelFor(oracle)).toMatchObject({ status: "intended", role: "oracle" });
    expect(paymentModelFor(risk)).toMatchObject({ status: "defined", role: "risk", blocked: true });
    expect(paymentModelFor(snapshot)).toMatchObject({ status: "unspecified", role: "snapshot" });
    expect(paymentModelFor(notification)).toMatchObject({ status: "awaiting-meter", role: "notification" });
    expect(paymentModelFor(bootstrap)).toMatchObject({ status: "not-applicable", role: "infrastructure" });
  });

  // Regression guard on a claim that was corrected mid-build: an earlier
  // draft of this feature would have told oracle providers they earn nothing
  // permanently. Reads being free to consumers does not mean the provider is
  // unpaid — the protocol pays them, on a formula still being designed.
  it("does not tell an oracle provider they earn nothing", () => {
    expect(MODEL.oracle.consumerPays).toMatch(/free/i);
    expect(MODEL.oracle.providerReceives).toMatch(/protocol pays/i);
    expect(MODEL.oracle.providerReceives).toMatch(/currencies/i);
    expect(MODEL.oracle.providerReceives).not.toMatch(/earns? nothing/i);
  });

  // "Coming soon" is the other failure mode — a vague promise reads as
  // imminent and ages badly.
  it("never promises delivery dates or uses coming-soon language", () => {
    for (const m of Object.values(MODEL)) {
      for (const text of [m.consumerPays, m.providerReceives, m.blockedBy ?? ""]) {
        expect(text).not.toMatch(/coming soon/i);
      }
    }
  });

  it("states the risk subscription amount and that governance can change it", () => {
    expect(MODEL.risk.consumerPays).toMatch(/1,000 USDC/);
    expect(MODEL.risk.providerReceives).toMatch(/governance-configurable/i);
  });

  // A provider could otherwise register, see no error, and believe they are
  // eligible to operate.
  it("warns that the risk approval gate is not built", () => {
    expect(paymentModelFor(risk).blocked).toBe(true);
    expect(MODEL.risk.blockedBy).toMatch(/approved by governance/i);
    expect(MODEL.risk.blockedBy).toMatch(/not built yet/i);
  });

  // Snapshot is genuinely unsettled, which is different from a decided zero.
  it("treats snapshot provider payment as unspecified rather than absent", () => {
    expect(MODEL.snapshot.providerReceives).toMatch(/not specified/i);
    expect(MODEL.snapshot.providerReceives).toMatch(/open question/i);
  });

  it("falls back rather than throwing on an unrecognised service type", () => {
    const unknown = { Somethingelse: "New" } as unknown as ServiceType;
    expect(paymentModelFor(unknown).status).toBe("not-applicable");
  });
});

describe("service type label", () => {
  it("joins the category and variant", () => {
    expect(serviceTypeLabel({ MarketData: "PriceOracle" })).toBe("MarketData:PriceOracle");
  });
});

describe("pricing display", () => {
  it("renders amount, token and unit", () => {
    const pricing: ServicePricing = {
      token_mint: MINT,
      amount: { base_units: 50_000, decimals: 6 },
      unit: "Request",
    };
    expect(formatPricing(unitT, pricing)).toBe("0.05 29w8…vFdj per request");
  });

  // Absent pricing already means free in the protocol; there is no sentinel,
  // and inventing a display one would reintroduce the ambiguity the typed
  // price removed.
  it("returns null for an absent price so callers decide how to say free", () => {
    expect(formatPricing(unitT, null)).toBeNull();
  });

  it("keeps full precision without floating the base units", () => {
    expect(formatAmount({ base_units: 1_000_000_000, decimals: 9 })).toBe("1");
    expect(formatAmount({ base_units: 1, decimals: 9 })).toBe("0.000000001");
  });

  it("shortens a mint but leaves a short string alone", () => {
    expect(shortMint(MINT)).toBe("29w8…vFdj");
    expect(shortMint("SHORT")).toBe("SHORT");
  });
});

describe("failure classification", () => {
  // The registry maps ServiceNotFound and UnknownChallenge to the same
  // RESOURCE_NOT_FOUND code, so the step disambiguates them: by the time a
  // signature is presented, the challenge step already proved the service
  // exists.
  it("reads RESOURCE_NOT_FOUND differently depending on the step", () => {
    expect(classifyFailure("RESOURCE_NOT_FOUND", "challenge")).toBe("no-such-service");
    expect(classifyFailure("RESOURCE_NOT_FOUND", "read")).toBe("challenge-spent");
  });

  it("maps expiry and a wrong key to their own failures", () => {
    expect(classifyFailure("INVALID_REQUEST", "read")).toBe("challenge-expired");
    expect(classifyFailure("INVALID_SIGNATURE", "read")).toBe("wrong-key");
  });

  it("falls back to unreachable for anything unrecognised", () => {
    expect(classifyFailure("socket hang up", "read")).toBe("unreachable");
  });

  // An expired challenge is the most likely real failure — a provider who
  // leaves the wallet prompt sitting for five minutes. It must not read as
  // "your key is wrong".
  it("reassures on expiry rather than implying a bad key", () => {
    expect(FAILURE_MESSAGE["challenge-expired"]).toMatch(/nothing is wrong with your key/i);
  });

  it("explains that a spent challenge is single-use, not a fault", () => {
    expect(FAILURE_MESSAGE["challenge-spent"]).toMatch(/single-use/i);
  });
});

describe("base64", () => {
  // The SDK's own helper uses Node's Buffer, which the browser does not have.
  it("encodes signature bytes the way the node decodes them", () => {
    expect(base64(new Uint8Array([0, 1, 2, 253, 254, 255]))).toBe("AAEC/f7/");
  });

  it("round-trips a full 64-byte signature", () => {
    const sig = Uint8Array.from({ length: 64 }, (_, i) => i * 3);
    const decoded = Uint8Array.from(atob(base64(sig)), (c) => c.charCodeAt(0));
    expect(Array.from(decoded)).toEqual(Array.from(sig));
  });
});
