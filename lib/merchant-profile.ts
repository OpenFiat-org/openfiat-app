import { reputationFor } from "@/lib/data/merchants";
import type { IdentityLevel, Merchant } from "@/lib/types";

/**
 * Profile figures a counterparty actually looks at before trading.
 *
 * Everything here is derived from fields the merchant already has, seeded off
 * the merchant id so it is stable across renders and builds. Nothing is stored
 * twice: a hand-authored buy/sell split for forty merchants would drift out of
 * agreement with their order count the first time anyone edited one.
 */

function seed(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface OrderSplit {
  total: number;
  buy: number;
  sell: number;
}

/** All-time orders, split by side. */
export function lifetimeOrders(merchant: Merchant): OrderSplit {
  const s = seed(merchant.id);
  // Most desks lean one way rather than sitting at 50/50.
  const buyShare = 0.35 + ((s % 30) / 100);
  const buy = Math.round(merchant.orders * buyShare);
  return { total: merchant.orders, buy, sell: merchant.orders - buy };
}

/**
 * The last 30 days. Scaled off lifetime rather than invented: a desk's recent
 * activity should be a plausible fraction of its history, and an account that is
 * months old cannot have done all its trades this month.
 */
export function recentOrders(merchant: Merchant): OrderSplit {
  const months = Math.max(1, parseInt(merchant.merchantAge, 10) || 1);
  const life = lifetimeOrders(merchant);
  const share = Math.min(1, 1 / months) * 1.15;
  const total = Math.max(1, Math.round(life.total * share));
  const buy = Math.round(total * (life.buy / Math.max(1, life.total)));
  return { total, buy, sell: total - buy };
}

export interface Rating {
  /** Percentage of raters who were positive. */
  goodPct: number;
  up: number;
  down: number;
  /** Total ratings left, which is far fewer than orders — most people do not. */
  count: number;
}

/**
 * Counterparty ratings.
 *
 * Anchored to completion rate, because the two measure overlapping things and a
 * merchant who completes 99.8% of trades with a 70% rating would be incoherent.
 * The rating count is a fraction of orders: most people never leave one, and
 * pretending otherwise would make the sample look more meaningful than it is.
 */
export function ratingFor(merchant: Merchant): Rating {
  const s = seed(merchant.id);
  const goodPct = Math.min(100, Math.round(merchant.completionRate + (s % 3) - 1));
  const count = Math.max(3, Math.round(merchant.orders * (0.03 + (s % 5) / 100)));
  const down = Math.round(count * ((100 - goodPct) / 100));
  return { goodPct, up: count - down, down, count };
}

/** Average time from payment confirmation to escrow release. */
export function releaseTime(merchant: Merchant): string {
  const dim = reputationFor(merchant).find((d) => d.label === "Settlement Speed");
  return dim?.display ?? merchant.settlementSpeed;
}

export interface Verification {
  label: string;
  verified: boolean;
  hint: string;
}

/**
 * What the merchant has actually proven, per identity level and bond.
 *
 * Shown as a row of claims rather than one level, because the levels are
 * cumulative and a reader wants to know which specific things were checked —
 * "L2" means nothing to someone deciding whether to send money.
 */
export function verifications(merchant: Merchant): Verification[] {
  const order: IdentityLevel[] = ["L0", "L1", "L2", "L3"];
  const level = order.indexOf(merchant.identityLevel);
  return [
    {
      label: "Email",
      verified: level >= 1,
      hint: "A contact address was confirmed by the merchant. It proves they can be reached, nothing about who they are.",
    },
    {
      label: "SMS",
      verified: level >= 1,
      hint: "A phone number was confirmed by the merchant. Same caveat as email — reachability, not identity.",
    },
    {
      label: "ID document",
      verified: level >= 2,
      hint: "A government ID was checked against the person by an independent verification provider. OpenFiat never receives or stores the document — only the provider's signed claim that the check passed.",
    },
    {
      label: "Business",
      verified: level >= 3,
      hint: "A registered company was verified in addition to the individual, so there is a legal entity behind the desk.",
    },
    {
      label: "Bonded",
      verified: merchant.stake > 0,
      hint: `${merchant.stake.toLocaleString("en-US")} OPEN staked and slashable if a dispute goes against them. This is the one claim with money behind it.`,
    },
  ];
}
