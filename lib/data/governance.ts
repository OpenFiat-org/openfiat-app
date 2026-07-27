import type { Proposal } from "@/lib/types";

/**
 * Simulated governance. OFPs (OpenFiat Proposals) are voted with OPEN-weighted
 * voting; passed proposals are executed against the on-chain treasury.
 */
export const TREASURY = {
  openBalance: 1240000,
  usdcBalance: 386500,
};

export const PROPOSALS: Proposal[] = [
  {
    id: "OFP-021",
    title: "Reduce taker fee from 0.15% to 0.10%",
    description:
      "Lowers the protocol taker fee on settled trades from 0.15% to 0.10% to stay competitive with centralized P2P desks. The fee continues to accrue to the treasury; the reduction is expected to be offset by higher trade volume.",
    status: "Active",
    votingEnds: "Ends in 2 days",
    votesFor: 62,
    votesAgainst: 24,
    votesAbstain: 14,
    quorumPct: 10,
    turnoutPct: 8.4,
  },
  {
    id: "OFP-020",
    title: "Fund Kenya market-maker grants (150,000 OPEN)",
    description:
      "Allocates 150,000 OPEN from the treasury to a market-maker grant program for KES liquidity, targeting sub-1% spreads on USDT/KES and onboarding grants for L2-verified merchants in Nairobi and Mombasa.",
    status: "Active",
    votingEnds: "Ends in 5 days",
    votesFor: 71,
    votesAgainst: 12,
    votesAbstain: 17,
    quorumPct: 10,
    turnoutPct: 6.1,
  },
  {
    id: "OFP-019",
    title: "Increase arbitrator bond to 50,000 OPEN",
    description:
      "Raises the minimum arbitrator bond from 25,000 to 50,000 OPEN. Larger bonds increase the cost of collusion and align arbitrators with long-term protocol health as dispute volumes grow.",
    status: "Passed",
    votingEnds: "Ended 18 Jul 2026",
    votesFor: 78,
    votesAgainst: 15,
    votesAbstain: 7,
    quorumPct: 10,
    turnoutPct: 14.2,
  },
  {
    id: "OFP-018",
    title: "Treasury diversification: 20% of OPEN fees into USDC",
    description:
      "Directs 20% of accrued OPEN fee revenue into USDC via OTC settlement to build a stable runway for contributor payouts and infrastructure subsidies.",
    status: "Passed",
    votingEnds: "Ended 11 Jul 2026",
    votesFor: 55,
    votesAgainst: 33,
    votesAbstain: 12,
    quorumPct: 10,
    turnoutPct: 11.7,
  },
  {
    id: "OFP-017",
    title: "Onboard USD1 as a settlement asset",
    description:
      "Adds USD1 to the settlement asset registry, enabling USD1 liquidity vaults, escrow PDAs, and oracle price feeds alongside USDT, USDC, and SOL.",
    status: "Executed",
    votingEnds: "Executed 02 Jul 2026",
    votesFor: 84,
    votesAgainst: 6,
    votesAbstain: 10,
    quorumPct: 10,
    turnoutPct: 16.9,
  },
  {
    id: "OFP-016",
    title: "Reduce reservation timeout to 15 minutes",
    description:
      "Proposes shortening the first-come-first-served reservation timeout from ~20 to 15 minutes to reduce liquidity lock-up. Rejected over concerns for bank-transfer payment rails with slower confirmation times.",
    status: "Rejected",
    votingEnds: "Ended 24 Jun 2026",
    votesFor: 31,
    votesAgainst: 58,
    votesAbstain: 11,
    quorumPct: 10,
    turnoutPct: 12.3,
  },
];

export function proposalById(id: string): Proposal | undefined {
  return PROPOSALS.find((p) => p.id === id);
}
