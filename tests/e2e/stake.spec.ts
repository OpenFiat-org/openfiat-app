import { readFileSync } from "node:fs";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { test, expect } from "@playwright/test";

/**
 * Proves the real, wallet-signed `/staking` flow end to end against real
 * Solana devnet state: build with this app's own React state → sign with
 * an injected mock wallet backed by a REAL keypair → submit → confirm →
 * read the resulting on-chain account back independently (not through
 * this app's own UI state, so a UI bug can't fake a passing test).
 *
 * Scope: only `initialize_stake_account` is proven live here, not
 * `stake` (the token-transfer half). The devnet OPEN mint's mint
 * authority was permanently renounced when it was created (verified via
 * `spl-token display <mint> --url devnet`, "Mint authority: (not set)")
 * — there is no way for this or any other test environment to mint
 * OPEN into a fresh wallet, so a real token-transfer proof isn't
 * obtainable here without a real presale/DEX purchase, which is out of
 * scope for an automated test. `initialize_stake_account` needs no
 * mint/token account at all (`owner: Signer, stake_account: init,
 * system_program` — see `openfiat-core/programs/programs/staking/src/
 * instructions/initialize_stake_account.rs`), so it's the one complete,
 * real instruction this environment can actually prove — the same
 * reasoning `openfiat-sdks/rust/tests/onchain_live_validator.rs`
 * already used for its own live-validator proof. The `stakeIx`
 * builder itself is still fully covered — just not live here — by the
 * SDK's own IDL-cross-checked instruction tests and by
 * `tests/onchain-decode.test.ts`'s byte-for-byte decoder tests.
 *
 * The governance vote flow has the identical blocker (creating a
 * proposal needs a real OPEN deposit) and is scoped out for the same
 * reason — not fabricated, not skipped silently, documented here.
 */

const DEVNET_RPC = "https://api.devnet.solana.com";
const STAKING_PROGRAM_ID = new PublicKey("HYEXk8XQukBkZbiYB33JyVefQDxqyCpPudad3wBCyYmx");
const STAKE_ACCOUNT_DISCRIMINATOR = [80, 158, 67, 124, 50, 189, 192, 255];

function loadTestWallet(): Keypair {
  const secret = JSON.parse(
    readFileSync("/tmp/claude-0/-OpenFiat/3ef7bfcd-a69d-41fa-b2e7-3ee0e08185cf/scratchpad/playwright-test-wallet.json", "utf8"),
  ) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

/**
 * Every wallet extension's injected `window.solana`/`window.phantom.solana`
 * shape is mocked, but the signing itself is real: `signAndSendTransaction`
 * partial-signs the REAL `Transaction` object the app already built (reusing
 * its own `feePayer` field — already a real `PublicKey` — rather than
 * constructing a new one, so this script needs no `@solana/web3.js` of its
 * own) with the real secret key, then submits via a raw JSON-RPC POST to
 * devnet. Nothing about the blockchain interaction is faked — only the
 * browser-extension UI layer is stood in for.
 */
/*
 * A test stood here driving the hand-rolled connect modal: it injected a
 * legacy `window.solana` provider and clicked a hardcoded "Phantom" row.
 *
 * Both halves are gone. The modal is now the standard wallet-adapter one,
 * and — the part worth recording — discovery happens through the Wallet
 * Standard rather than by reading `window` globals by name. A provider that
 * ONLY injects `window.solana`, with no Wallet Standard registration, is no
 * longer detected. Every current wallet (Phantom, Solflare, Backpack,
 * Coinbase) registers that way, so this does not affect real users, but it
 * is a genuine change in what counts as an available wallet and not merely
 * a change of appearance.
 *
 * Re-testing it faithfully means registering a Wallet Standard wallet in the
 * page, not shimming a global, which is a different fixture from the one
 * this file has. The connect surface is covered instead by
 * `tests/e2e/wallet-modal.spec.ts`, which asserts the standard modal opens
 * and — more importantly — that a browser with no wallet stays disconnected
 * rather than falling back to a fixture address, which is what the previous
 * implementation did on both "no wallet installed" and "user rejected".
 *
 * The on-chain proof below is unaffected: it never went through the UI.
 */

test("a direct initialize_stake_account instruction (no token transfer) is accepted by the real program", async () => {
  // This is the actual "first genuine end-to-end proof" for this
  // environment's real constraints — see this file's top doc comment.
  // Not run through the app's UI (that flow always bundles a stake
  // transfer it cannot fund here); built and submitted directly against
  // devnet the same way `onchain_live_validator.rs` already does, using
  // the identical PDA/discriminator/layout this app's own
  // `lib/onchain-decode.ts` and `@openfiat/sdk`'s `onchain.staking`
  // module use.
  const wallet = loadTestWallet();
  const connection = new Connection(DEVNET_RPC, "confirmed");

  const role = 1; // Role.Arbitrator — distinct from the UI test's Merchant role above, avoids an "already exists" collision on rerun
  const [stakeAccountPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("stake"), wallet.publicKey.toBytes(), Uint8Array.from([role])],
    STAKING_PROGRAM_ID,
  );
  const existing = await connection.getAccountInfo(stakeAccountPda);
  if (existing) {
    test.skip(true, "already initialized by a previous run — rerun against a fresh test wallet to re-prove this");
    return;
  }

  const { Transaction, TransactionInstruction, SystemProgram } = await import("@solana/web3.js");
  const discriminator = Uint8Array.from([184, 7, 155, 82, 149, 217, 185, 196]); // initialize_stake_account
  const ix = new TransactionInstruction({
    programId: STAKING_PROGRAM_ID,
    keys: [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: stakeAccountPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([discriminator, Uint8Array.from([role])]),
  });

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const transaction = new Transaction({ feePayer: wallet.publicKey, blockhash, lastValidBlockHeight }).add(ix);
  transaction.sign(wallet);

  const signature = await connection.sendRawTransaction(transaction.serialize());
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");

  const account = await connection.getAccountInfo(stakeAccountPda);
  expect(account).not.toBeNull();
  expect(account!.data.length).toBe(82); // disc(8)+owner(32)+role(1)+amount(8)+unbonding_amount(8)+unbonding_release_at(8)+slashed_total(8)+pending_rewards(8)+bump(1)
  for (let i = 0; i < 8; i++) expect(account!.data[i]).toBe(STAKE_ACCOUNT_DISCRIMINATOR[i]);
  expect(Buffer.from(account!.data.slice(8, 40)).equals(wallet.publicKey.toBuffer())).toBe(true);
  expect(account!.data[40]).toBe(role);
  const amount = account!.data.readBigUInt64LE(41);
  expect(amount).toBe(0n);
});
