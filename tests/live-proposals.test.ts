import { describe, expect, it } from "vitest";

import {
  CHAIN_AGREEMENT,
  PROPOSAL_CATEGORIES,
  voteBy,
  votePreview,
  votingClosed,
  type NodeProposal,
} from "@/lib/live-proposals";

/**
 * The off-chain proposal register, and the three things a screen must not
 * get wrong about it: what the local tally is, what a chain verdict means,
 * and which categories exist.
 */

const AUTHOR = "12D3KooWKS5z7Gh4yVZZUVFmbQcEhoNhiJEkveYp6B8Cr77VP8W8";
const VOTER = "12D3KooWCLYiKugKhpEhTBxUQgK7MngjdNz7kwXi3PfRuTK4GdDV";

function proposal(overrides: Partial<NodeProposal> = {}): NodeProposal {
  return {
    id: "ofip-1",
    title: "Shorten the reservation validation window",
    summary: "From 30 minutes to 15.",
    category: "Protocol",
    author: AUTHOR,
    author_public_key: "AcipN97MnbJ54bkLxortw1HsDyC7txUL8amBU7xbVBnC",
    status: "Voting",
    votes: [],
    onchain_proposal_id: null,
    voting_closes_at: 2_000,
    created_at: 1_000,
    updated_at: 1_000,
    ...overrides,
  };
}

describe("votePreview", () => {
  it("adds the verified weights up per choice, keeping abstain separate", () => {
    // `Abstain` is a real third option off chain — unlike the governance
    // program's `Proposal`, which has only For and Against — so folding it
    // into either would misreport a deliberate non-answer as a side taken.
    const totals = votePreview(
      proposal({
        votes: [
          { voter: VOTER, choice: "Approve", weight: 30, timestamp: 1 },
          { voter: AUTHOR, choice: "Reject", weight: 20, timestamp: 1 },
          { voter: "12D3KooWc", choice: "Abstain", weight: 5, timestamp: 1 },
        ],
      }),
    );
    expect(totals).toEqual({ approve: 30, reject: 20, abstain: 5, voters: 3 });
  });

  it("is all zeroes with no votes, which is not the same as a rejection", () => {
    // A node with no Solana endpoint verifies nothing and so holds no votes.
    // Reading that as "rejected" is exactly the bug `resolve_expired` was
    // removed from openfiat-core for.
    expect(votePreview(proposal())).toEqual({ approve: 0, reject: 0, abstain: 0, voters: 0 });
  });
});

describe("votingClosed", () => {
  it("is a fact about the clock, not about the status", () => {
    // The node's own doc: a caller wanting to know whether the window has
    // closed compares `voting_closes_at` against the clock, rather than
    // reading a status this node cannot substantiate.
    expect(votingClosed(proposal(), 1_999)).toBe(false);
    expect(votingClosed(proposal(), 2_000)).toBe(true);
  });
});

describe("voteBy", () => {
  it("finds this wallet's vote and nobody else's", () => {
    const p = proposal({ votes: [{ voter: VOTER, choice: "Approve", weight: 1, timestamp: 1 }] });
    expect(voteBy(p, VOTER)!.choice).toBe("Approve");
    expect(voteBy(p, AUTHOR)).toBeNull();
  });

  it("is null with no wallet, rather than the first vote on the proposal", () => {
    const p = proposal({ votes: [{ voter: VOTER, choice: "Approve", weight: 1, timestamp: 1 }] });
    expect(voteBy(p, null)).toBeNull();
  });
});

describe("CHAIN_AGREEMENT", () => {
  it("describes every verdict the node can return", () => {
    expect(Object.keys(CHAIN_AGREEMENT).sort()).toEqual([
      "claim_not_reciprocated",
      "linked_agreed",
      "linked_awaiting_adoption",
      "linked_disagreed",
      "linked_still_voting",
      "no_claim",
    ]);
  });

  it("treats only a genuine divergence as a problem", () => {
    // The lag between the chain deciding and this node adopting is a state
    // every linked proposal passes through. Rendering it as a disagreement
    // would make disagreement meaningless — openfiat-core has a test named
    // for precisely that, and this is its other half.
    expect(CHAIN_AGREEMENT.linked_awaiting_adoption.tone).not.toBe("bad");
    expect(CHAIN_AGREEMENT.linked_still_voting.tone).not.toBe("bad");
    expect(CHAIN_AGREEMENT.no_claim.tone).not.toBe("bad");
    expect(CHAIN_AGREEMENT.linked_disagreed.tone).toBe("bad");
  });
});

describe("PROPOSAL_CATEGORIES", () => {
  it("is the off-chain set, which is not the governance program's", () => {
    // `openfiat_governance::record::ProposalCategory` off chain versus
    // `Informational`/`Standards`/`Parameter`/`Treasury`/`Protocol-Upgrade`/
    // `Constitutional` on chain. Both are serialised by declaration index,
    // so a shared list would render one register's category over the
    // other's record.
    expect(PROPOSAL_CATEGORIES).toEqual([
      "Protocol",
      "Economics",
      "Marketplace",
      "Infrastructure",
      "Governance",
    ]);
  });
});
