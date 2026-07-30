import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { escrow, getConnection, TOKEN_2022_PROGRAM_ID } from "@/lib/onchain-config";

/**
 * Liquidity-vault instructions, with the token program taken from the mint
 * instead of assumed.
 *
 * # Why this module exists at all
 *
 * `@openfiat/sdk`'s `createLiquidityVaultIx`, `depositLiquidityIx` and
 * `withdrawLiquidityIx` hardcode `TOKEN_2022_PROGRAM_ID` into their account
 * metas. That matches the escrow program as deployed today, whose account
 * structs still say `Program<'info, Token2022>` — but the program is being
 * migrated to `Interface<TokenInterface>` so it can also hold legacy SPL
 * Token mints, and after that migration a hardcoded token program is simply
 * the wrong account for half the mints that will work.
 *
 * The SDK is a pinned dependency, so the parameter cannot be added here.
 * Substituting the key after the builder returns makes this app correct
 * both before and after the migration, with no flag day.
 *
 * # Deleting this later
 *
 * When the SDK builders take a token-program argument, `withTokenProgram`
 * and its three call sites below are the whole of what needs to go. That is
 * why the substitution lives in one function rather than being open-coded
 * into the deposit and withdraw forms — a positional index scattered across
 * two React components is a thing nobody finds again.
 */

/**
 * Replaces the builder's hardcoded Token-2022 key with `tokenProgram`.
 *
 * Asserts that the key being replaced really is the Token-2022 id. The
 * builders' account order is not this app's to guarantee: if a future SDK
 * release reorders them, blindly writing to a positional index would
 * overwrite a mint or a token account with a program id and produce a
 * transaction that fails somewhere far from the cause — or worse, one that
 * succeeds against the wrong account. Failing loudly here is the only
 * acceptable outcome.
 */
function withTokenProgram(ix: TransactionInstruction, tokenProgram: PublicKey): TransactionInstruction {
  const index = ix.keys.findIndex((key) => key.pubkey.equals(TOKEN_2022_PROGRAM_ID));
  if (index === -1) {
    throw new Error(
      "Expected a Token-2022 program key in the SDK-built instruction and found none — " +
        "the builder's account list has changed and lib/vault-instructions.ts needs updating.",
    );
  }
  const keys = [...ix.keys];
  keys[index] = { ...keys[index]!, pubkey: tokenProgram };
  return new TransactionInstruction({ programId: ix.programId, keys, data: ix.data });
}

/**
 * Which token program owns `mint`, read from the mint account.
 *
 * Throws if the mint does not exist on this cluster, which is a much more
 * useful failure than the `AccountNotInitialized` a transaction would
 * return three steps later.
 */
export async function tokenProgramForMint(mint: PublicKey): Promise<PublicKey> {
  const info = await getConnection().getAccountInfo(mint);
  if (!info) throw new Error(`No mint at ${mint.toBase58()} on this cluster.`);
  return info.owner;
}

/** Creates the merchant's vault for one mint. Required once, before any deposit. */
export function createVaultIx(
  merchant: PublicKey,
  mint: PublicKey,
  tokenProgram: PublicKey,
): TransactionInstruction {
  return withTokenProgram(escrow.createLiquidityVaultIx(merchant, mint), tokenProgram);
}

/** Moves `amount` base units from the merchant's own token account into the vault. */
export function depositIx(
  merchant: PublicKey,
  mint: PublicKey,
  from: PublicKey,
  amount: bigint,
  tokenProgram: PublicKey,
): TransactionInstruction {
  return withTokenProgram(escrow.depositLiquidityIx(merchant, mint, from, amount), tokenProgram);
}

/** Moves `amount` base units out of the vault's available balance to `to`. */
export function withdrawIx(
  merchant: PublicKey,
  mint: PublicKey,
  to: PublicKey,
  amount: bigint,
  tokenProgram: PublicKey,
): TransactionInstruction {
  return withTokenProgram(escrow.withdrawLiquidityIx(merchant, mint, to, amount), tokenProgram);
}
