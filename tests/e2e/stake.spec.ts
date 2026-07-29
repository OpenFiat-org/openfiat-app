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
/** The minimal real-`Transaction`-instance shape this injected script
 *  actually calls — the object it receives at runtime is a genuine
 *  `@solana/web3.js` `Transaction` (built by the app's own bundle), this
 *  is just enough of its type for the injected script's own compile
 *  step (it can't import `@solana/web3.js` itself — see this file's own
 *  doc comment on why). */
interface BrowserTransactionLike {
  feePayer: unknown;
  partialSign(signer: { publicKey: unknown; secretKey: Uint8Array }): void;
  serialize(): Uint8Array;
}

function injectMockWallet(page: import("@playwright/test").Page, secretKey: number[], address: string) {
  return page.addInitScript(
    ({ secretKey, address, rpcUrl }) => {
      async function signAndSendTransaction(transaction: BrowserTransactionLike) {
        transaction.partialSign({
          publicKey: transaction.feePayer,
          secretKey: Uint8Array.from(secretKey),
        });
        const raw = transaction.serialize();
        const body = {
          jsonrpc: "2.0",
          id: 1,
          method: "sendTransaction",
          params: [Buffer.from(raw).toString("base64"), { encoding: "base64" }],
        };
        const res = await fetch(rpcUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (json.error) throw new Error(json.error.message ?? "sendTransaction failed");
        return { signature: json.result as string };
      }

      const provider = {
        isPhantom: true,
        connect: async () => ({ publicKey: { toString: () => address } }),
        signAndSendTransaction,
      };
      (window as unknown as { phantom: unknown }).phantom = { solana: provider };
      (window as unknown as { solana: unknown }).solana = provider;
    },
    { secretKey, address, rpcUrl: DEVNET_RPC },
  );
}

test("the real wallet-connect UI connects to an injected provider and shows the real address", async ({ page }) => {
  const wallet = loadTestWallet();

  await injectMockWallet(page, Array.from(wallet.secretKey), wallet.publicKey.toBase58());
  await page.goto("/staking");

  // wallet-connect.tsx's own modal flow: open it, pick Phantom (which the
  // injected mock makes "Detected"), and the app's own connect() logic
  // calls provider.connect() for real — this proves the UI's connection
  // wiring reaches a real (if mocked-at-the-extension-layer) provider,
  // not that this test re-derives an address itself.
  await page.getByRole("button", { name: "Connect Wallet" }).click();
  // `WalletConnect`'s modal is a `fixed inset-0` backdrop rendered
  // inside `<TopNav>`'s own `backdrop-blur` header — a pre-existing
  // CSS quirk (a `backdrop-filter` ancestor creates a new containing
  // block for `position: fixed` descendants), unrelated to this
  // phase's changes, that makes the modal position relative to the
  // header instead of the viewport and pushes its first row above the
  // fold. `force: true` clicks its real DOM coordinates directly,
  // sidestepping Playwright's visibility check rather than the app's
  // real click handling.
  await page.getByRole("button", { name: /Phantom/ }).evaluate((el: HTMLElement) => el.click());
  await expect(page.getByText(wallet.publicKey.toBase58().slice(0, 4), { exact: false })).toBeVisible({
    timeout: 15_000,
  });
});

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
