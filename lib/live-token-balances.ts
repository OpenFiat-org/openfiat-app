import { PublicKey } from "@solana/web3.js";
import { getConnection } from "@/lib/onchain-config";

/**
 * What a wallet actually holds, read from its token accounts on Solana
 * devnet.
 *
 * # What this replaces
 *
 * `lib/data/wallet.ts` exported `WALLET_BALANCES` and `OPEN_BALANCE`:
 * constants asserting that the visitor holds 12,500 OPEN and about $9,400
 * of stablecoins. Every screen that read them told every visitor the same
 * thing, including one with no wallet connected, and including one whose
 * wallet is empty — which on devnet is every wallet, since the OPEN mint's
 * authority is permanently unset and no wallet can acquire any.
 *
 * The badge that said "12,500 OPEN" was therefore not an approximation. It
 * was a specific false statement about the reader's own money.
 */

/** One SPL token position. `amount` is raw base units, as stored. */
export interface TokenBalance {
  /** The token account itself — the address a transfer must name as its
   *  source. Derived addresses are not assumed: a wallet may hold a mint in
   *  a non-associated account, and a deposit that named the ATA instead
   *  would fail against a balance the user can plainly see. */
  address: PublicKey;
  mint: PublicKey;
  amount: bigint;
  decimals: number;
  /** Which token program holds it — legacy SPL Token or Token-2022. */
  tokenProgram: PublicKey;
}

/** Both token programs a mint can live under. A wallet can hold positions
 *  in either, and asking about only one silently under-reports. */
const TOKEN_PROGRAM_IDS = [
  new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
  new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"),
];

/**
 * Every token position this wallet holds, across both token programs.
 *
 * Zero-balance accounts are kept rather than filtered: a merchant whose
 * vault deposit emptied their wallet still owns that token account, and
 * showing the position at 0 is more informative than showing nothing at
 * all, which reads as "you never held this".
 *
 * Throws if the cluster is unreachable — callers must not render that as
 * an empty wallet.
 */
export async function fetchTokenBalances(owner: PublicKey): Promise<TokenBalance[]> {
  const connection = getConnection();
  const responses = await Promise.all(
    TOKEN_PROGRAM_IDS.map((programId) =>
      connection.getParsedTokenAccountsByOwner(owner, { programId }),
    ),
  );

  return responses.flatMap((response, i) =>
    response.value.map(({ pubkey, account }) => {
      const info = account.data.parsed.info as {
        mint: string;
        tokenAmount: { amount: string; decimals: number };
      };
      return {
        address: pubkey,
        mint: new PublicKey(info.mint),
        amount: BigInt(info.tokenAmount.amount),
        decimals: info.tokenAmount.decimals,
        tokenProgram: TOKEN_PROGRAM_IDS[i]!,
      };
    }),
  );
}

/**
 * Native SOL, in lamports — the balance that pays for transactions.
 *
 * Kept apart from `fetchTokenBalances` on purpose, because it is a different
 * kind of thing and conflating the two is expensive. Native SOL sits in the
 * account itself and pays every fee and every rent exemption; wrapped SOL is
 * an ordinary SPL position that pays for nothing. A screen that shows one
 * under the other's name leaves a user reading a tradeable balance as their
 * fee balance, and the failure that follows — a transaction that cannot pay
 * for itself — gives them no way to work out why.
 *
 * Throws if the cluster is unreachable, like every other read here. A zero
 * gas balance and an unread one are not the same finding.
 */
export async function fetchNativeSolBalance(owner: PublicKey): Promise<bigint> {
  return BigInt(await getConnection().getBalance(owner));
}

/**
 * This wallet's balance of one mint, or `null` if it holds no token account
 * for it at all.
 *
 * `null` and a zero balance are deliberately different returns. "You have
 * never held this token" and "you hold none right now" lead to different
 * next steps — the first needs an account created before a transfer can
 * even land — and a deposit form that conflates them gives the wrong
 * instruction.
 */
export async function fetchTokenBalance(
  owner: PublicKey,
  mint: PublicKey,
): Promise<TokenBalance | null> {
  const connection = getConnection();
  for (const programId of TOKEN_PROGRAM_IDS) {
    const { value } = await connection.getParsedTokenAccountsByOwner(owner, { mint, programId });
    const account = value[0];
    if (!account) continue;
    const info = account.account.data.parsed.info as {
      tokenAmount: { amount: string; decimals: number };
    };
    return {
      address: account.pubkey,
      mint,
      amount: BigInt(info.tokenAmount.amount),
      decimals: info.tokenAmount.decimals,
      tokenProgram: programId,
    };
  }
  return null;
}
