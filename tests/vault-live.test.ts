// @vitest-environment node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  createSyncNativeInstruction,
} from "@solana/spl-token";
import { escrow, getConnection } from "@/lib/onchain-config";
import { fetchVault } from "@/lib/live-vaults";
import {
  ataFor,
  depositInstructions,
  fetchWrapCapacity,
  fetchWrappedSolBalance,
  withdrawInstructions,
  WRAPPED_SOL_MINT,
} from "@/lib/vault-instructions";

/**
 * The vault deposit and withdrawal paths against a real running validator.
 *
 * A unit test can prove the instructions are in the right order. Only a
 * validator can prove the *program* accepts them: that `SyncNative` really
 * does credit a System transfer as a token balance, that `deposit_liquidity`
 * will take that balance, and — the part that matters most — that closing
 * the wrapped account in the same transaction leaves the merchant holding
 * SOL and no token account at all. Every assertion below re-reads the chain
 * rather than trusting the transaction's own success, and reads the vault's
 * token account separately from the counters the escrow program keeps, so
 * that the two agreeing is evidence rather than a tautology.
 *
 * Skipped unless the Solana endpoint is a local validator:
 *
 *     NEXT_PUBLIC_SOLANA_RPC_URL=http://127.0.0.1:8899 npx vitest run tests/vault-live.test.ts
 *
 * The gate is loopback rather than a separate flag on purpose. This suite
 * airdrops, creates vaults and — if it has to — edits the singleton fee
 * config, none of which anything should do to a shared cluster.
 */
const ENDPOINT = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "";
const IS_LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/i.test(ENDPOINT);

const SOL = 1_000_000_000n;

/**
 * Field offsets into the escrow `FeeConfig` account, in declaration order
 * from `escrow::state::FeeConfig`. Only needed because this suite has to
 * re-state the whole config to change one field of it —
 * `update_fee_config` takes a replacement, not a patch.
 */
const FEE_CONFIG = {
  adListingFee: 40,
  disputeFilingFee: 48,
  settlementFeeBps: 56,
  devTreasury: 58,
  ecosystemTreasury: 90,
  infraTreasury: 122,
  emergencyReserve: 154,
  devTreasuryBps: 186,
  ecosystemTreasuryBps: 188,
  infraTreasuryBps: 190,
  emergencyReserveBps: 192,
  timeoutSecs: 194,
  minArbitratorStakeAgeSecs: 203,
  arbitratorSortitionBps: 211,
  settlementMints: 213,
  settlementMintCount: 725,
} as const;

/** The admin keypair the local validator's fee config was initialized with. */
function localKeypair(): Keypair | null {
  const file = path.join(os.homedir(), ".config", "solana", "id.json");
  if (!fs.existsSync(file)) return null;
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(file, "utf8")) as number[]));
}

/**
 * Puts wSOL on the settlement-mint allowlist if it is not there already.
 *
 * `create_liquidity_vault` refuses any mint that is neither allowlisted nor
 * the arbitration pool's OPEN, so on a validator whose fee config was
 * initialized with a single test stablecoin there is no wSOL vault to prove
 * anything against. wSOL is on the program's own
 * `DEFAULT_SETTLEMENT_MINTS`, so this restores the shipped state rather
 * than inventing one. Additive: whatever is already listed stays listed.
 */
