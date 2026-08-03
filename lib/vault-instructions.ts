import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import {
  ACCOUNT_SIZE,
  AccountLayout,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { escrow, getConnection } from "@/lib/onchain-config";
import { LIQUIDITY_VAULT_LEN } from "@/lib/onchain-decode";

/**
 * Liquidity-vault instructions, with the token program read from the mint
 * rather than assumed, and with wrapped SOL wrapped and unwrapped on the
 * user's behalf.
 *
 * The escrow program takes `Interface<TokenInterface>`, so a settlement mint
 * may be Token-2022 or legacy SPL — wSOL and real USDC are both legacy. The
 * SDK builders take the program as a parameter for that reason and derive
 * nothing themselves, since deriving it means an RPC read and a builder that
 * quietly performs network I/O is worse than one that asks.
 *
 * This module is where that read lives, so a component never has to know it
 * is one.
 *
 * # Why the wSOL handling is here and not in the SDK
 *
 * Wrapping is not an escrow instruction. It is a System transfer, a
 * `SyncNative` and a `CloseAccount`, none of which the escrow program knows
 * anything about — the program only ever sees a token account holding the
 * wSOL mint, and its account list is identical either way. Putting this in
 * `@openfiat/sdk`'s escrow builders would mean an escrow builder emitting
 * SPL-Token and System instructions, which is the wrong seam. It belongs at
 * the layer that assembles a transaction, which is this one.
 */

/**
 * Wrapped SOL, taken from `@solana/spl-token` rather than typed out here.
 *
 * `So11111111111111111111111111111111111111112` is one of the addresses a
 * transposed character in would still look right, and it is on the escrow
 * program's default settlement allowlist
 * (`escrow::constants::DEFAULT_SETTLEMENT_MINTS`), so a mistyped one would
 * be a silent look-alike rather than a load failure.
 */
export const WRAPPED_SOL_MINT = NATIVE_MINT;

/**
 * wSOL lives under the legacy SPL Token program and always has — Token-2022
 * did not exist when the native mint was created, and the native mint's
 * address is cluster-independent, so unlike every other mint this app
 * touches there is nothing to look up. Used only where a caller has not
 * already read the mint; `tokenProgramForMint` remains the authority.
 */
const WRAPPED_SOL_TOKEN_PROGRAM = TOKEN_PROGRAM_ID;

/** Wrapped SOL has SOL's own precision: 9 decimals, one lamport apiece. */
export const WRAPPED_SOL_DECIMALS = 9;

/** Whether `mint` is wrapped SOL, and therefore needs wrapping around it. */
export function isWrappedSol(mint: PublicKey): boolean {
  return mint.equals(WRAPPED_SOL_MINT);
}

/**
 * Headroom left unspent so the transaction can pay for itself.
 *
 * A base signature costs 5,000 lamports and these transactions carry one.
 * Double is reserved so that a wallet adding a priority fee — which every
 * mainstream wallet now does under load — cannot turn "deposit everything"
 * into a transaction the sender can no longer afford. 10,000 lamports is
 * 0.00001 SOL; nobody notices it, and running out of fee is the one failure
 * a Max button is able to create entirely on its own.
 */
const FEE_HEADROOM_LAMPORTS = 10_000n;

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

/**
 * The merchant's associated token account for `mint`.
 *
 * Both wSOL paths use this rather than whichever wSOL account a balance
 * scan happens to find first, so that the account created, funded, drained
 * and closed is always provably the same one.
 */
export function ataFor(
  merchant: PublicKey,
  mint: PublicKey,
  tokenProgram: PublicKey,
): PublicKey {
  return getAssociatedTokenAddressSync(mint, merchant, false, tokenProgram);
}

/** A complete single-transaction plan, plus what a user has to be told about it. */
export interface VaultTransfer {
  instructions: TransactionInstruction[];
  /** The token account the tokens move through. */
  tokenAccount: PublicKey;
  /** Lamports of native SOL wrapped into `tokenAccount` first. `0n` unless the mint is wSOL. */
  wrapping: bigint;
  /**
   * Whether `tokenAccount` is closed at the end, returning everything left
   * in it — including any balance that was already there — to the merchant
   * as native SOL. `false` unless the mint is wSOL.
   */
  unwrapping: boolean;
}

export interface DepositParams {
  merchant: PublicKey;
  mint: PublicKey;
  tokenProgram: PublicKey;
  /** Base units to put into the vault. */
  amount: bigint;
  /**
   * The merchant's existing token account for this mint, or `null` if they
   * have none. Ignored for wSOL, where the associated account is used
   * whether or not it exists yet.
   */
  from: PublicKey | null;
  /** What the merchant's associated wSOL account already holds. Only read for wSOL. */
  wrappedBalance?: bigint;
  /** Whether the vault must be created by this transaction too. */
  createVault: boolean;
}

/**
 * Everything one deposit needs, in one transaction.
 *
 * # wSOL is wrapped and unwrapped inside this transaction, never outside it
 *
 * A user holding SOL does not hold wSOL, and the escrow program can only
 * take a token account. That gap is closed here rather than by asking the
 * user to wrap first:
 *
 *   1. create the associated wSOL account if it is missing — idempotently,
 *      so a race with the user's own wallet cannot fail the transaction,
 *   2. System-transfer the shortfall into it and `SyncNative`, so the token
 *      program credits those lamports as a token balance,
 *   3. `deposit_liquidity`,
 *   4. `CloseAccount` back to the merchant.
 *
 * All four are in one transaction because the failure they exist to prevent
 * is a *partial* wrap. Split into two transactions, a user whose second one
 * fails is left holding a token account they never asked for, containing
 * money their wallet's SOL balance does not show, recoverable only by
 * knowing what wSOL is — which is the entire thing this is meant to spare
 * them. Solana executes a transaction atomically, so either the deposit
 * landed and the account is gone, or nothing happened at all.
 *
 * Step 4 runs unconditionally, not only when step 1 created the account.
 * That is deliberate and it has a visible consequence: a merchant already
 * holding wSOL gets that balance back as SOL too. It is the behaviour the
 * rest of this flow promises — SOL behaves like every other asset and no
 * wSOL account is left behind — and the amount is stated in the form before
 * signing rather than discovered afterwards. Closing also returns the
 * account's rent, so wrapping costs nothing rather than 0.00204 SOL a time.
 *
 * The vault is created before any lamports move, so a merchant depositing
 * nearly their whole balance fails on the amount rather than halfway
 * through, on rent.
 */
export function depositInstructions(p: DepositParams): VaultTransfer {
  const createVault = p.createVault ? [createVaultIx(p.merchant, p.mint, p.tokenProgram)] : [];

  if (!isWrappedSol(p.mint)) {
    if (!p.from) {
      throw new Error(
        `This wallet has no token account for ${p.mint.toBase58()}, so it holds none to deposit.`,
      );
    }
    return {
      instructions: [...createVault, depositIx(p.merchant, p.mint, p.from, p.amount, p.tokenProgram)],
      tokenAccount: p.from,
      wrapping: 0n,
      unwrapping: false,
    };
  }

  const ata = ataFor(p.merchant, p.mint, p.tokenProgram);
  // Only the shortfall is wrapped. A merchant already holding wSOL spends
  // that first, so a deposit does not needlessly push lamports out through
  // the system program and straight back in.
  const shortfall = p.amount - (p.wrappedBalance ?? 0n);
  const wrapping = shortfall > 0n ? shortfall : 0n;

  return {
    instructions: [
      ...createVault,
      createAssociatedTokenAccountIdempotentInstruction(
        p.merchant,
        ata,
        p.merchant,
        p.mint,
        p.tokenProgram,
      ),
      ...(wrapping > 0n
        ? [
            SystemProgram.transfer({ fromPubkey: p.merchant, toPubkey: ata, lamports: wrapping }),
            // Lamports sent to a token account are invisible to the token
            // program until this re-reads the account's lamports into its
            // `amount` field. Without it, the transfer above is money
            // sitting in an account with a zero balance.
            createSyncNativeInstruction(ata, p.tokenProgram),
          ]
        : []),
      depositIx(p.merchant, p.mint, ata, p.amount, p.tokenProgram),
      createCloseAccountInstruction(ata, p.merchant, p.merchant, [], p.tokenProgram),
    ],
    tokenAccount: ata,
    wrapping,
    unwrapping: true,
  };
}

export interface WithdrawParams {
  merchant: PublicKey;
  mint: PublicKey;
  tokenProgram: PublicKey;
  amount: bigint;
}

/**
 * Everything one withdrawal needs, in one transaction.
 *
 * The destination is created idempotently in every case: a merchant who
 * deposited their whole balance may well have closed that account since,
 * and a withdrawal that fails because the destination no longer exists is a
 * dead end with no obvious fix.
 *
 * For wSOL the account is then closed again in the same transaction, so
 * what arrives in the wallet is SOL and not a token nobody asked for. As on
 * the deposit side this returns any wSOL that was already there as well,
 * which the form states before signing.
 */
export function withdrawInstructions(p: WithdrawParams): VaultTransfer {
  const destination = ataFor(p.merchant, p.mint, p.tokenProgram);
  const unwrapping = isWrappedSol(p.mint);
  return {
    instructions: [
      createAssociatedTokenAccountIdempotentInstruction(
        p.merchant,
        destination,
        p.merchant,
        p.mint,
        p.tokenProgram,
      ),
      withdrawIx(p.merchant, p.mint, destination, p.amount, p.tokenProgram),
      ...(unwrapping
        ? [createCloseAccountInstruction(destination, p.merchant, p.merchant, [], p.tokenProgram)]
        : []),
    ],
    tokenAccount: destination,
    wrapping: 0n,
    unwrapping,
  };
}

/**
 * Turns a wrapped-SOL account back into plain SOL, and closes it.
 *
 * # Why this exists outside the vault flows
 *
 * The deposit and withdraw paths already leave no wrapped account behind:
 * both close it in the same transaction that opened it, so a merchant using
 * this app never sees one. They are not the only way a wallet acquires one.
 * Another application, a wallet's own swap, or a transaction of ours that
 * some future change splits in two, all leave a wrapped balance sitting in a
 * token account — money the wallet's SOL figure does not show, recoverable
 * only by knowing what wrapping is, which is exactly the thing this app
 * exists to spare somebody.
 *
 * So the balance table offers the way back. `CloseAccount` moves the whole
 * balance to `owner` as native SOL and returns the account's rent with it;
 * there is no partial unwrap and none is offered, because a wrapped balance
 * is not something a user of this app has a reason to keep some of.
 *
 * `account` is the token account as read, not a derived address. A wallet
 * may hold wSOL in a non-associated account — `fetchTokenBalances` returns
 * whatever exists — and closing an address we derived instead would fail
 * against a balance the owner can plainly see.
 */
export function unwrapInstructions(
  owner: PublicKey,
  account: PublicKey,
  tokenProgram: PublicKey,
): TransactionInstruction[] {
  return [createCloseAccountInstruction(account, owner, owner, [], tokenProgram)];
}

/** How much SOL a wallet can actually put into a wSOL vault, and why not more. */
export interface WrapCapacity {
  /** The wallet's native SOL, in lamports. */
  lamports: bigint;
  /** What its associated wSOL account already holds, and which a deposit spends first. */
  wrapped: bigint;
  /**
   * Lamports that must stay behind: rent for the accounts this transaction
   * opens, plus fee headroom. Not all of it is a cost — see `refunded`.
   */
  reserved: bigint;
  /** The part of `reserved` this same transaction hands straight back. */
  refunded: bigint;
  /** The largest amount a deposit may name. Never negative. */
  depositable: bigint;
}

/**
 * Reads what a wSOL deposit can be sized against.
 *
 * A wallet's SOL balance is not that number, for three reasons a user
 * cannot be expected to hold in their head: the transaction pays a fee, it
 * pays rent for the wSOL account it opens, and the first time round it also
 * pays rent for the two accounts a vault is made of. Sizing Max against the
 * raw balance would build a transaction that runs out of lamports partway
 * through — the failure a Max button most has to avoid.
 *
 * The wSOL account's rent comes back inside the same transaction, since the
 * account is closed at the end, so it is reported as `refunded` rather than
 * presented as a cost.
 *
 * Throws if the cluster cannot be reached. Callers must not render that as
 * a zero balance.
 */
export async function fetchWrapCapacity(
  merchant: PublicKey,
  options: { createVault: boolean; tokenProgram?: PublicKey },
): Promise<WrapCapacity> {
  const connection = getConnection();
  const tokenProgram = options.tokenProgram ?? WRAPPED_SOL_TOKEN_PROGRAM;
  const ata = ataFor(merchant, WRAPPED_SOL_MINT, tokenProgram);

  const [lamports, ataInfo, tokenAccountRent, vaultStateRent] = await Promise.all([
    connection.getBalance(merchant),
    connection.getAccountInfo(ata),
    connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE),
    connection.getMinimumBalanceForRentExemption(LIQUIDITY_VAULT_LEN),
  ]);

  // Rent only for an account this transaction actually opens. An existing
  // wSOL account is already rent-exempt, and charging for it twice would
  // understate what the merchant can deposit.
  const wsolRent = ataInfo ? 0n : BigInt(tokenAccountRent);
  // A vault is two accounts — the `LiquidityVault` state PDA and its token
  // account. Both are `init` in `create_liquidity_vault`, both paid for by
  // the merchant, and neither is ever refunded.
  const vaultRent = options.createVault ? BigInt(vaultStateRent) + BigInt(tokenAccountRent) : 0n;

  const wrapped = ataInfo ? AccountLayout.decode(ataInfo.data).amount : 0n;
  const reserved = wsolRent + vaultRent + FEE_HEADROOM_LAMPORTS;
  const spendable = BigInt(lamports) - reserved;

  return {
    lamports: BigInt(lamports),
    wrapped,
    reserved,
    refunded: wsolRent,
    depositable: wrapped + (spendable > 0n ? spendable : 0n),
  };
}

/** What the merchant's associated wSOL account holds, or `0n` if it does not exist. */
export async function fetchWrappedSolBalance(
  merchant: PublicKey,
  tokenProgram: PublicKey = WRAPPED_SOL_TOKEN_PROGRAM,
): Promise<bigint> {
  const ata = ataFor(merchant, WRAPPED_SOL_MINT, tokenProgram);
  const info = await getConnection().getAccountInfo(ata);
  return info ? AccountLayout.decode(info.data).amount : 0n;
}
