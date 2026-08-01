import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  decodeGovernanceConfig,
  decodeLiquidityVault,
  decodeProposal,
  decodeSaleConfig,
  decodeStakeAccount,
  decodeStakingConfig,
  LIQUIDITY_VAULT_LEN,
} from "@/lib/onchain-decode";
import { PRESALE_PROGRAM_ID } from "@/lib/live-presale";

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

/**
 * The values below are the ones the live devnet singleton
 * (`2wrGGjcUFSn1ZiYzo2o64r7ZC88QNhvvgUYktNs2ifT9`) actually holds, read off
 * the chain rather than invented: 500 OPEN floors for Merchant and
 * Arbitrator, per-role unbonding of 86400/259200/604800, slash_bps 500.
 *
 * `StakingConfig` grew from 237 to 285 bytes when `unbonding_period_secs`
 * became `unbonding_period_secs_by_role: [i64; 7]` **in place**, and the
 * decoder that predated that change kept working: it returned Merchant's
 * period under a name promising everyone's, and read `slash_bps` out of the
 * middle of Arbitrator's, reporting 62592 basis points. Nothing crashed.
 * That is why the account length is asserted rather than trusted, and why
 * the wrong-length case is a test of its own.
 */
function stakingConfigBytes(admin: PublicKey, mint: PublicKey): Buffer {
  return Buffer.from([
    45, 134, 252, 82, 37, 57, 84, 25, // discriminator
    ...admin.toBytes(),
    ...mint.toBytes(),
    // min_stake_by_role, indexed by Role (7 entries)
    ...u64le(500_000_000_000n), // Merchant
    ...u64le(500_000_000_000n), // Arbitrator
    ...u64le(1_000_000_000_000n), // NodeOperator
    ...u64le(5_000_000_000_000n), // NotificationProvider
    ...u64le(1_000_000_000_000n), // OracleProvider
    ...u64le(1_000_000_000_000n), // RiskIntelligenceProvider
    ...u64le(1_000_000_000_000n), // SnapshotProvider
    // unbonding_period_secs_by_role, same indexing
    ...i64le(86_400n), // Merchant — 24 hours
    ...i64le(259_200n), // Arbitrator — 3 days
    ...i64le(604_800n), // NodeOperator
    ...i64le(604_800n), // NotificationProvider
    ...i64le(604_800n), // OracleProvider
    ...i64le(604_800n), // RiskIntelligenceProvider
    ...i64le(604_800n), // SnapshotProvider
    ...u16le(500), // slash_bps
    // The tail this decoder does not read: three authorities and three
    // bumps, present only so the account is its real 285 bytes.
    ...new Uint8Array(285 - 8 - 32 - 32 - 56 - 56 - 2),
  ]);
}