async function ensureWrappedSolIsSettleable(): Promise<void> {
  const connection = getConnection();
  const [feeConfigPda] = escrow.feeConfigPda();
  const info = await connection.getAccountInfo(feeConfigPda);
  if (!info) throw new Error("No fee config on this validator — run the escrow migrations first.");

  const data = info.data;
  const count = data[FEE_CONFIG.settlementMintCount]!;
  const listed = Array.from({ length: count }, (_, i) => {
    const at = FEE_CONFIG.settlementMints + 32 * i;
    return new PublicKey(data.subarray(at, at + 32));
  });
  if (listed.some((m) => m.equals(WRAPPED_SOL_MINT))) return;

  const admin = localKeypair();
  const storedAdmin = new PublicKey(data.subarray(8, 40));
  if (!admin || !admin.publicKey.equals(storedAdmin)) {
    throw new Error(
      `wSOL is not an allowlisted settlement mint and this machine does not hold the fee config's ` +
        `admin key (${storedAdmin.toBase58()}), so it cannot be added. Run update_fee_config first.`,
    );
  }

  // The treasuries are token accounts, and the instruction constrains all
  // four to one mint — read it off the first rather than guessing.
  const devTreasury = new PublicKey(data.subarray(FEE_CONFIG.devTreasury, FEE_CONFIG.devTreasury + 32));
  const devInfo = await connection.getAccountInfo(devTreasury);
  if (!devInfo) throw new Error("The fee config's dev treasury does not exist on this validator.");
  const treasuryMint = new PublicKey(devInfo.data.subarray(0, 32));

  const u16 = (at: number) => data.readUInt16LE(at);
  const ix = escrow.updateFeeConfigIx(
    admin.publicKey,
    treasuryMint,
    {
      devTreasury,
      ecosystemTreasury: new PublicKey(
        data.subarray(FEE_CONFIG.ecosystemTreasury, FEE_CONFIG.ecosystemTreasury + 32),
      ),
      infraTreasury: new PublicKey(
        data.subarray(FEE_CONFIG.infraTreasury, FEE_CONFIG.infraTreasury + 32),
      ),
      emergencyReserve: new PublicKey(
        data.subarray(FEE_CONFIG.emergencyReserve, FEE_CONFIG.emergencyReserve + 32),
      ),
    },
    {
      adListingFee: data.readBigUInt64LE(FEE_CONFIG.adListingFee),
      disputeFilingFee: data.readBigUInt64LE(FEE_CONFIG.disputeFilingFee),
      settlementFeeBps: u16(FEE_CONFIG.settlementFeeBps),
      devTreasuryBps: u16(FEE_CONFIG.devTreasuryBps),
      ecosystemTreasuryBps: u16(FEE_CONFIG.ecosystemTreasuryBps),
      infraTreasuryBps: u16(FEE_CONFIG.infraTreasuryBps),
      emergencyReserveBps: u16(FEE_CONFIG.emergencyReserveBps),
      timeoutSecs: data.readBigInt64LE(FEE_CONFIG.timeoutSecs),
      minArbitratorStakeAgeSecs: data.readBigInt64LE(FEE_CONFIG.minArbitratorStakeAgeSecs),
      arbitratorSortitionBps: u16(FEE_CONFIG.arbitratorSortitionBps),
      settlementMints: [...listed, WRAPPED_SOL_MINT],
    },
  );
  await sendAndConfirmTransaction(connection, new Transaction().add(ix), [admin], {
    commitment: "confirmed",
  });
}

/** A funded, otherwise untouched wallet — so every balance below started at a known point. */
async function fundedMerchant(sol: number): Promise<Keypair> {
  const connection = getConnection();
  const merchant = Keypair.generate();
  const signature = await connection.requestAirdrop(merchant.publicKey, sol * Number(SOL));
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  return merchant;
}

/** What the vault's own token account holds, read straight from the token
 *  program rather than from the counters the escrow program maintains. The
 *  two agreeing is the point. */
async function vaultTokenBalance(
  merchant: PublicKey,
  mint: PublicKey = WRAPPED_SOL_MINT,
): Promise<bigint> {
  const [tokenVault] = escrow.liquidityVaultTokensPda(merchant, mint);
  const { value } = await getConnection().getTokenAccountBalance(tokenVault, "confirmed");
  return BigInt(value.amount);
}

async function tokenAccountBalance(address: PublicKey): Promise<bigint> {
  const { value } = await getConnection().getTokenAccountBalance(address, "confirmed");
  return BigInt(value.amount);
}

/** The first settlement mint on this validator's allowlist whose authority
 *  this machine holds, so the suite can obtain some to deposit. */
async function mintableSettlementMint(): Promise<
  { mint: PublicKey; tokenProgram: PublicKey; decimals: number; authority: Keypair } | null
