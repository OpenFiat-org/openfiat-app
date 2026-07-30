/**
 * Proves `lib/live-vaults.ts` and `lib/vault-instructions.ts` against the
 * real escrow program on Solana devnet, with real signed transactions.
 *
 * This exists because a vault screen that renders is not evidence that a
 * vault works. The counters this app shows are token balances, so the only
 * verification worth anything is: read the vault, move tokens through it,
 * read it again, and assert the numbers changed by exactly the amounts
 * moved. Everything below is a real transaction with a real signature.
 *
 * Run:  npx tsx scripts/prove-devnet-vault-deposit-withdraw.ts
 * Needs: ~/.config/solana/id.json funded with devnet SOL, holding the test
 *        stablecoin below. Mirrors `openfiat-core`'s own
 *        `prove-devnet-escrow-release.ts` in intent.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { fetchVault, formatBaseUnits, type LiveVault } from "../lib/live-vaults";
import { depositIx, tokenProgramForMint, withdrawIx } from "../lib/vault-instructions";

/** The devnet test stablecoin — 6 decimals, Token-2022. NOT OPEN: the OPEN
 *  mint's authority is permanently unset, so no wallet can ever obtain any
 *  and no end-to-end proof denominated in it is possible. */
const MINT = new PublicKey("SK1JEbfsjjTG2WELNirmM7iJVcdnwerqfF32kCnoWsM");

const DEPOSIT = 250_000_000n; // 250.00
const WITHDRAW = 100_000_000n; // 100.00

const connection = new Connection("https://api.devnet.solana.com", "confirmed");

function localKeypair(): Keypair {
  const file = path.join(os.homedir(), ".config", "solana", "id.json");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(file, "utf8"))));
}

function show(label: string, vault: LiveVault): void {
  const f = (v: bigint) => formatBaseUnits(v, vault.decimals);
  console.log(
    `${label.padEnd(18)} total=${f(vault.total).padStart(9)}  available=${f(vault.available).padStart(9)}` +
      `  reserved=${f(vault.reserved)}  settled=${f(vault.settled)}  pending=${f(vault.pendingSettlement)}`,
  );
}

async function send(merchant: Keypair, instruction: Transaction["instructions"][number]): Promise<string> {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const tx = new Transaction({ feePayer: merchant.publicKey, blockhash, lastValidBlockHeight }).add(instruction);
  tx.sign(merchant);
  const signature = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  return signature;
}

function assertEq(label: string, actual: bigint, expected: bigint): void {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
  console.log(`  ok  ${label} = ${actual}`);
}

async function main(): Promise<void> {
  const merchant = localKeypair();
  const tokenProgram = await tokenProgramForMint(MINT);
  const ata = getAssociatedTokenAddressSync(MINT, merchant.publicKey, false, tokenProgram);

  console.log(`merchant      ${merchant.publicKey.toBase58()}`);
  console.log(`mint          ${MINT.toBase58()}`);
  console.log(`token program ${tokenProgram.toBase58()} (read from the mint's owner, not hardcoded)\n`);

  const before = await fetchVault(merchant.publicKey, MINT);
  if (!before) throw new Error("No vault for this merchant/mint — create one before running this proof.");
  show("before", before);

  const depositSig = await send(
    merchant,
    depositIx(merchant.publicKey, MINT, ata, DEPOSIT, tokenProgram),
  );
  console.log(`\ndeposit_liquidity  ${depositSig}`);
  const afterDeposit = (await fetchVault(merchant.publicKey, MINT))!;
  show("after deposit", afterDeposit);
  assertEq("total rose by the deposit", afterDeposit.total, before.total + DEPOSIT);
  assertEq("available rose by the deposit", afterDeposit.available, before.available + DEPOSIT);

  const withdrawSig = await send(
    merchant,
    withdrawIx(merchant.publicKey, MINT, ata, WITHDRAW, tokenProgram),
  );
  console.log(`\nwithdraw_liquidity ${withdrawSig}`);
  const afterWithdraw = (await fetchVault(merchant.publicKey, MINT))!;
  show("after withdraw", afterWithdraw);
  assertEq("available fell by the withdrawal", afterWithdraw.available, afterDeposit.available - WITHDRAW);

  console.log("\nBoth instructions were built by lib/vault-instructions.ts and confirmed on devnet.");
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
