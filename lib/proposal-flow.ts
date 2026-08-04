import bs58 from "bs58";

import { sendSignedEvent, signPayload } from "@/lib/arbitration";
import { explainNodeRefusal, type RefusalCopy } from "@/lib/node-refusal";
import { nodeUrl } from "@/lib/node-endpoint";
import type { ProposalCategory, VoteChoice } from "@/lib/live-proposals";
import type { TradeIdentity } from "@/lib/trade-flow";

/**
 * Creating an off-chain proposal and voting on one, as the connected
 * wallet signs them.
 *
 * # Key order is load-bearing, and silent when wrong
 *
 * The node re-serialises the payload with `serde_json` — struct declaration
 * order — and verifies the signature over its own rendering;
 * `JSON.stringify` uses insertion order. A reordered key is a valid
 * signature over the wrong bytes and comes back as `INVALID_SIGNATURE`,
 * indistinguishable from a wallet fault. Both builders below are written in
 * the Rust struct's declaration order and name it. Confirmed against a live
 * node: moving `author` one field earlier in `ProposalCreate` is refused
 * with exactly that code.
 *
 * # `onchain_proposal_id` is `null`, never absent
 *
 * It is an `Option<u64>`, which `serde_json` renders as an explicit `null`.
 * Omitting the key changes the bytes the node hashes. Its own doc-comment
 * in `openfiat-core` says this in bold, because the field was added to a
 * signed event and every client had to move with it.
 */

/**
 * `openfiat_governance::events::ProposalCreate` — id, title, summary,
 * category, author, author_public_key, onchain_proposal_id, timestamp.
 *
 * Exported unsigned so the exact bytes can be asserted without a wallet.
 */
export function buildProposalCreate(
  who: TradeIdentity,
  draft: {
    id: string;
    title: string;
    summary: string;
    category: ProposalCategory;
    /** The `u64` on-chain `Proposal` this claims, or `null` for none. */
    onchainProposalId: number | null;
  },
) {
  return {
    id: draft.id,
    title: draft.title,
    summary: draft.summary,
    category: draft.category,
    author: who.peerId,
    author_public_key: bs58.encode(who.publicKey),
    onchain_proposal_id: draft.onchainProposalId,
    timestamp: Date.now(),
  };
}

/**
 * `openfiat_governance::events::VoteCast` — proposal_id, voter,
 * voter_public_key, choice, weight, stake_account, timestamp.
 *
 * `weight` is inside the signature and is nonetheless **ignored** by every
 * real node: `sendVoteCast` verifies authorship now and defers application
 * until it has read `stake_account` from Solana and decoded the amount for
 * itself. So this field is a claim the protocol keeps a record of, not an
 * input to anything, and a UI must never present it as the weight a vote
 * will carry.
 *
 * `stake_account` is the base58 `StakeAccount` PDA — `["stake", voter,
 * role]` under `openfiat-staking`. It is covered by the signature so it
 * cannot be swapped out after signing, and the account is then checked to
 * be owned by the staking program and to belong to this voter before its
 * amount counts for anything.
 */
export function buildVoteCast(
  who: TradeIdentity,
  vote: {
    proposalId: string;
    choice: VoteChoice;
    /** Base58 address of the `StakeAccount` the weight is claimed from. */
    stakeAccount: string;
    /** The staked amount this client read, in base units. Recorded, not trusted. */
    claimedWeight: number;
  },
) {
  return {
    proposal_id: vote.proposalId,
    voter: who.peerId,
    voter_public_key: bs58.encode(who.publicKey),
    choice: vote.choice,
    weight: vote.claimedWeight,
    stake_account: vote.stakeAccount,
    timestamp: Date.now(),
  };
}

/** Submits a proposal and returns the id the node recorded. */
export async function createProposal(
  who: TradeIdentity,
  draft: Parameters<typeof buildProposalCreate>[1],
): Promise<string> {
  const create = buildProposalCreate(who, draft);
  const signature = await signPayload(who.provider, create);
  const id = await sendSignedEvent(nodeUrl(), "sendProposalCreate", { create, signature });
  return String(id);
}

/**
 * Submits a vote.
 *
 * Returning normally means **the signature was accepted**, and nothing
 * more. The node queues the vote behind an on-chain read of
 * `stake_account`; it is recorded only once that account has been
 * confirmed to be the staking program's, to belong to this voter, and to
 * hold stake. If any of those fails the vote is dropped with no further
 * word to the caller, and if the RPC endpoint is unreachable the node
 * retries for about five minutes before giving up.
 *
 * A caller must therefore re-read the proposal to find out whether the
 * vote landed, and must not report it as counted on the strength of this
 * resolving.
 */
export async function castNodeVote(
  who: TradeIdentity,
  vote: Parameters<typeof buildVoteCast>[1],
): Promise<void> {
  const payload = buildVoteCast(who, vote);
  const signature = await signPayload(who.provider, payload);
  await sendSignedEvent(nodeUrl(), "sendVoteCast", { vote: payload, signature });
}

/*
 * `INVALID_PROPOSAL` used to be the answer to three different things — a
 * duplicate id, an action by somebody who is not the author, and an illegal
 * status change — and this app's copy could only guess which, so it named
 * the likeliest and was wrong two thirds of the time. The node has since
 * split all three out (`PROPOSAL_ALREADY_EXISTS` 7005,
 * `INVALID_IDENTITY_CLAIM` 2001, `INVALID_PROPOSAL_STATE` 7006), so the
 * guess is gone with them.
 */
const GOVERNANCE_REFUSALS: RefusalCopy = {
  PROPOSAL_ALREADY_EXISTS:
    "A proposal with that id already exists on this node. Ids are network-wide and first come, first served — pick another, or open the one that holds it.",
  INVALID_PROPOSAL_STATE:
    "This proposal is not in a state that allows that. Reload to see its status — a withdrawn or executed proposal takes no further changes.",
  INVALID_PROPOSAL:
    "The node refused this proposal's own contents. Check the title, summary and category against what the screen asks for.",
  // The node reports 7000 as permanent, and this used to answer it with
  // "try again in a moment" — advice the registry says is wrong.
  PROPOSAL_NOT_FOUND:
    "This node holds no proposal with that id, and it reports that as final rather than as replication still in flight. Pick another node in Settings, or check the id.",
  VOTING_CLOSED:
    "Voting on this proposal has closed, so no further vote can be recorded. Reload to see the result.",
  DUPLICATE_VOTE:
    "This wallet has already voted on this proposal. A vote cannot be changed once it is recorded.",
  INSUFFICIENT_VOTING_POWER:
    "This wallet holds too little staked weight for its vote to count on this proposal. Stake more, or wait for a proposal with a lower threshold.",
  DESERIALIZATION_ERROR:
    "The node could not read the proposal's shape, so nothing was recorded. Nothing you can change on this screen fixes that — report it.",
  INVALID_IDENTITY_CLAIM:
    "The node refused this wallet for that action. Only the proposal's own author can change it.",
  INVALID_SIGNATURE:
    "The node did not accept this wallet's signature over that request. The signature verified against a different key than the one it names.",
};

/** What a refusal on a proposal or a vote means to whoever pressed the button. */
export function explainGovernanceRefusal(error: unknown): string {
  return explainNodeRefusal(error, GOVERNANCE_REFUSALS);
}
