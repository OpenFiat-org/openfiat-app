// @vitest-environment node

import { describe, expect, it } from "vitest";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { ESCROW_PROGRAM_ID } from "@/lib/onchain-config";
import {
  ataFor,
  depositInstructions,
  isWrappedSol,
  unwrapInstructions,
  withdrawInstructions,
  WRAPPED_SOL_MINT,
} from "@/lib/vault-instructions";

/**
 * The shape of the transactions the wallet screens sign.
 *
 * These assert *ordering*, not just membership, because the whole point of
 * the wSOL handling is that the four steps happen in one transaction in a
 * particular sequence: a `SyncNative` before the transfer credits nothing,
 * and a `CloseAccount` before the deposit takes the money back out again.
 * A test that only counted instructions would pass on a transaction that
 * silently deposits zero.
 *
 * `tests/vault-wsol-live.test.ts` runs the same builders against a real
 * validator; this file is what makes a regression in them legible without
 * one.
 */

/** SPL Token instruction indices, from the token program's own `TokenInstruction` enum. */
const CLOSE_ACCOUNT = 9;
const SYNC_NATIVE = 17;

const MERCHANT = new PublicKey("EA8TyQ58C3eavg3ThRFTMu1KLyV9e1v2oTQubSBQ9s5z");
/** The devnet settlement stablecoin — a Token-2022 mint, so these cases also
 *  cover the non-legacy dispatch path. */
const SPL_MINT = new PublicKey("SK1JEbfsjjTG2WELNirmM7iJVcdnwerqfF32kCnoWsM");
const SPL_TOKEN_ACCOUNT = Keypair.generate().publicKey;

const ONE_SOL = 1_000_000_000n;

function programs(instructions: { programId: PublicKey }[]): string[] {
  return instructions.map((ix) => ix.programId.toBase58());
}

describe("recognising wrapped SOL", () => {
  it("matches the native mint the SPL token library defines, not a copy of the address", () => {
    expect(WRAPPED_SOL_MINT.equals(NATIVE_MINT)).toBe(true);
    expect(isWrappedSol(NATIVE_MINT)).toBe(true);
  });

  it("does not treat any other mint as wrapped SOL", () => {
    expect(isWrappedSol(SPL_MINT)).toBe(false);
  });
});

describe("a deposit of an ordinary token", () => {
  it("is the deposit instruction alone when the vault already exists", () => {
    const plan = depositInstructions({
      merchant: MERCHANT,
      mint: SPL_MINT,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      amount: 250_000_000n,
      from: SPL_TOKEN_ACCOUNT,
      createVault: false,
    });

    expect(programs(plan.instructions)).toEqual([ESCROW_PROGRAM_ID.toBase58()]);
    expect(plan.wrapping).toBe(0n);
    expect(plan.unwrapping).toBe(false);
    expect(plan.tokenAccount.equals(SPL_TOKEN_ACCOUNT)).toBe(true);
  });

  it("creates the vault before the deposit that lands in it", () => {
    const plan = depositInstructions({
      merchant: MERCHANT,
      mint: SPL_MINT,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      amount: 1n,
      from: SPL_TOKEN_ACCOUNT,
      createVault: true,
    });

    expect(plan.instructions).toHaveLength(2);
    // Both are escrow instructions, so the discriminator is what tells them
    // apart — `create_liquidity_vault` first, or the deposit has no vault
    // to land in.
    expect(Array.from(plan.instructions[0]!.data.subarray(0, 8))).toEqual([
      204, 255, 106, 205, 72, 186, 252, 83,
    ]);
    expect(Array.from(plan.instructions[1]!.data.subarray(0, 8))).toEqual([
      245, 99, 59, 25, 151, 71, 233, 249,
    ]);
  });

  it("refuses to build a deposit from a wallet that has no token account for the mint", () => {
    // The alternative is a transaction that fails on chain with
    // `AccountNotInitialized` against an account the user never named.
    expect(() =>
      depositInstructions({
        merchant: MERCHANT,
        mint: SPL_MINT,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        amount: 1n,
        from: null,
        createVault: false,
      }),
    ).toThrow(/no token account/i);
  });
});