describe("decodeStakingConfig", () => {
  it("decodes admin, mint, and both per-role arrays exactly", () => {
    const admin = PublicKey.unique();
    const mint = PublicKey.unique();
    const decoded = decodeStakingConfig(stakingConfigBytes(admin, mint));
    expect(decoded.admin.equals(admin)).toBe(true);
    expect(decoded.mint.equals(mint)).toBe(true);
    expect(decoded.minStakeByRole).toHaveLength(7);
    expect(decoded.minStakeByRole[0]).toBe(500_000_000_000n);
    expect(decoded.minStakeByRole[1]).toBe(500_000_000_000n);
    expect(decoded.minStakeByRole[3]).toBe(5_000_000_000_000n);
  });

  it("reads each role's own unbonding period, not one flat value", () => {
    // The three periods differ, which is the entire reason the field became
    // an array. A decoder reading a scalar here would return 86400 and be
    // wrong about five of the seven roles while looking right about one.
    const decoded = decodeStakingConfig(stakingConfigBytes(PublicKey.unique(), PublicKey.unique()));
    expect(decoded.unbondingPeriodSecsByRole).toHaveLength(7);
    expect(decoded.unbondingPeriodSecsByRole[0]).toBe(86_400n);
    expect(decoded.unbondingPeriodSecsByRole[1]).toBe(259_200n);
    expect(decoded.unbondingPeriodSecsByRole[6]).toBe(604_800n);
  });

  it("reads slash_bps after the array, not from inside it", () => {
    const decoded = decodeStakingConfig(stakingConfigBytes(PublicKey.unique(), PublicKey.unique()));
    expect(decoded.slashBps).toBe(500);
  });

  it("refuses the pre-migration 237-byte layout rather than misreading it", () => {
    const bytes = stakingConfigBytes(PublicKey.unique(), PublicKey.unique()).subarray(0, 237);
    expect(() => decodeStakingConfig(bytes)).toThrow(/expected 285 bytes/);
  });

  it("rejects a mismatched discriminator", () => {
    const bytes = Buffer.alloc(285);
    expect(() => decodeStakingConfig(bytes)).toThrow(/discriminator mismatch/);
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

describe("decodeLiquidityVault", () => {
  const DISC = [221, 166, 52, 46, 13, 174, 181, 99];

  function vaultBytes(
    merchant: PublicKey,
    mint: PublicKey,
    counters: { total: bigint; reserved: bigint; available: bigint; settled: bigint; pending: bigint },
  ): Buffer {
    return Buffer.from([
      ...DISC,
      ...merchant.toBytes(),
      ...mint.toBytes(),
      ...u64le(counters.total),
      ...u64le(counters.reserved),
      ...u64le(counters.available),
      ...u64le(counters.settled),
      ...u64le(counters.pending),
      254, // bump
      253, // token_vault_bump
    ]);
  }

  // Every counter is a different value, so an offset that is off by one
  // field reads a number that belongs to a neighbour and the assertion
  // fails. Five equal counters would pass a completely wrong decoder.
  it("decodes a well-formed account exactly", () => {
    const merchant = PublicKey.unique();
    const mint = PublicKey.unique();
    const bytes = vaultBytes(merchant, mint, {
      total: 9_000_000n,
      reserved: 700_000n,
      available: 5_000_000n,
      settled: 3_000_000n,
      pending: 300_000n,
    });
    expect(bytes.length).toBe(LIQUIDITY_VAULT_LEN);

    const decoded = decodeLiquidityVault(bytes);
    expect(decoded.merchant.equals(merchant)).toBe(true);
    expect(decoded.mint.equals(mint)).toBe(true);
    expect(decoded.total).toBe(9_000_000n);
    expect(decoded.reserved).toBe(700_000n);
    expect(decoded.available).toBe(5_000_000n);
    expect(decoded.settled).toBe(3_000_000n);
    expect(decoded.pendingSettlement).toBe(300_000n);
    expect(decoded.bump).toBe(254);
    expect(decoded.tokenVaultBump).toBe(253);
  });

  // `reserved` sits BEFORE `available` on chain and after it in every
  // sensible display order. This pins the on-chain order, so a decoder
  // rewritten to match a table's column order fails here rather than
  // quietly reporting a merchant's held funds as spendable.
  it("reads reserved before available, matching the on-chain field order", () => {
    const bytes = vaultBytes(PublicKey.unique(), PublicKey.unique(), {
      total: 100n,
      reserved: 40n,
      available: 60n,
      settled: 0n,
      pending: 0n,
    });
    const decoded = decodeLiquidityVault(bytes);
    expect(decoded.reserved).toBe(40n);
    expect(decoded.available).toBe(60n);
  });

  // The shape of the real devnet vault (2 OPEN-scale units deposited, all
  // of it settled away): `available` is zero while `total` is the full
  // deposit. A UI that shows `total` as spendable is wrong by the entire
  // balance here, so the decoder must keep them separate values.
  it("keeps a fully-settled vault's available at zero while total stays high", () => {
    const bytes = vaultBytes(PublicKey.unique(), PublicKey.unique(), {
      total: 2_000_000_000n,
      reserved: 0n,
      available: 0n,
      settled: 2_000_000_000n,
      pending: 0n,
    });
    const decoded = decodeLiquidityVault(bytes);
    expect(decoded.total).toBe(2_000_000_000n);
    expect(decoded.available).toBe(0n);
    expect(decoded.available).not.toBe(decoded.total);
  });

  it("rejects an account that is not a LiquidityVault", () => {
    const bytes = vaultBytes(PublicKey.unique(), PublicKey.unique(), {
      total: 1n,
      reserved: 0n,
      available: 1n,
      settled: 0n,
      pending: 0n,
    });
    bytes[0] = 0;
    expect(() => decodeLiquidityVault(bytes)).toThrow(/discriminator mismatch/);
  });
});

/**
 * `SaleConfig` cannot be decoded against a live account: the presale program
 * is deployed on devnet but `initialize_sale` has never run there, so the
 * singleton PDA holds nothing. That absence is the honest answer `/open`
 * renders — and it is also why this decoder is tested against a hand-built
 * account rather than a real one.
 *
 * The variable-length `stablecoin_whitelist` is the reason a test is needed
 * at all. Everything after it sits at an offset that depends on the
 * account's own contents, so a fixed offset for `total_raised` would read
 * the last whitelisted pubkey and report it as a dollar figure — on a token
 * sale page. Both lengths are exercised.
 */
function saleConfigBytes(options: {
  whitelist: PublicKey[];
  hardCap: bigint;
  softCap: bigint;
  minContribution: bigint;
  maxContribution: bigint;
  totalRaised: bigint;
  state: number;
}): Buffer {
  const whitelistBytes: number[] = [];
  for (const key of options.whitelist) whitelistBytes.push(...key.toBytes());
  const len = Buffer.alloc(4);
  len.writeUInt32LE(options.whitelist.length);

  return Buffer.from([
    86, 47, 71, 156, 87, 152, 149, 246, // discriminator
    ...PublicKey.unique().toBytes(), // admin
    ...PublicKey.unique().toBytes(), // open_mint
    ...PublicKey.unique().toBytes(), // usdc_mint
    ...PublicKey.unique().toBytes(), // presale_vault
    ...PublicKey.unique().toBytes(), // usdc_vault
    ...PublicKey.unique().toBytes(), // treasury
    ...PublicKey.unique().toBytes(), // swap_program
    ...u64le(options.hardCap),
    ...u64le(options.softCap),
    ...u64le(options.minContribution),
    ...u64le(options.maxContribution),
    ...u16le(50), // max_slippage_bps
    9, // open_decimals
    6, // usdc_decimals
    ...i64le(1_700_000_000n), // start_time
    ...i64le(1_800_000_000n), // end_time
    ...len,
    ...whitelistBytes,
    ...u64le(options.totalRaised),
    options.state,
    255, // bump
    254, // usdc_vault_bump
  ]);
}

describe("decodeSaleConfig", () => {
  const base = {
    hardCap: 200_000_000_000_000n,
    softCap: 0n,
    minContribution: 50_000_000n,
    maxContribution: 10_000_000_000_000n,
    totalRaised: 1_234_567_000_000n,
    state: 0,
  };

  it("decodes the economic parameters and the running total", () => {
    const decoded = decodeSaleConfig(saleConfigBytes({ ...base, whitelist: [] }));
    expect(decoded.hardCap).toBe(200_000_000_000_000n);
    expect(decoded.minContribution).toBe(50_000_000n);
    expect(decoded.maxContribution).toBe(10_000_000_000_000n);
    expect(decoded.totalRaised).toBe(1_234_567_000_000n);
    expect(decoded.openDecimals).toBe(9);
    expect(decoded.usdcDecimals).toBe(6);
    expect(decoded.state).toBe("Active");
  });

  it("finds total_raised past a whitelist of any length", () => {
    const three = decodeSaleConfig(
      saleConfigBytes({
        ...base,
        whitelist: [PublicKey.unique(), PublicKey.unique(), PublicKey.unique()],
      }),
    );
    expect(three.totalRaised).toBe(1_234_567_000_000n);
    expect(three.hardCap).toBe(200_000_000_000_000n);
  });

  it("reads a zero soft cap as itself — 'no minimum to raise', not a threshold", () => {
    // §3 records no soft cap as [CONFIRMED]; zero is how the program says so,
    // and it makes SoftCapMissed unreachable. A UI treating it as a bar to
    // clear would invent a refund condition that does not exist.
    const decoded = decodeSaleConfig(saleConfigBytes({ ...base, whitelist: [] }));
    expect(decoded.softCap).toBe(0n);
  });

  it("refuses an account whose whitelist length runs past its own bytes", () => {
    const bytes = saleConfigBytes({ ...base, whitelist: [] });
    bytes.writeUInt32LE(9999, 284);
    expect(() => decodeSaleConfig(bytes)).toThrow(/runs past the account/);
  });

  it("rejects an account that is not a SaleConfig", () => {
    const bytes = saleConfigBytes({ ...base, whitelist: [] });
    bytes[0] = 0;
    expect(() => decodeSaleConfig(bytes)).toThrow(/discriminator mismatch/);
  });

  it("pins the presale program id against openfiat-core's declare_id!", () => {
    // Hand-copied, because the SDK exports escrow, staking and governance and
    // not this one. A transposed character derives a PDA that does not exist,
    // which renders as "the sale is not open" — the same answer as the truth
    // today, so nothing on screen would catch it.
    expect(PRESALE_PROGRAM_ID).toBe("75rJ9MRAaSnAc8tg4AfeTFVDCVrN6jdD5CqeyE4UoUw7");
  });
});
