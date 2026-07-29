import type { StakingPosition, StakingSummary } from "@/lib/types";

/**
 * OPEN staking. Every protocol role is bonded: merchants to publish ads, node
 * operators to serve infrastructure, arbitrators to join the arbitration pool,
 * and service providers to register on OFS-1500.
 *
 * The `minBond` figures below are the real minimums from the deployed
 * `StakingConfig` on devnet, not illustrative numbers — the stake form submits
 * against the live program, so a wrong minimum here is a transaction that
 * fails on chain. Balances, rewards and positions further down are still
 * placeholder: the app has no reward-history source yet.
 */
export const STAKING_SUMMARY: StakingSummary = {
  totalStaked: 25000,
  merchantBond: 5000,
  pendingRewards: 184.25,
  cooldownDays: 7,
};

export interface StakingRole {
  /** URL key, e.g. "merchant" for /staking/stake?role=merchant. */
  role: string;
  title: string;
  /** Minimum bond in OPEN. */
  minBond: number;
  /** What you currently have staked toward this role. */
  staked: number;
  status: "Active" | "Not bonded";
  requirement: string;
  rewards: string;
}

export const STAKING_ROLES: StakingRole[] = [
  {
    role: "merchant",
    title: "Merchant bond",
    minBond: 1000,
    staked: 5000,
    status: "Active",
    requirement:
      "Required to publish advertisements. The deployed staking config sets the flat minimum at 1,000 OPEN.",
    rewards: "Fee share per settled trade",
  },
  {
    role: "node",
    title: "Node Operator stake",
    minBond: 1000,
    staked: 20000,
    status: "Active",
    requirement:
      "Stake against a node you operate. The deployed staking config sets the flat minimum at 1,000 OPEN.",
    rewards: "Share of protocol revenue; the formula is not published",
  },
  {
    role: "arbitrator",
    title: "Arbitrator bond",
    minBond: 10000,
    staked: 0,
    status: "Not bonded",
    requirement:
      "Ten times the flat minimum, per OFS-4100 §4: min_stake_arbitrator is 10,000 OPEN in the deployed config.",
    rewards: "Arbitration fees per resolved case",
  },
  {
    role: "provider",
    title: "Service Provider stake",
    minBond: 5000,
    staked: 0,
    status: "Not bonded",
    requirement:
      "Registration stake for OFS-1500 service providers. Notification gateways post 5,000 OPEN; other provider roles post the 1,000 flat minimum.",
    rewards: "Service revenue from subscribers",
  },
];

export const STAKING_POSITIONS: StakingPosition[] = [
  { node: "node-eu-full-03", role: "Full Node", amount: 12000, aprPct: 8.2, rewards: 96.4 },
  { node: "node-ke-gateway-01", role: "Notification Gateway", amount: 5000, aprPct: 9.6, rewards: 58.1 },
  { node: "node-oracle-02", role: "Oracle Provider", amount: 3000, aprPct: 11.4, rewards: 29.75 },
];
