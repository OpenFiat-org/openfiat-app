import { nodeRpc } from "@/lib/node-rpc";
import { nodeUrl } from "@/lib/node-endpoint";

/**
 * Proposals as the *network* holds them — signed, gossiped records with a
 * real title and a real summary — and the join to the chain's own account.
 *
 * # Why this exists beside `lib/live-governance.ts`
 *
 * There are two proposal registries and they are not the same thing:
 *
 * - `openfiat-governance` on Solana holds `Proposal` accounts keyed by a
 *   `u64`, tallies stake-weighted votes under its own quorum and threshold
 *   rules, and stores the title and summary **only as SHA-256 hashes**. A
 *   reader of the chain alone can never learn what a proposal says. That is
 *   `lib/live-governance.ts`.
 * - Every OpenFiat node holds off-chain proposals keyed by an author-chosen
 *   string, carrying the actual text. That is this module.
 *
 * Nothing correlated them until `getProposalChainLink`. An interface showing
 * "the" proposal was showing one record while implying the other, with no
 * way to notice when the two disagreed — and they can, because the chain
 * decides while this layer only ever holds the votes one node happened to
 * verify.
 *
 * # The join takes two claims, and one alone proves nothing
 *
 * The off-chain proposal names the `u64` it claims, inside the signed
 * `ProposalCreate` its author cannot amend. The on-chain proposal names
 * `sha256(offchain_id)`, written once by `link_offchain_proposal`. Anyone
 * may make either claim about a record they do not own, so only both
 * together are a link — see {@link ChainAgreement}, whose variants are all
 * distinct things a reader may need to be told and none of which may be
 * collapsed into "no".
 */

/** `openfiat_governance::ProposalCategory` — §8's examples, verbatim. */
export type ProposalCategory =
  | "Protocol"
  | "Economics"
  | "Marketplace"
  | "Infrastructure"
  | "Governance";

export const PROPOSAL_CATEGORIES: ProposalCategory[] = [
  "Protocol",
  "Economics",
  "Marketplace",
  "Infrastructure",
  "Governance",
];

/**
 * `openfiat_governance::ProposalStatus`.
 *
 * `Voting` is where a proposal opens: the off-chain layer deliberately has
 * no separate `Draft`, because discussion and technical review happen on a
 * forum rather than as gossiped protocol events. `Activated` is `Accepted`
 * plus the reference implementation having shipped.
 */
export type ProposalStatus = "Voting" | "Accepted" | "Rejected" | "Withdrawn" | "Activated";

/** `openfiat_governance::VoteChoice` — §13's three options. */
export type VoteChoice = "Approve" | "Reject" | "Abstain";

/**
 * One recorded vote.
 *
 * `weight` is what this node *verified*, not what the voter claimed:
 * `sendVoteCast` defers application until the named `StakeAccount` has been
 * read from Solana and its `amount` decoded, and the self-reported figure on
 * the event is discarded. So a vote appearing here has had its weight
 * checked against real stake — and a vote that does not appear may simply
 * not have been checked yet.
 */
export interface CastVote {
  voter: string;
  choice: VoteChoice;
  weight: number;
  timestamp: number;
}

/** `openfiat_governance::record::Proposal`, as `getProposal` serialises it. */
export interface NodeProposal {
  id: string;
  title: string;
  summary: string;
  category: ProposalCategory;
  /** Base58 PeerId of the author. */
  author: string;
  author_public_key: string;
  status: ProposalStatus;
  votes: CastVote[];
  /** The on-chain `Proposal` id this claims, or `null`. Fixed at creation. */
  onchain_proposal_id: number | null;
  voting_closes_at: number;
  created_at: number;
  updated_at: number;
}

/**
 * `openfiat_governance::onchain::ChainAgreement`, snake_case on the wire.
 *
 * The one that matters most is `linked_awaiting_adoption`: the chain has
 * decided and this node has not adopted the answer yet. **Every** linked
 * proposal passes through it in the window between `tally_and_finalize`
 * landing and the next poll tick, so rendering it as a disagreement would
 * make disagreement meaningless. It is a lag, not a conflict.
 */
export type ChainAgreement =
  | "no_claim"
  | "claim_not_reciprocated"
  | "linked_still_voting"
  | "linked_awaiting_adoption"
  | "linked_agreed"
  | "linked_disagreed";

/** `getProposalChainLink`'s answer. */
export interface ProposalChainLink {
  onchain_proposal_id: number | null;
  /** The account address, derived by the node so a client need not. */
  onchain_proposal_address: string | null;
  /** Lowercase hex SHA-256 of the off-chain id — what `link_offchain_proposal` takes. */
  offchain_id_hash: string;
  governance_program: string;
  status: ProposalStatus;
  agreement: ChainAgreement;
}

