import { CATEGORY_RULES, PROPOSAL_STAKE_DEPOSIT_OPEN } from "@/lib/governance";
import type { Proposal } from "@/lib/types";

/**
 * Simulated governance. OFIPs (OpenFiat Improvement Proposals — Ch.12 §12.6,
 * OFS-4100 §5) are voted with OPEN-weighted voting; passed proposals are
 * executed against the on-chain treasury.
 *
 * Quorum and approval threshold are not per-proposal knobs — they're derived
 * from each proposal's category via `CATEGORY_RULES` (OFS-4100 §5): a 5,000
 * OPEN stake deposit is required to submit, refunded if quorum is met by the
 * voting deadline (independent of whether the proposal itself passes),
 * forfeited to the Ecosystem Treasury otherwise.
 */
export const TREASURY = {
  openBalance: 1240000,
  usdcBalance: 386500,
};

function proposal(
  p: Omit<Proposal, "quorumPct" | "approvalThresholdPct" | "depositOpen">,
): Proposal {
  const rule = CATEGORY_RULES[p.category];
  return {
    ...p,
    quorumPct: rule.quorumPct,
    approvalThresholdPct: rule.approvalThresholdPct,
    depositOpen: PROPOSAL_STAKE_DEPOSIT_OPEN,
  };
}

export const PROPOSALS: Proposal[] = [
  proposal({
    id: "OFIP-0021",
    category: "Parameter",
    title: "Reduce settlement fee from 0.85% to 0.60%",
    description:
      "Lowers the protocol settlement fee on completed trades from 0.85% to 0.60% to stay competitive with centralized P2P desks. The fee is borne by the buyer and continues to accrue to the four treasury sub-accounts; the reduction is expected to be offset by higher trade volume.",
    status: "Active",
    votingEnds: "Ends in 2 days",
    votesFor: 62,
    votesAgainst: 24,
    votesAbstain: 14,
    turnoutPct: 8.4,
    depositRefunded: null,
  }),
  proposal({
    id: "OFIP-0020",
    category: "Treasury",
    title: "Fund Kenya market-maker grants (150,000 OPEN)",
    description:
      "Allocates 150,000 OPEN from the treasury to a market-maker grant program for KES liquidity, targeting sub-1% spreads on USDT/KES and onboarding grants for L2-verified merchants in Nairobi and Mombasa.",
    status: "Active",
    votingEnds: "Ends in 5 days",
    votesFor: 71,
    votesAgainst: 12,
    votesAbstain: 17,
    turnoutPct: 6.1,
    depositRefunded: null,
  }),
  proposal({
    id: "OFIP-0019",
    category: "Parameter",
    title: "Increase arbitrator bond to 50,000 OPEN",
    description:
      "Raises the minimum arbitrator bond from 25,000 to 50,000 OPEN. Larger bonds increase the cost of collusion and align arbitrators with long-term protocol health as dispute volumes grow.",
    status: "Passed",
    votingEnds: "Ended 18 Jul 2026",
    votesFor: 78,
    votesAgainst: 15,
    votesAbstain: 7,
    turnoutPct: 14.2,
    depositRefunded: true,
  }),
  proposal({
    id: "OFIP-0018",
    category: "Treasury",
    title: "Treasury diversification: 20% of OPEN fees into USDC",
    description:
      "Directs 20% of accrued OPEN fee revenue into USDC via OTC settlement to build a stable runway for contributor payouts and infrastructure subsidies.",
    status: "Passed",
    votingEnds: "Ended 11 Jul 2026",
    votesFor: 55,
    votesAgainst: 33,
    votesAbstain: 12,
    turnoutPct: 11.7,
    depositRefunded: true,
  }),
  proposal({
    id: "OFIP-0017",
    category: "Protocol-Upgrade",
    title: "Onboard USD1 as a settlement asset",
    description:
      "Adds USD1 to the settlement asset registry, enabling USD1 liquidity vaults, escrow PDAs, and oracle price feeds alongside USDT, USDC, and SOL. Categorized Protocol-Upgrade, not Standards, because it adds new on-chain vault/escrow account types rather than just registry metadata.",
    status: "Executed",
    votingEnds: "Executed 02 Jul 2026",
    votesFor: 84,
    votesAgainst: 6,
    votesAbstain: 10,
    turnoutPct: 21.4,
    depositRefunded: true,
  }),
  proposal({
    id: "OFIP-0016",
    category: "Parameter",
    title: "Reduce reservation timeout to 15 minutes",
    description:
      "Proposes shortening the first-come-first-served reservation timeout from ~30 to 15 minutes to reduce liquidity lock-up. Rejected over concerns for bank-transfer payment rails with slower confirmation times.",
    status: "Rejected",
    votingEnds: "Ended 24 Jun 2026",
    votesFor: 31,
    votesAgainst: 58,
    votesAbstain: 11,
    turnoutPct: 12.3,
    // Quorum was met (12.3% > 10%) even though the proposal itself failed —
    // the deposit refund condition is about quorum only, not outcome.
    depositRefunded: true,
  }),
];

export function proposalById(id: string): Proposal | undefined {
  return PROPOSALS.find((p) => p.id === id);
}
