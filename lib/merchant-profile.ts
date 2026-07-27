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
 * What the merchant has published, per OFS-5000 (Identity Claims).
 *
 * An earlier version of this invented the labels, and got the substance wrong
 * in a way worth recording: it showed an "ID document" badge described as a
 * government ID checked by a verification provider. **There is no such check in
 * this protocol.** OFS-5000 defines no KYC and no document verification at any
 * level, and §8 states that participation never requires advancing beyond Level
 * 0. Displaying a document badge would have implied a guarantee the protocol
 * does not make and nobody performs.
 *
 * The actual levels:
 *
 *  L0 Wallet Identity — a valid wallet, authenticated. Everyone has this.
 *  L1 Verified Contact — email, phone, Telegram, Discord or X, proven by OTP.
 *     §8 is precise about what this establishes: that the wallet owner controls
 *     the channel. Not who they are.
 *  L2 Verified Merchant Identity — published business name, brand, support
 *     contacts. §8: "These claims improve user confidence but do not imply
 *     regulatory approval." That sentence is the whole reason the hover text
 *     says so too.
 *  L3 Trusted Infrastructure Provider — organisation and incident contacts for
 *     operators. Not a merchant claim, so it is only shown where it applies.
 *
 * The bond is not an OFS-5000 claim at all — it comes from the merchant's
 * stake — and it is included precisely because it is the only entry here with
 * money behind it rather than a signed statement.
 */
export function verifications(merchant: Merchant): Verification[] {
  const order: IdentityLevel[] = ["L0", "L1", "L2", "L3"];
  const level = order.indexOf(merchant.identityLevel);
  const claims: Verification[] = [
    {
      label: "Wallet",
      verified: true,
      hint: "Level 0: a valid wallet, authenticated by signature. Every participant has this, and the protocol never requires more.",
    },
    {
      label: "Verified contact",
      verified: level >= 1,
      hint: "Level 1: a contact channel — email, phone, Telegram, Discord or X — proven by one-time password. It establishes that this wallet controls that channel, and nothing about who the person is.",
    },
    {
      label: "Merchant identity",
      verified: level >= 2,
      hint: "Level 2: published business name, brand and support contacts. It improves confidence and does not imply regulatory approval — there is no KYC in this protocol and no document was checked.",
    },
  ];

  // Level 3 is infrastructure identity. Showing it on a trading desk would
  // suggest a claim that does not apply to merchants at all.
  if (level >= 3) {
    claims.push({
      label: "Infrastructure provider",
      verified: true,
      hint: "Level 3: operational identity for infrastructure operators — organisation name, public documentation and incident contacts.",
    });
  }

  claims.push({
    label: "Bonded",
    verified: merchant.stake > 0,
    hint: `${merchant.stake.toLocaleString("en-US")} OPEN staked and slashable if a dispute goes against them. Not an identity claim — it is the only entry here with money behind it rather than a signed statement.`,
  });

  return claims;
}