/**
 * Every off-chain proposal this node holds, newest first.
 *
 * "This node holds" is the honest bound: proposals are gossiped, so a node
 * that has replicated less of the network reports fewer. An empty answer
 * means this node has seen none, never that none exist.
 */
export async function fetchNodeProposals(endpoint = nodeUrl()): Promise<NodeProposal[]> {
  const rows = await nodeRpc<NodeProposal[]>(endpoint, "getProposals", {});
  return [...(rows ?? [])].sort((a, b) => b.created_at - a.created_at);
}

/** `null` when this node has never seen a proposal with that id. */
export async function fetchNodeProposal(
  id: string,
  endpoint = nodeUrl(),
): Promise<NodeProposal | null> {
  return nodeRpc<NodeProposal | null>(endpoint, "getProposal", { id });
}

/**
 * The chain link for one proposal.
 *
 * The node refuses this for an id it does not hold, rather than answering
 * an empty link — so a caller must have established the proposal exists.
 */
export async function fetchProposalChainLink(
  id: string,
  endpoint = nodeUrl(),
): Promise<ProposalChainLink> {
  return nodeRpc<ProposalChainLink>(endpoint, "getProposalChainLink", { id });
}

/** Whether the voting window has closed, which is a fact about the clock. */
export function votingClosed(proposal: NodeProposal, now = Date.now()): boolean {
  return now >= proposal.voting_closes_at;
}

/**
 * How the votes this node has verified would add up — a port of
 * `GovernanceRegistry::local_vote_preview`, and named `preview` for the
 * same reason that method is.
 *
 * **This is not the outcome and must never be shown as one.** A vote only
 * reaches local state once its weight has been confirmed against on-chain
 * stake, so a `GossipOnly` node holds none of them and would report every
 * proposal unanimously unvoted — indistinguishable from nobody having
 * voted at all. The resolution comes from the chain's `tally_and_finalize`,
 * which this layer adopts rather than recomputes.
 */
export function votePreview(proposal: NodeProposal): {
  approve: number;
  reject: number;
  abstain: number;
  voters: number;
} {
  const totals = { approve: 0, reject: 0, abstain: 0, voters: proposal.votes.length };
  for (const vote of proposal.votes) {
    if (vote.choice === "Approve") totals.approve += vote.weight;
    else if (vote.choice === "Reject") totals.reject += vote.weight;
    else totals.abstain += vote.weight;
  }
  return totals;
}

/** Whether `peerId` already has a vote recorded on this proposal. */
export function voteBy(proposal: NodeProposal, peerId: string | null): CastVote | null {
  if (!peerId) return null;
  return proposal.votes.find((vote) => vote.voter === peerId) ?? null;
}

/**
 * What each agreement verdict means, for a reader who is not going to go
 * and read `openfiat_governance::onchain`.
 *
 * `tone` drives nothing but colour, and only `linked_disagreed` is a
 * problem. The rest are ordinary states — including a claim nobody
 * answered, which is what an on-chain half that has not been created yet
 * looks like.
 */
export const CHAIN_AGREEMENT: Record<
  ChainAgreement,
  { label: string; detail: string; tone: "neutral" | "good" | "warn" | "bad" }
> = {
  no_claim: {
    label: "Off-chain only",
    detail:
      "This proposal claims no on-chain counterpart, and that is not a fault — an informational or a standards proposal legitimately never goes on chain. Its outcome is whatever the network's own record says, with no stake-weighted tally behind it.",
    tone: "neutral",
  },
  claim_not_reciprocated: {
    label: "Claim unanswered",
    detail:
      "One side names the other and the other does not name it back — either the on-chain proposal was never created, or it was never linked, or this node has not read the account yet. The two records are not joined, so nothing about the chain's tally may be attributed to this proposal.",
    tone: "warn",
  },
  linked_still_voting: {
    label: "Linked, chain still voting",
    detail:
      "Both records name each other and the chain has not resolved yet. This is the honest answer while the window is open.",
    tone: "neutral",
  },
  linked_awaiting_adoption: {
    label: "Chain decided, node catching up",
    detail:
      "The chain has resolved and this node has not adopted the answer yet. Every linked proposal passes through this in the gap between the tally landing and the next poll — it is a lag, not a disagreement.",
    tone: "neutral",
  },
  linked_agreed: {
    label: "Linked and agreed",
    detail: "Both records name each other and their outcomes match.",
    tone: "good",
  },
  linked_disagreed: {
    label: "Records disagree",
    detail:
      "Both records name each other and their outcomes differ. The chain's answer is the authoritative one; this is shown rather than quietly overwritten so that the divergence is visible at all.",
    tone: "bad",
  },
};