> {
  const connection = getConnection();
  const authority = localKeypair();
  if (!authority) return null;

  const [feeConfigPda] = escrow.feeConfigPda();
  const info = await connection.getAccountInfo(feeConfigPda);
  if (!info) return null;
  const count = info.data[FEE_CONFIG.settlementMintCount]!;

  for (let i = 0; i < count; i += 1) {
    const at = FEE_CONFIG.settlementMints + 32 * i;
    const mint = new PublicKey(info.data.subarray(at, at + 32));
    if (mint.equals(WRAPPED_SOL_MINT)) continue;
    const mintInfo = await connection.getAccountInfo(mint);
    if (!mintInfo) continue;
    // A base mint's first four bytes are the `COption` tag for the mint
    // authority: 1 means present, and the next 32 bytes are the key.
    // Token-2022 keeps that layout and appends its extensions after byte
    // 82, so one read covers both programs.
    if (mintInfo.data.readUInt32LE(0) !== 1) continue;
    const stored = new PublicKey(mintInfo.data.subarray(4, 36));
    if (!stored.equals(authority.publicKey)) continue;
    return { mint, tokenProgram: mintInfo.owner, decimals: mintInfo.data[44]!, authority };
  }
  return null;
}

describe.runIf(IS_LOCAL)("an ordinary settlement token against a live validator", () => {
  it(
    "creates a vault, deposits into it, withdraws from it, and leaves the token account open",
    async () => {
      const connection = getConnection();
      const settlement = await mintableSettlementMint();
      // Not a silent skip: without a mint this machine can issue, there is
      // nothing to deposit, and a green run would be proving nothing.
      expect(
        settlement,
        "no allowlisted settlement mint on this validator has a mint authority this machine holds",
      ).not.toBeNull();
      const { mint, tokenProgram, decimals, authority } = settlement!;

      const merchant = await fundedMerchant(2);
      const ata = ataFor(merchant.publicKey, mint, tokenProgram);
      const held = 500n * 10n ** BigInt(decimals);
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(
          createAssociatedTokenAccountIdempotentInstruction(
            merchant.publicKey,
            ata,
            merchant.publicKey,
            mint,
            tokenProgram,
          ),
          createMintToInstruction(mint, ata, authority.publicKey, held, [], tokenProgram),
        ),
        [merchant, authority],
        { commitment: "confirmed" },
      );

      // No vault yet, and `fetchVault` must say so as a fact rather than
      // by failing — that distinction is the whole of `lib/live-vaults.ts`.
      expect(await fetchVault(merchant.publicKey, mint)).toBeNull();

      const deposit = 300n * 10n ** BigInt(decimals);
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(
          ...depositInstructions({
            merchant: merchant.publicKey,
            mint,
            tokenProgram,
            amount: deposit,
            from: ata,
            createVault: true,
          }).instructions,
        ),
        [merchant],
        { commitment: "confirmed" },
      );

      const afterDeposit = (await fetchVault(merchant.publicKey, mint))!;
      expect(afterDeposit.decimals).toBe(decimals);
      expect(afterDeposit.tokenProgram.equals(tokenProgram)).toBe(true);
      expect(afterDeposit.total).toBe(deposit);
      expect(afterDeposit.available).toBe(deposit);
      expect(afterDeposit.reserved).toBe(0n);
      expect(await vaultTokenBalance(merchant.publicKey, mint)).toBe(deposit);
      expect(await tokenAccountBalance(ata)).toBe(held - deposit);

      const withdrawn = 120n * 10n ** BigInt(decimals);
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(
          ...withdrawInstructions({
            merchant: merchant.publicKey,
            mint,
            tokenProgram,
            amount: withdrawn,
          }).instructions,
        ),
        [merchant],
        { commitment: "confirmed" },
      );

      const afterWithdraw = (await fetchVault(merchant.publicKey, mint))!;
      expect(afterWithdraw.available).toBe(deposit - withdrawn);
      // `total` is deposits minus withdrawals, so it falls too — this is
      // the counter the vault table labels "Deposited − withdrawn" rather
      // than a balance.
      expect(afterWithdraw.total).toBe(deposit - withdrawn);
      expect(await vaultTokenBalance(merchant.publicKey, mint)).toBe(deposit - withdrawn);
      expect(await tokenAccountBalance(ata)).toBe(held - deposit + withdrawn);
      // Nothing is unwrapped for an ordinary token: the account stays.
      expect(await connection.getAccountInfo(ata)).not.toBeNull();
    },
    120_000,
  );
});