describe("a deposit of SOL", () => {
  const ata = ataFor(MERCHANT, WRAPPED_SOL_MINT, TOKEN_PROGRAM_ID);

  it("opens, funds, syncs, deposits and closes the wrapped account in that order", () => {
    const plan = depositInstructions({
      merchant: MERCHANT,
      mint: WRAPPED_SOL_MINT,
      tokenProgram: TOKEN_PROGRAM_ID,
      amount: ONE_SOL,
      from: null,
      wrappedBalance: 0n,
      createVault: false,
    });

    expect(programs(plan.instructions)).toEqual([
      ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(),
      SystemProgram.programId.toBase58(),
      TOKEN_PROGRAM_ID.toBase58(),
      ESCROW_PROGRAM_ID.toBase58(),
      TOKEN_PROGRAM_ID.toBase58(),
    ]);
    expect(plan.instructions[2]!.data[0]).toBe(SYNC_NATIVE);
    expect(plan.instructions[4]!.data[0]).toBe(CLOSE_ACCOUNT);
    expect(plan.wrapping).toBe(ONE_SOL);
    expect(plan.unwrapping).toBe(true);
  });

  it("wraps exactly the amount being deposited and no more", () => {
    const plan = depositInstructions({
      merchant: MERCHANT,
      mint: WRAPPED_SOL_MINT,
      tokenProgram: TOKEN_PROGRAM_ID,
      amount: ONE_SOL,
      from: null,
      wrappedBalance: 0n,
      createVault: false,
    });

    // The System transfer's data is a 4-byte instruction index followed by
    // the lamports as a u64 — read back rather than trusted, since an
    // over-wrap would be money the user did not agree to move.
    const transfer = plan.instructions[1]!;
    expect(transfer.data.readBigUInt64LE(4)).toBe(ONE_SOL);
    expect(transfer.keys[1]!.pubkey.equals(ata)).toBe(true);
  });

  it("deposits from the associated account it just funded, not from anywhere else", () => {
    const plan = depositInstructions({
      merchant: MERCHANT,
      mint: WRAPPED_SOL_MINT,
      tokenProgram: TOKEN_PROGRAM_ID,
      amount: ONE_SOL,
      from: Keypair.generate().publicKey,
      wrappedBalance: 0n,
      createVault: false,
    });

    expect(plan.tokenAccount.equals(ata)).toBe(true);
    // `from` is the fifth account of `deposit_liquidity`: merchant, ban
    // record, liquidity vault, token vault, from.
    expect(plan.instructions[3]!.keys[4]!.pubkey.equals(ata)).toBe(true);
  });

  it("spends a wrapped balance the merchant already holds before wrapping anything new", () => {
    const plan = depositInstructions({
      merchant: MERCHANT,
      mint: WRAPPED_SOL_MINT,
      tokenProgram: TOKEN_PROGRAM_ID,
      amount: ONE_SOL,
      from: null,
      wrappedBalance: ONE_SOL / 4n,
      createVault: false,
    });

    expect(plan.wrapping).toBe((ONE_SOL * 3n) / 4n);
    expect(plan.instructions[1]!.data.readBigUInt64LE(4)).toBe((ONE_SOL * 3n) / 4n);
  });

  it("wraps nothing when the merchant already holds enough, and still closes the account", () => {
    const plan = depositInstructions({
      merchant: MERCHANT,
      mint: WRAPPED_SOL_MINT,
      tokenProgram: TOKEN_PROGRAM_ID,
      amount: ONE_SOL,
      from: null,
      wrappedBalance: ONE_SOL * 2n,
      createVault: false,
    });

    expect(plan.wrapping).toBe(0n);
    expect(programs(plan.instructions)).toEqual([
      ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(),
      ESCROW_PROGRAM_ID.toBase58(),
      TOKEN_PROGRAM_ID.toBase58(),
    ]);
    // The close is what returns the SOL that is left over. Dropping it here
    // would leave the merchant holding a wSOL account they never opened.
    expect(plan.instructions[2]!.data[0]).toBe(CLOSE_ACCOUNT);
  });

  it("creates the vault before it moves any lamports", () => {
    const plan = depositInstructions({
      merchant: MERCHANT,
      mint: WRAPPED_SOL_MINT,
      tokenProgram: TOKEN_PROGRAM_ID,
      amount: ONE_SOL,
      from: null,
      wrappedBalance: 0n,
      createVault: true,
    });

    // Otherwise a merchant depositing nearly their whole balance fails
    // partway through on rent, having already wrapped.
    expect(plan.instructions[0]!.programId.equals(ESCROW_PROGRAM_ID)).toBe(true);
    expect(plan.instructions[1]!.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)).toBe(true);
  });
});

