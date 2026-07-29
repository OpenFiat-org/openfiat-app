import { PublicKey } from "@solana/web3.js";

/**
 * Hand-rolled decoders for the on-chain account layouts `openfiat-staking`/
 * `openfiat-governance` actually write — mirrors
 * `openfiat-core/crates/rpc/src/onchain_stake.rs`'s own precedent (byte
 * offsets taken directly from a real `anchor build`'s generated IDL
 * `types`/`accounts` sections, not hand-derived from the Rust struct
 * definitions, so they can't silently drift). This app has no dependency
 * on `anchor-lang` for the same reason `@openfiat/sdk` doesn't — these are
 * plain byte-offset reads, not schema-driven deserialization.
 *
 * Every decoder throws if the discriminator doesn't match — an account at
 * the expected PDA address that isn't actually the account type it claims
 * to be a very cheap mistake for a byte-offset reader to make silently.
 */

function checkDiscriminator(data: Uint8Array, expected: number[], label: string): void {
  for (let i = 0; i < 8; i++) {
    if (data[i] !== expected[i]) {
      throw new Error(`${label}: discriminator mismatch — not a real ${label} account`);
    }
  }
}

function readPubkey(data: Uint8Array, offset: number): PublicKey {
  return new PublicKey(data.slice(offset, offset + 32));
}

function readU64(data: Uint8Array, offset: number): bigint {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(offset, true);
}

function readI64(data: Uint8Array, offset: number): bigint {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getBigInt64(offset, true);
}

function readU16(data: Uint8Array, offset: number): number {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint16(offset, true);
}

// --- openfiat-staking ---------------------------------------------------

const STAKE_ACCOUNT_DISCRIMINATOR = [80, 158, 67, 124, 50, 189, 192, 255];
const STAKING_CONFIG_DISCRIMINATOR = [45, 134, 252, 82, 37, 57, 84, 25];

export interface DecodedStakeAccount {
  owner: PublicKey;
  role: number;
  amount: bigint;
  unbondingAmount: bigint;
  unbondingReleaseAt: bigint;
  slashedTotal: bigint;
  pendingRewards: bigint;
  bump: number;
}

/** Layout: disc(8) owner(32) role(1) amount(8) unbonding_amount(8)
 *  unbonding_release_at(8) slashed_total(8) pending_rewards(8) bump(1). */
export function decodeStakeAccount(data: Uint8Array): DecodedStakeAccount {
  checkDiscriminator(data, STAKE_ACCOUNT_DISCRIMINATOR, "StakeAccount");
  return {
    owner: readPubkey(data, 8),
    role: data[40]!,
    amount: readU64(data, 41),
    unbondingAmount: readU64(data, 49),
    unbondingReleaseAt: readI64(data, 57),
    slashedTotal: readU64(data, 65),
    pendingRewards: readU64(data, 73),
    bump: data[81]!,
  };
}

/** Number of `Role` variants; the length of `min_stake_by_role`. */
export const ROLE_COUNT = 7;

export interface DecodedStakingConfig {
  admin: PublicKey;
  mint: PublicKey;
  /** Indexed by `Role`: Merchant, Arbitrator, NodeOperator,
   *  NotificationProvider, OracleProvider, RiskIntelligenceProvider,
   *  SnapshotProvider. */
  minStakeByRole: bigint[];
  unbondingPeriodSecs: bigint;
  slashBps: number;
}

/** Layout: disc(8) admin(32) mint(32) min_stake_by_role(7 * 8)
 *  unbonding_period_secs(8) slash_bps(2) ... (remaining fields unused here). */
export function decodeStakingConfig(data: Uint8Array): DecodedStakingConfig {
  checkDiscriminator(data, STAKING_CONFIG_DISCRIMINATOR, "StakingConfig");
  const minStakeByRole: bigint[] = [];
  for (let i = 0; i < ROLE_COUNT; i++) minStakeByRole.push(readU64(data, 72 + i * 8));
  const tail = 72 + ROLE_COUNT * 8;
  return {
    admin: readPubkey(data, 8),
    mint: readPubkey(data, 40),
    minStakeByRole,
    unbondingPeriodSecs: readI64(data, tail),
    slashBps: readU16(data, tail + 8),
  };
}

