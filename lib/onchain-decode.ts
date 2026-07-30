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
  /**
   * When this account's current staked position began — the clock behind
   * the arbitrator stake-age requirement (OFS-4100 §4).
   *
   * `null` for an account still on the pre-migration layout, which is 82
   * bytes and simply does not carry the field. Distinct from `0n`, which
   * is what a migrated account holding no stake stores. Both fail an age
   * requirement, but only one of them is waiting on
   * `migrate_stake_account` — so a caller showing an arbitrator why they
   * are ineligible needs to be able to tell them apart.
   */
  firstStakedAt: bigint | null;
}

/** Pre-migration length, before `first_staked_at` was appended. */
const STAKE_ACCOUNT_LEN_BEFORE_STAKE_AGE = 82;

/** Layout: disc(8) owner(32) role(1) amount(8) unbonding_amount(8)
 *  unbonding_release_at(8) slashed_total(8) pending_rewards(8) bump(1)
 *  first_staked_at(8).
 *
 * `first_staked_at` is appended after `bump` rather than sitting in
 * declaration order, which is what lets every offset above stay exactly
 * where it was — see the field's own doc comment in the program. */
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
    firstStakedAt:
      data.length > STAKE_ACCOUNT_LEN_BEFORE_STAKE_AGE
        ? readI64(data, STAKE_ACCOUNT_LEN_BEFORE_STAKE_AGE)
        : null,
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

// --- openfiat-escrow ------------------------------------------------------

const LIQUIDITY_VAULT_DISCRIMINATOR = [221, 166, 52, 46, 13, 174, 181, 99];

/**
 * The exact on-chain size of a `LiquidityVault`, and the only account size
 * the escrow program allocates for one. Usable on its own as a
 * `getProgramAccounts` `dataSize` filter.
 */
export const LIQUIDITY_VAULT_LEN = 114;

export interface DecodedLiquidityVault {
  merchant: PublicKey;
  mint: PublicKey;
  /**
   * Deposits minus withdrawals, and nothing else.
   *
   * Settlement does NOT reduce it: tokens that leave through
   * `fund_trade_escrow` and are released to a buyer are counted in
   * `settled` while `total` stays where it was. So a vault that has settled
   * everything it ever held still reports its full historical deposit here
   * while its token account is empty. This is not a balance and must never
   * be labelled as one.
   */
  total: bigint;
  /** Held against open reservations that have not yet been funded. */
  reserved: bigint;
  /**
   * The only number a new reservation or a withdrawal may draw against —
   * the program checks this field and no other.
   *
   * Not derivable from the rest: `total - reserved` over-states it by
   * everything already settled away. A caller must read this field rather
   * than compute one. Presenting `total` where this belongs is how a
   * merchant oversells.
   */
  available: bigint;
  /** Cumulative amount that has completed settlement and left for good. */
  settled: bigint;
  /** Funded into open trade escrows; not yet released or cancelled back. */
  pendingSettlement: bigint;
  bump: number;
  tokenVaultBump: number;
}

/** Layout: disc(8) merchant(32) mint(32) total(8) reserved(8) available(8)
 *  settled(8) pending_settlement(8) bump(1) token_vault_bump(1) = 114 bytes.
 *
 * Note the declaration order: `reserved` precedes `available` on chain,
 * while every sensible UI lists available first. Reading them in display
 * order rather than layout order swaps two numbers that are both plausible
 * balances, which is the kind of error nothing downstream can detect — hence
 * the byte-level test over a hand-built account. */
export function decodeLiquidityVault(data: Uint8Array): DecodedLiquidityVault {
  checkDiscriminator(data, LIQUIDITY_VAULT_DISCRIMINATOR, "LiquidityVault");
  return {
    merchant: readPubkey(data, 8),
    mint: readPubkey(data, 40),
    total: readU64(data, 72),
    reserved: readU64(data, 80),
    available: readU64(data, 88),
    settled: readU64(data, 96),
    pendingSettlement: readU64(data, 104),
    bump: data[112]!,
    tokenVaultBump: data[113]!,
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