describe("a withdrawal", () => {
  it("creates the destination account idempotently for an ordinary token, and leaves it open", () => {
    const plan = withdrawInstructions({
      merchant: MERCHANT,
      mint: SPL_MINT,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      amount: 100n,
    });

    expect(programs(plan.instructions)).toEqual([
      ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(),
      ESCROW_PROGRAM_ID.toBase58(),
    ]);
    expect(plan.unwrapping).toBe(false);
    expect(plan.tokenAccount.equals(ataFor(MERCHANT, SPL_MINT, TOKEN_2022_PROGRAM_ID))).toBe(true);
  });

  it("closes the destination account for SOL, so what arrives is SOL", () => {
    const plan = withdrawInstructions({
      merchant: MERCHANT,
      mint: WRAPPED_SOL_MINT,
      tokenProgram: TOKEN_PROGRAM_ID,
      amount: ONE_SOL,
    });

    expect(programs(plan.instructions)).toEqual([
      ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(),
      ESCROW_PROGRAM_ID.toBase58(),
      TOKEN_PROGRAM_ID.toBase58(),
    ]);
    expect(plan.instructions[2]!.data[0]).toBe(CLOSE_ACCOUNT);
    expect(plan.unwrapping).toBe(true);
    // The close returns lamports to the merchant, not to a third party.
    expect(plan.instructions[2]!.keys[1]!.pubkey.equals(MERCHANT)).toBe(true);
  });

  it("pays the withdrawal into the same account it closes", () => {
    const plan = withdrawInstructions({
      merchant: MERCHANT,
      mint: WRAPPED_SOL_MINT,
      tokenProgram: TOKEN_PROGRAM_ID,
      amount: ONE_SOL,
    });

    // `to` is the fourth account of `withdraw_liquidity`: merchant,
    // liquidity vault, token vault, to. If these two ever diverge the
    // withdrawal lands somewhere the close does not reach and the merchant
    // is left holding wSOL.
    const paidInto = plan.instructions[1]!.keys[3]!.pubkey;
    const closed = plan.instructions[2]!.keys[0]!.pubkey;
    expect(paidInto.equals(closed)).toBe(true);
    expect(paidInto.equals(plan.tokenAccount)).toBe(true);
  });
});

/**
 * The last place a user could have been left holding wrapped SOL.
 *
 * The two flows above never leave an account behind — each closes the one
 * it opened, in the same transaction. A wallet can still arrive holding one
 * from somewhere else entirely, and before this the balance table could only
 * show it: a figure the wallet's own SOL balance does not include, in a form
 * the owner was never asked to understand, with no way back.
 */
describe("unwrapping a balance this app did not create", () => {
  it("closes the account it was given, not one derived from the mint", () => {
    // A wallet may hold wSOL in a non-associated account. Closing a derived
    // address instead would fail against a balance the owner can see.
    const strandedAccount = Keypair.generate().publicKey;
    const instructions = unwrapInstructions(MERCHANT, strandedAccount, TOKEN_PROGRAM_ID);

    expect(instructions).toHaveLength(1);
    expect(instructions[0]!.data[0]).toBe(CLOSE_ACCOUNT);
    expect(instructions[0]!.keys[0]!.pubkey.equals(strandedAccount)).toBe(true);
    expect(strandedAccount.equals(ataFor(MERCHANT, WRAPPED_SOL_MINT, TOKEN_PROGRAM_ID))).toBe(false);
  });

  it("returns the balance and the rent to the owner, and to nobody else", () => {
    const account = Keypair.generate().publicKey;
    const [close] = unwrapInstructions(MERCHANT, account, TOKEN_PROGRAM_ID);

    // `CloseAccount` is (account, destination, authority). Both the lamports
    // and the authority are the owner's — a destination that is anything
    // else is this app sending somebody's SOL somewhere they did not ask.
    expect(close!.keys[1]!.pubkey.equals(MERCHANT)).toBe(true);
    expect(close!.keys[2]!.pubkey.equals(MERCHANT)).toBe(true);
  });

  it("uses the token program the account actually lives under", () => {
    const account = Keypair.generate().publicKey;
    expect(programs(unwrapInstructions(MERCHANT, account, TOKEN_PROGRAM_ID))).toEqual([
      TOKEN_PROGRAM_ID.toBase58(),
    ]);
    expect(programs(unwrapInstructions(MERCHANT, account, TOKEN_2022_PROGRAM_ID))).toEqual([
      TOKEN_2022_PROGRAM_ID.toBase58(),
    ]);
  });
});