// --- openfiat-governance --------------------------------------------------

const GOVERNANCE_CONFIG_DISCRIMINATOR = [81, 63, 124, 107, 210, 100, 145, 70];
const PROPOSAL_DISCRIMINATOR = [26, 94, 189, 187, 116, 136, 53, 33];

export interface DecodedGovernanceConfig {
  admin: PublicKey;
  mint: PublicKey;
  totalOpenSupply: bigint;
  quorumBps: number;
  thresholdSimpleBps: number;
  thresholdTreasuryBps: number;
  thresholdUpgradeBps: number;
  quorumUpgradeBps: number;
  depositAmount: bigint;
  voteLockSecs: bigint;
}

/** Layout: disc(8) admin(32) mint(32) total_open_supply(8) quorum_bps(2)
 *  threshold_simple_bps(2) threshold_treasury_bps(2) threshold_upgrade_bps(2)
 *  quorum_upgrade_bps(2) deposit_amount(8) forfeit_destination(32)
 *  vote_lock_secs(8) ... */
export function decodeGovernanceConfig(data: Uint8Array): DecodedGovernanceConfig {
  checkDiscriminator(data, GOVERNANCE_CONFIG_DISCRIMINATOR, "GovernanceConfig");
  return {
    admin: readPubkey(data, 8),
    mint: readPubkey(data, 40),
    totalOpenSupply: readU64(data, 72),
    quorumBps: readU16(data, 80),
    thresholdSimpleBps: readU16(data, 82),
    thresholdTreasuryBps: readU16(data, 84),
    thresholdUpgradeBps: readU16(data, 86),
    quorumUpgradeBps: readU16(data, 88),
    depositAmount: readU64(data, 90),
    voteLockSecs: readI64(data, 130),
  };
}

/** OFS-4200 §6 — matches `openfiat-governance::state::ProposalState`. */
export const PROPOSAL_STATE = ["Draft", "Voting", "Accepted", "Rejected"] as const;
export type ProposalStateLabel = (typeof PROPOSAL_STATE)[number];

export interface DecodedProposal {
  id: bigint;
  category: number;
  proposer: PublicKey;
  titleHash: Uint8Array;
  summaryHash: Uint8Array;
  stakeDeposit: bigint;
  votesFor: bigint;
  votesAgainst: bigint;
  quorumSnapshot: bigint;
  thresholdSnapshot: number;
  createdAt: bigint;
  votingEndsAt: bigint;
  state: ProposalStateLabel;
  quorumMet: boolean;
  depositSettled: boolean;
  executed: boolean;
}

/** Layout: disc(8) id(8) category(1) proposer(32) title_hash(32)
 *  summary_hash(32) stake_deposit(8) votes_for(8) votes_against(8)
 *  quorum_snapshot(8) threshold_snapshot(2) created_at(8) voting_ends_at(8)
 *  state(1) quorum_met(1) deposit_settled(1) executed(1) bump(1). */
export function decodeProposal(data: Uint8Array): DecodedProposal {
  checkDiscriminator(data, PROPOSAL_DISCRIMINATOR, "Proposal");
  // created_at(147) + voting_ends_at(8) = 155, + voting_ends_at's own 8
  // bytes = 163, where `state` actually starts.
  const stateIndex = data[163]!;
  return {
    id: readU64(data, 8),
    category: data[16]!,
    proposer: readPubkey(data, 17),
    titleHash: data.slice(49, 81),
    summaryHash: data.slice(81, 113),
    stakeDeposit: readU64(data, 113),
    votesFor: readU64(data, 121),
    votesAgainst: readU64(data, 129),
    quorumSnapshot: readU64(data, 137),
    thresholdSnapshot: readU16(data, 145),
    createdAt: readI64(data, 147),
    votingEndsAt: readI64(data, 155),
    state: PROPOSAL_STATE[stateIndex] ?? "Draft",
    quorumMet: data[164] === 1,
    depositSettled: data[165] === 1,
    executed: data[166] === 1,
  };
}
