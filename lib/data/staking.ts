import type { StakingPosition, StakingSummary } from "@/lib/types";

/**
 * Simulated OPEN staking. Every protocol role is bonded: merchants to publish
 * ads, node operators to serve infrastructure, arbitrators to join the
 * arbitration pool, and service providers to register on OFS-1500.
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
    minBond: 5000,
    staked: 5000,
    status: "Active",
    requirement: "Required to publish advertisements. 1 ad slot per 5,000 OPEN bonded.",
    rewards: "Fee share per settled trade",
  },
  {
    role: "node",
    title: "Node Operator stake",
    minBond: 10000,
    staked: 20000,
    status: "Active",
    requirement: "Stake against a node you operate (full node, gateway, oracle) to earn epoch rewards.",
    rewards: "8–11% APR per epoch",
  },
  {
    role: "arbitrator",
    title: "Arbitrator bond",
    minBond: 50000,
    staked: 0,
    status: "Not bonded",
    requirement: "Per OFP-019: a 50,000 OPEN bond is required to join the arbitration pool and rule on disputes.",
    rewards: "Arbitration fees per resolved case",
  },
  {
    role: "provider",
    title: "Service Provider stake",
    minBond: 2500,
    staked: 0,
    status: "Not bonded",
    requirement: "Registration stake for OFS-1500 service providers (notification, oracle, risk, snapshots).",
    rewards: "Service revenue from subscribers",
  },
];

export const STAKING_POSITIONS: StakingPosition[] = [
  { node: "node-eu-full-03", role: "Full Node", amount: 12000, aprPct: 8.2, rewards: 96.4 },
  { node: "node-ke-gateway-01", role: "Notification Gateway", amount: 5000, aprPct: 9.6, rewards: 58.1 },
  { node: "node-oracle-02", role: "Oracle Provider", amount: 3000, aprPct: 11.4, rewards: 29.75 },
];
