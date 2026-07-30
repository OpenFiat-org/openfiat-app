import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  decodeGovernanceConfig,
  decodeProposal,
  decodeStakeAccount,
  decodeStakingConfig,
} from "@/lib/onchain-decode";

function u64le(value: bigint): number[] {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(value);
  return [...buf];
}
function i64le(value: bigint): number[] {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64LE(value);
  return [...buf];
}
function u16le(value: number): number[] {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(value);
  return [...buf];
}

describe("decodeStakeAccount", () => {
  it("decodes a well-formed account exactly", () => {
    const owner = PublicKey.unique();
    const bytes = Buffer.from([
      80, 158, 67, 124, 50, 189, 192, 255, // discriminator
      ...owner.toBytes(), // owner
      1, // role = Arbitrator
      ...u64le(12_345n), // amount
      ...u64le(0n), // unbonding_amount
      ...i64le(0n), // unbonding_release_at
      ...u64le(0n), // slashed_total
      ...u64le(500n), // pending_rewards
      7, // bump
      ...i64le(1_800_000_000n), // first_staked_at
    ]);
    const decoded = decodeStakeAccount(bytes);
    expect(decoded.owner.equals(owner)).toBe(true);
    expect(decoded.role).toBe(1);
    expect(decoded.amount).toBe(12_345n);
    expect(decoded.pendingRewards).toBe(500n);
    expect(decoded.bump).toBe(7);
    expect(decoded.firstStakedAt).toBe(1_800_000_000n);
  });

  // The whole point of appending `first_staked_at` after `bump` rather than
  // placing it in declaration order: an account that has not yet been
  // through `migrate_stake_account` must still decode, with every other
  // field reading exactly what it read before the field existed.
  it("decodes a pre-migration account and reports an unknown stake age", () => {
    const owner = PublicKey.unique();
    const bytes = Buffer.from([
      80, 158, 67, 124, 50, 189, 192, 255,
      ...owner.toBytes(),
      1,
      ...u64le(12_345n),
      ...u64le(0n),
      ...i64le(0n),
      ...u64le(0n),
      ...u64le(500n),
      7,
    ]);
    expect(bytes.length).toBe(82);
    const decoded = decodeStakeAccount(bytes);
    expect(decoded.owner.equals(owner)).toBe(true);
    expect(decoded.amount).toBe(12_345n);
    expect(decoded.bump).toBe(7);
    // null, not 0n — an unmigrated account is a different situation from a
    // migrated one holding no stake, and both callers and users need to be
    // told which they are looking at.
    expect(decoded.firstStakedAt).toBeNull();
  });

  it("rejects a mismatched discriminator", () => {
    const bytes = Buffer.alloc(82);
    expect(() => decodeStakeAccount(bytes)).toThrow(/discriminator mismatch/);
  });
});

describe("decodeStakingConfig", () => {
  it("decodes admin/mint/thresholds exactly", () => {
    const admin = PublicKey.unique();
    const mint = PublicKey.unique();
    const bytes = Buffer.from([
      45, 134, 252, 82, 37, 57, 84, 25, // discriminator
      ...admin.toBytes(),
      ...mint.toBytes(),
      // min_stake_by_role, indexed by Role (7 entries)
      ...u64le(1_000_000_000_000n), // Merchant
      ...u64le(10_000_000_000_000n), // Arbitrator
      ...u64le(1_000_000_000_000n), // NodeOperator
      ...u64le(5_000_000_000_000n), // NotificationProvider
      ...u64le(1_000_000_000_000n), // OracleProvider
      ...u64le(1_000_000_000_000n), // RiskIntelligenceProvider
      ...u64le(1_000_000_000_000n), // SnapshotProvider
      ...i64le(604_800n), // unbonding_period_secs
      ...u16le(1000), // slash_bps
    ]);
    const decoded = decodeStakingConfig(bytes);
    expect(decoded.admin.equals(admin)).toBe(true);
    expect(decoded.mint.equals(mint)).toBe(true);
    expect(decoded.minStakeByRole).toHaveLength(7);
    expect(decoded.minStakeByRole[0]).toBe(1_000_000_000_000n);
    expect(decoded.minStakeByRole[1]).toBe(10_000_000_000_000n);
    expect(decoded.minStakeByRole[3]).toBe(5_000_000_000_000n);
    expect(decoded.unbondingPeriodSecs).toBe(604_800n);
    expect(decoded.slashBps).toBe(1000);
  });
});

