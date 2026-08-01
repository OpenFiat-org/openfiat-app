/**
 * The bonded roles, as the deployed `openfiat-staking` program defines them.
 *
 * # What this replaced
 *
 * `lib/data/staking.ts`, which held four UI buckets each carrying a
 * `minBond` number, a `staked` number, a `status` string, and prose stating
 * the minimum in words. Every figure was stale against the chain: the
 * deployed `StakingConfig` sets the merchant and arbitrator floors at 500
 * OPEN, while the fixture said 1,000 and 10,000 and the prose repeated them
 * ("the deployed staking config sets the flat minimum at 1,000 OPEN"). The
 * stake form validated against those numbers, so a merchant entering the
 * real 500 OPEN minimum was told it was below the minimum.
 *
 * It also carried a `STAKING_SUMMARY` — 25,000 staked, 184.25 pending
 * rewards — that the explorer rendered as *your* position for every visitor,
 * and a `STAKING_POSITIONS` list of three invented nodes with invented APRs.
 *
 * # No numbers here at all, on purpose
 *
 * `min_stake_by_role` and `unbonding_period_secs_by_role` are governance-
 * updatable fields on a live account, and both moved in the last deployment.
 * Any copy of them in this repository is a copy that goes stale silently and
 * is believed anyway, so this file carries no figure that the chain answers
 * — only the mapping from a URL key to the on-chain `Role` discriminant, and
 * the words describing what each role does.
 *
 * # Seven roles, not four
 *
 * The fixture had a single "Service Provider" bucket mapped to
 * `NotificationProvider`, with a comment admitting it stood in for four
 * distinct on-chain roles. That conflation is not harmless: `StakeAccount`
 * is keyed by `(owner, role)`, the four provider roles have different
 * minimums (5,000 for notifications, 1,000 for the rest), and an oracle
 * provider bonding through that bucket would have opened a
 * `NotificationProvider` position — the wrong account, at the wrong floor,
 * for the wrong registration.
 */

export interface StakingRole {
  /** URL key, e.g. "merchant" for `/staking/stake?role=merchant`. */
  key: string;
  /** The on-chain `Role` discriminant, and the index into both config arrays. */
  onchain: number;
  title: string;
  /** What bonding for this role lets a wallet do. No figures. */
  requirement: string;
}

export const STAKING_ROLES: StakingRole[] = [
  {
    key: "merchant",
    onchain: 0,
    title: "Merchant bond",
    requirement:
      "Required to publish advertisements. OFS-4100 §4 scales the requirement with the position taken; the program enforces the floor.",
  },
  {
    key: "arbitrator",
    onchain: 1,
    title: "Arbitrator bond",
    requirement:
      "Eligibility for dispute seats. Seats are a per-case draw over qualifying stakes, not first-come — so the barrier is the number of independent stakes, which no per-wallet minimum can price.",
  },
  {
    key: "node",
    onchain: 2,
    title: "Node Operator stake",
    requirement: "Stake against a node you operate.",
  },
  {
    key: "notification-provider",
    onchain: 3,
    title: "Notification Provider stake",
    requirement: "Registration stake for an OFS-1500 notification gateway.",
  },
  {
    key: "oracle-provider",
    onchain: 4,
    title: "Oracle Provider stake",
    requirement: "Registration stake for an OFS-1500 price oracle.",
  },
  {
    key: "risk-provider",
    onchain: 5,
    title: "Risk Intelligence stake",
    requirement: "Registration stake for an OFS-1500 risk intelligence service.",
  },
  {
    key: "snapshot-provider",
    onchain: 6,
    title: "Snapshot Provider stake",
    requirement: "Registration stake for an OFS-1500 snapshot provider.",
  },
];

export function roleByKey(key: string | undefined): StakingRole | undefined {
  return STAKING_ROLES.find((role) => role.key === key);
}

/** OPEN has 9 decimals (OFS-4100 §1). */
export const OPEN_DECIMALS = 9;

export function toOpen(baseUnits: bigint): number {
  return Number(baseUnits) / 10 ** OPEN_DECIMALS;
}

/**
 * A lock period in words.
 *
 * Rendered rather than stated, because the three periods the config holds —
 * 24 hours, 3 days, 7 days — used to be one hardcoded "7 days" repeated on
 * the staking page, in its footnote, and in the stake form.
 */
export function unbondingLabel(seconds: bigint): string {
  const hours = Number(seconds) / 3600;
  if (hours < 48) return hours === 24 ? "24 hours" : `${Math.round(hours)} hours`;
  const days = hours / 24;
  return `${Number.isInteger(days) ? days : days.toFixed(1)} days`;
}
