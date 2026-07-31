import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { escrow, getConnection } from "@/lib/onchain-config";

/**
 * Liquidity-vault instructions, with the token program read from the mint
 * rather than assumed.
 *
 * The escrow program takes `Interface<TokenInterface>`, so a settlement mint
 * may be Token-2022 or legacy SPL — wSOL and real USDC are both legacy. The
 * SDK builders take the program as a parameter for that reason and derive
 * nothing themselves, since deriving it means an RPC read and a builder that
 * quietly performs network I/O is worse than one that asks.
 *
 * This module is where that read lives, so a component never has to know it
 * is one. It used to also carry a `withTokenProgram` helper that substituted
 * the key *after* the builder returned, because the pinned SDK hardcoded
 * Token-2022; that is gone with the SDK pin move, and these are now direct
 * calls.
 */

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
  return escrow.createLiquidityVaultIx(merchant, mint, tokenProgram);
}

/** Moves `amount` base units from the merchant's own token account into the vault. */
export function depositIx(
  merchant: PublicKey,
  mint: PublicKey,
  from: PublicKey,
  amount: bigint,
  tokenProgram: PublicKey,
): TransactionInstruction {
  return escrow.depositLiquidityIx(merchant, mint, tokenProgram, from, amount);
}

/** Moves `amount` base units out of the vault's available balance to `to`. */
export function withdrawIx(
  merchant: PublicKey,
  mint: PublicKey,
  to: PublicKey,
  amount: bigint,
  tokenProgram: PublicKey,
): TransactionInstruction {
  return escrow.withdrawLiquidityIx(merchant, mint, tokenProgram, to, amount);
}