describe.runIf(IS_LOCAL)("wrapped SOL against a live validator", () => {
  beforeAll(async () => {
    await ensureWrappedSolIsSettleable();
  }, 60_000);

  it(
    "creates a vault, wraps SOL into it and leaves the merchant holding no wrapped SOL",
    async () => {
      const connection = getConnection();
      const merchant = await fundedMerchant(5);
      const ata = ataFor(merchant.publicKey, WRAPPED_SOL_MINT, TOKEN_PROGRAM_ID);
      const deposit = 2n * SOL;

      const capacity = await fetchWrapCapacity(merchant.publicKey, { createVault: true });
      expect(capacity.lamports).toBe(5n * SOL);
      expect(capacity.wrapped).toBe(0n);
      // Rent for three accounts plus fee headroom. The exact figure is the
      // validator's to decide, so this asserts the shape: less than the
      // balance, and by an amount small enough to be rent rather than a bug.
      expect(capacity.depositable).toBeLessThan(capacity.lamports);
      expect(capacity.lamports - capacity.depositable).toBeLessThan(SOL / 100n);
      expect(capacity.refunded).toBeGreaterThan(0n);

      const plan = depositInstructions({
        merchant: merchant.publicKey,
        mint: WRAPPED_SOL_MINT,
        tokenProgram: TOKEN_PROGRAM_ID,
        amount: deposit,
        from: null,
        wrappedBalance: capacity.wrapped,
        createVault: true,
      });
      expect(plan.wrapping).toBe(deposit);

      await sendAndConfirmTransaction(connection, new Transaction().add(...plan.instructions), [
        merchant,
      ], { commitment: "confirmed" });

      const vault = await fetchVault(merchant.publicKey, WRAPPED_SOL_MINT);
      expect(vault).not.toBeNull();
      expect(vault!.decimals).toBe(9);
      expect(vault!.total).toBe(deposit);
      expect(vault!.available).toBe(deposit);
      // The escrow program's counters and the token program's own ledger
      // are two independent records of the same money.
      expect(await vaultTokenBalance(merchant.publicKey)).toBe(deposit);

      // The whole promise: no wSOL account survives the transaction.
      expect(await connection.getAccountInfo(ata)).toBeNull();
      expect(await fetchWrappedSolBalance(merchant.publicKey)).toBe(0n);

      // And the deposit cost the merchant the deposit, plus vault rent and
      // a fee — not the wSOL account's rent, which came back on close.
      const left = BigInt(await connection.getBalance(merchant.publicKey));
      expect(left).toBeLessThan(3n * SOL);
      expect(left).toBeGreaterThan(3n * SOL - SOL / 100n);
    },
    120_000,
  );

  it(
    "unwraps a withdrawal so the merchant receives SOL and not a token account",
    async () => {
      const connection = getConnection();
      const merchant = await fundedMerchant(5);
      const ata = ataFor(merchant.publicKey, WRAPPED_SOL_MINT, TOKEN_PROGRAM_ID);

      const deposited = 2n * SOL;
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(
          ...depositInstructions({
            merchant: merchant.publicKey,
            mint: WRAPPED_SOL_MINT,
            tokenProgram: TOKEN_PROGRAM_ID,
            amount: deposited,
            from: null,
            wrappedBalance: 0n,
            createVault: true,
          }).instructions,
        ),
        [merchant],
        { commitment: "confirmed" },
      );

      const before = BigInt(await connection.getBalance(merchant.publicKey, "confirmed"));
      const withdrawn = (3n * SOL) / 4n;
      const plan = withdrawInstructions({
        merchant: merchant.publicKey,
        mint: WRAPPED_SOL_MINT,
        tokenProgram: TOKEN_PROGRAM_ID,
        amount: withdrawn,
      });
      expect(plan.unwrapping).toBe(true);

      await sendAndConfirmTransaction(connection, new Transaction().add(...plan.instructions), [
        merchant,
      ], { commitment: "confirmed" });

      const vault = (await fetchVault(merchant.publicKey, WRAPPED_SOL_MINT))!;
      expect(vault.available).toBe(deposited - withdrawn);
      expect(vault.total).toBe(deposited - withdrawn);
      expect(await vaultTokenBalance(merchant.publicKey)).toBe(deposited - withdrawn);

      // Arrived as SOL: the balance rose by the withdrawal less a fee, and
      // there is no token account holding it.
      const after = BigInt(await connection.getBalance(merchant.publicKey, "confirmed"));
      expect(after - before).toBeGreaterThan(withdrawn - SOL / 100n);
      expect(after - before).toBeLessThanOrEqual(withdrawn);
      expect(await connection.getAccountInfo(ata)).toBeNull();
    },
    120_000,
  );

  it(
    "spends wrapped SOL the merchant already holds, and returns the remainder as SOL",
    async () => {
      const connection = getConnection();
      const merchant = await fundedMerchant(5);
      const ata = ataFor(merchant.publicKey, WRAPPED_SOL_MINT, TOKEN_PROGRAM_ID);

      // A merchant who wrapped SOL by hand at some point — the case that
      // makes "always close the account" a decision rather than a detail.
      const alreadyWrapped = 3n * SOL;
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(
          createAssociatedTokenAccountIdempotentInstruction(
            merchant.publicKey,
            ata,
            merchant.publicKey,
            WRAPPED_SOL_MINT,
            TOKEN_PROGRAM_ID,
          ),
          SystemProgram.transfer({
            fromPubkey: merchant.publicKey,
            toPubkey: ata,
            lamports: alreadyWrapped,
          }),
          createSyncNativeInstruction(ata, TOKEN_PROGRAM_ID),
        ),
        [merchant],
        { commitment: "confirmed" },
      );
      expect(await fetchWrappedSolBalance(merchant.publicKey)).toBe(alreadyWrapped);

      const capacity = await fetchWrapCapacity(merchant.publicKey, { createVault: true });
      expect(capacity.wrapped).toBe(alreadyWrapped);
      // The account already exists, so none of its rent is charged again.
      expect(capacity.refunded).toBe(0n);

      const deposit = SOL;
      const plan = depositInstructions({
        merchant: merchant.publicKey,
        mint: WRAPPED_SOL_MINT,
        tokenProgram: TOKEN_PROGRAM_ID,
        amount: deposit,
        from: null,
        wrappedBalance: capacity.wrapped,
        createVault: true,
      });
      // Nothing new is wrapped: the existing balance covers it.
      expect(plan.wrapping).toBe(0n);

      const before = BigInt(await connection.getBalance(merchant.publicKey, "confirmed"));
      await sendAndConfirmTransaction(connection, new Transaction().add(...plan.instructions), [
        merchant,
      ], { commitment: "confirmed" });

      const vault = (await fetchVault(merchant.publicKey, WRAPPED_SOL_MINT))!;
      expect(vault.available).toBe(deposit);
      expect(await connection.getAccountInfo(ata)).toBeNull();

      // The 2 SOL that was left wrapped came back as SOL, minus vault rent
      // and the fee, plus the reclaimed rent of the closed account.
      const after = BigInt(await connection.getBalance(merchant.publicKey, "confirmed"));
      const returned = after - before;
      expect(returned).toBeGreaterThan(alreadyWrapped - deposit - SOL / 100n);
      expect(returned).toBeLessThan(alreadyWrapped - deposit + SOL / 100n);
    },
    120_000,
  );
});