describe("decodeGovernanceConfig", () => {
  it("decodes quorum/threshold/deposit fields exactly, skipping forfeit_destination", () => {
    const admin = PublicKey.unique();
    const mint = PublicKey.unique();
    const forfeitDestination = PublicKey.unique();
    const bytes = Buffer.from([
      81, 63, 124, 107, 210, 100, 145, 70, // discriminator
      ...admin.toBytes(),
      ...mint.toBytes(),
      ...u64le(1_000_000_000_000_000_000n), // total_open_supply
      ...u16le(1000), // quorum_bps
      ...u16le(5001), // threshold_simple_bps
      ...u16le(6000), // threshold_treasury_bps
      ...u16le(6600), // threshold_upgrade_bps
      ...u16le(2000), // quorum_upgrade_bps
      ...u64le(5_000_000_000_000n), // deposit_amount
      ...forfeitDestination.toBytes(),
      ...i64le(604_800n), // vote_lock_secs
    ]);
    const decoded = decodeGovernanceConfig(bytes);
    expect(decoded.admin.equals(admin)).toBe(true);
    expect(decoded.mint.equals(mint)).toBe(true);
    expect(decoded.totalOpenSupply).toBe(1_000_000_000_000_000_000n);
    expect(decoded.quorumBps).toBe(1000);
    expect(decoded.thresholdSimpleBps).toBe(5001);
    expect(decoded.thresholdTreasuryBps).toBe(6000);
    expect(decoded.thresholdUpgradeBps).toBe(6600);
    expect(decoded.quorumUpgradeBps).toBe(2000);
    expect(decoded.depositAmount).toBe(5_000_000_000_000n);
    expect(decoded.voteLockSecs).toBe(604_800n);
  });
});

describe("decodeProposal", () => {
  it("decodes every field at its real offset, including the tail booleans", () => {
    const proposer = PublicKey.unique();
    const titleHash = new Uint8Array(32).fill(1);
    const summaryHash = new Uint8Array(32).fill(2);
    const bytes = Buffer.from([
      26, 94, 189, 187, 116, 136, 53, 33, // discriminator
      ...u64le(7n), // id
      3, // category = Treasury
      ...proposer.toBytes(),
      ...titleHash,
      ...summaryHash,
      ...u64le(5_000_000_000_000n), // stake_deposit
      ...u64le(600_000n), // votes_for
      ...u64le(400_000n), // votes_against
      ...u64le(100_000_000n), // quorum_snapshot
      ...u16le(6000), // threshold_snapshot
      ...i64le(1_000_000n), // created_at
      ...i64le(1_604_800n), // voting_ends_at
      2, // state = Accepted
      1, // quorum_met = true
      0, // deposit_settled = false
      1, // executed = true
      9, // bump
    ]);
    const decoded = decodeProposal(bytes);
    expect(decoded.id).toBe(7n);
    expect(decoded.category).toBe(3);
    expect(decoded.proposer.equals(proposer)).toBe(true);
    expect([...decoded.titleHash]).toEqual([...titleHash]);
    expect([...decoded.summaryHash]).toEqual([...summaryHash]);
    expect(decoded.stakeDeposit).toBe(5_000_000_000_000n);
    expect(decoded.votesFor).toBe(600_000n);
    expect(decoded.votesAgainst).toBe(400_000n);
    expect(decoded.quorumSnapshot).toBe(100_000_000n);
    expect(decoded.thresholdSnapshot).toBe(6000);
    expect(decoded.createdAt).toBe(1_000_000n);
    expect(decoded.votingEndsAt).toBe(1_604_800n);
    expect(decoded.state).toBe("Accepted");
    expect(decoded.quorumMet).toBe(true);
    expect(decoded.depositSettled).toBe(false);
    expect(decoded.executed).toBe(true);
  });
});
