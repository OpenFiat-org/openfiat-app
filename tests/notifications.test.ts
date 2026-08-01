import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/node-endpoint", () => ({ nodeUrl: () => "https://node.example" }));

const { NOTIFICATION_CATEGORIES, CATEGORY_NOTE, toLiveSubscription } = await import(
  "@/lib/notifications"
);

/**
 * The settings screen's four channel toggles — Email, SMS, Telegram, Push —
 * were held in `useState`, saved nowhere, and were the wrong axis anyway: a
 * subscription is signed against categories, and a channel belongs to a
 * sealed destination. These pin the shape that replaced them.
 */
describe("notification categories", () => {
  it("are the five OFS-6000 defines, and no channel among them", () => {
    expect([...NOTIFICATION_CATEGORIES]).toEqual([
      "Trading",
      "Marketplace",
      "Disputes",
      "Governance",
      "Infrastructure",
    ]);
    for (const invented of ["Email", "SMS", "Telegram", "Push"]) {
      expect(NOTIFICATION_CATEGORIES as readonly string[]).not.toContain(invented);
    }
  });

  it("describe each category from its own triggers", () => {
    for (const category of NOTIFICATION_CATEGORIES) {
      expect(CATEGORY_NOTE[category].length).toBeGreaterThan(0);
    }
    // A description that names the wrong events is a setting that silences
    // the wrong thing, so a couple of the trigger words are pinned.
    expect(CATEGORY_NOTE.Disputes).toMatch(/[Ee]vidence/);
    expect(CATEGORY_NOTE.Governance).toMatch(/proposal/i);
  });

  it("names no notification provider", () => {
    // Each hint once ended "· via PingRelay" / "NotifyHive" / "TgramBridge" /
    // "PushSignal" — four carriers that exist in no spec and no registry,
    // read as the partners actually delivering a merchant's dispute alerts.
    const prose = Object.values(CATEGORY_NOTE).join(" ");
    for (const invented of ["PingRelay", "NotifyHive", "TgramBridge", "PushSignal"]) {
      expect(prose).not.toContain(invented);
    }
  });
});

describe("toLiveSubscription", () => {
  it("splits categories this build cannot name instead of discarding them", () => {
    // An update replaces the whole list. Dropping an unrecognised category on
    // read would silently unsubscribe the wallet from it on the next write —
    // a change to somebody's alerts made by a build that did not know a word.
    const live = toLiveSubscription({
      enabled_categories: ["Trading", "Weather", "Disputes"],
      updated_at: 1,
    });
    expect(live.enabled).toEqual(["Trading", "Disputes"]);
    expect(live.unknown).toEqual(["Weather"]);
  });

  it("counts destinations, so 'enabled' can be told apart from 'delivered'", () => {
    const none = toLiveSubscription({ enabled_categories: ["Trading"], updated_at: 1 });
    expect(none.destinations).toBe(0);

    const one = toLiveSubscription({
      enabled_categories: ["Trading"],
      destinations: [{ service_id: "svc" }],
      updated_at: 1,
    });
    expect(one.destinations).toBe(1);
  });
});
