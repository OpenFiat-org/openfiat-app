import {
  PublicKey,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
} from "@solana/spl-token";

import { escrow, getConnection } from "@/lib/onchain-config";
import { nodeUrl } from "@/lib/node-endpoint";
import { nodeRpc } from "@/lib/node-rpc";
import {
  decodeFeeConfig,
  decodeTradeEscrow,
  type DecodedFeeConfig,
  type DecodedTradeEscrow,
} from "@/lib/onchain-decode";
import { ataFor, isWrappedSol, tokenProgramForMint } from "@/lib/vault-instructions";

/**
 * The on-chain half of a trade: locking the merchant's tokens into a trade
 * escrow, approving, and releasing them to the buyer.
 *
 * # Who signs what, and why the buyer cannot fund their own escrow
 *
 * Three of the four instructions here take the **merchant** as a signer —
 * `reserve_liquidity`, `create_trade_escrow` and `fund_trade_escrow` all move
 * or mark the merchant's own liquidity vault, and `approve_settlement` is the
 * merchant saying the fiat arrived. That is a fact about the program, not a
 * gap in this app: a taker's wallet cannot lock a merchant's inventory, so
 * the escrow leg of every trade waits on the merchant's client. A buyer's
 * screen has to say it is waiting rather than offer a button that would be
 * rejected.
 *
 * `release_escrow` is the exception and takes no signer at all. Once the
 * escrow is approved anyone may push the release through, so the buyer can
 * finish their own trade without waiting on the merchant a second time.
 *
 * # The release goes through the node, not straight to the cluster
 *
 * A settlement becomes `Completed` when a node observes the release
 * confirmed, not when a client says it sent one — `apply_escrow_released` is
 * local bookkeeping over an independently verifiable fact, deliberately not a
 * signed peer-to-peer claim. The only way a node learns which transaction to
 * watch is `sendTransaction`'s `correlation` field, which is why the release
 * is signed here and relayed through the node rather than broadcast directly.
 * A release broadcast straight at Solana would confirm perfectly well and
 * leave every node's copy of the settlement sitting in `Approved` forever.
 */

/** How a `sendTransaction` relay is correlated back to the settlement it finishes. */
export function settlementCorrelation(settlementId: string): string {
  return `settlement:${settlementId}`;
}

/** Everything both the escrow instructions and the release need to know. */
export interface EscrowParties {
  /** The reservation id as a `u64` — see `escrowIdFor` in `lib/trade-flow.ts`. */
  reservationId: bigint;
  mint: PublicKey;
  /** Read from the mint account's own `owner`; never assumed. */
  tokenProgram: PublicKey;
  /** The merchant's wallet, which is also the liquidity vault's authority. */
  merchant: PublicKey;
  buyer: PublicKey;
  /** Base units of `mint`. */
  amount: bigint;
}

/** The fee configuration, read from the chain. */
export async function fetchFeeConfig(): Promise<DecodedFeeConfig> {
  const [address] = escrow.feeConfigPda();
  const info = await getConnection().getAccountInfo(address);
  if (!info) {
    throw new Error(
      "The escrow program's fee configuration does not exist on this cluster, so no trade can be released here.",
    );
  }
  return decodeFeeConfig(new Uint8Array(info.data));
}

/**
 * The trade escrow for a reservation, or `null` when none has been created.
 *
 * `null` is the ordinary answer for a reservation whose merchant has not
 * locked the tokens yet, and callers must render it as "not funded" rather
 * than as a failure. A cluster that cannot be reached throws, which is a
 * different answer and must stay one.
 */
export async function fetchTradeEscrow(
  reservationId: bigint,
): Promise<DecodedTradeEscrow | null> {
  const [address] = escrow.tradeEscrowPda(reservationId);
  const info = await getConnection().getAccountInfo(address);
  return info ? decodeTradeEscrow(new Uint8Array(info.data)) : null;
}

/**
 * Whether this trade's mint can actually be released.
 *
 * `release_escrow` moves the settlement fee out of the trade's own escrow
 * token vault into the four treasuries `FeeConfig` names, with
 * `transfer_checked` — so those treasuries must hold **the mint this trade
 * settles in**. One `FeeConfig` carries one treasury set, which means fee
 * collection currently supports a single settlement mint at a time, and a
 * trade in any other allowlisted mint reaches `Approved` and then fails at
 * release with a mint mismatch the program reports as an account constraint.
 *
 * This is checked before the escrow is ever funded, because the failure is
 * otherwise discovered with the merchant's tokens already locked.
 */
export async function releasableMint(mint: PublicKey): Promise<boolean> {
  const info = await getConnection().getAccountInfo(
    (await fetchFeeConfig()).devTreasury,
  );
  // A token account's first 32 bytes are its mint, in both token programs.
  return info !== null && new PublicKey(info.data.slice(0, 32)).equals(mint);
}

/**
 * Lock the merchant's tokens against one reservation, in one transaction.
 *
 * The three steps are inseparable in practice and atomic here for the same
 * reason `lib/vault-instructions.ts` keeps a wrap and its deposit together: a
 * merchant left having *reserved* liquidity without an escrow to draw it has
 * inventory marked unavailable against a trade that does not exist, and no
 * screen anywhere would explain it.
 *
 *  1. `reserve_liquidity` — marking only, moves no tokens, and is where the
 *     settlement-mint allowlist is enforced.
 *  2. `create_trade_escrow` — opens the escrow account and its token vault.
 *  3. `fund_trade_escrow` — moves the tokens out of the liquidity vault.
 */
export function lockEscrowInstructions(
  parties: EscrowParties,
  timeoutSecs: bigint,
): TransactionInstruction[] {
  return [
    escrow.reserveLiquidityIx(parties.merchant, parties.mint, parties.amount),
    escrow.createTradeEscrowIx(
      parties.merchant,
      parties.buyer,
      parties.mint,
      parties.tokenProgram,
      parties.reservationId,
      parties.amount,
      timeoutSecs,
    ),
    escrow.fundTradeEscrowIx(
      parties.merchant,
      parties.mint,
      parties.tokenProgram,
      parties.reservationId,
    ),
  ];
}

/** The merchant's on-chain approval, which `release_escrow` requires. */
export function approveEscrowInstructions(
  merchant: PublicKey,
  reservationId: bigint,
): TransactionInstruction[] {
  return [escrow.approveSettlementIx(merchant, reservationId)];
}

export interface ReleasePlan {
  instructions: TransactionInstruction[];
  /** The buyer's token account the escrow pays into. */
  buyerTokenAccount: PublicKey;
  /**
   * Whether the buyer's wrapped-SOL account is closed at the end, so what
   * lands in their wallet is SOL rather than a token they never asked for.
   *
   * Only possible when the buyer is the one signing. A merchant releasing on
   * the buyer's behalf cannot close an account they do not own, so the buyer
   * receives wSOL — recoverable from the wallet page's own unwrap, but not
   * silently, which is why this is reported rather than assumed.
   */
  unwrapping: boolean;
}

/**
 * Everything a release needs, in one transaction.
 *
 * The buyer's associated token account is created idempotently every time
 * rather than only when missing: a buyer who has never held this mint has no
 * account for it, and a release that failed because the destination did not
 * exist would be a dead end with no obvious fix. Idempotent so a race with
 * the buyer's own wallet cannot fail the transaction.
 *
 * `payer` is whoever signs and pays — the buyer finishing their own trade, or
 * the merchant closing it out. It is the only signature this transaction
 * carries, because `release_escrow` itself takes none.
 */
export function releaseInstructions(
  parties: EscrowParties,
  fees: DecodedFeeConfig,
  payer: PublicKey,
): ReleasePlan {
  const buyerTokenAccount = ataFor(parties.buyer, parties.mint, parties.tokenProgram);
  // Only the buyer can authorize closing their own account, so unwrapping is
  // possible exactly when the buyer is the one submitting.
  const unwrapping = isWrappedSol(parties.mint) && payer.equals(parties.buyer);
  return {
    instructions: [
      createAssociatedTokenAccountIdempotentInstruction(
        payer,
        buyerTokenAccount,
        parties.buyer,
        parties.mint,
        parties.tokenProgram,
      ),
      escrow.releaseEscrowIx(
        parties.mint,
        parties.tokenProgram,
        parties.merchant,
        parties.reservationId,
        {
          buyerTokenAccount,
          devTreasury: fees.devTreasury,
          ecosystemTreasury: fees.ecosystemTreasury,
          infraTreasury: fees.infraTreasury,
          emergencyReserve: fees.emergencyReserve,
        },
      ),
      ...(unwrapping
        ? [
            createCloseAccountInstruction(
              buyerTokenAccount,
              parties.buyer,
              parties.buyer,
              [],
              parties.tokenProgram,
            ),
          ]
        : []),
    ],
    buyerTokenAccount,
    unwrapping,
  };
}

/**
 * Hand the merchant's tokens back to their liquidity vault.
 *
 * Signed by either party — the program takes a bare `signer` and checks it
 * against the escrow's own buyer and seller. Only legal while the escrow is
 * still `AwaitingFiatSettlement`; once released there is nothing to cancel.
 */
export function cancelInstructions(
  signer: PublicKey,
  parties: EscrowParties,
): TransactionInstruction[] {
  return [
    escrow.cancelReservationIx(
      signer,
      parties.mint,
      parties.tokenProgram,
      parties.merchant,
      parties.reservationId,
    ),
  ];
}

/**
 * A transaction ready to sign: the caller's instructions over a blockhash
 * read at the last moment.
 */
export async function buildTransaction(
  payer: PublicKey,
  instructions: TransactionInstruction[],
): Promise<{ transaction: Transaction; blockhash: string; lastValidBlockHeight: number }> {
  const { blockhash, lastValidBlockHeight } = await getConnection().getLatestBlockhash();
  const transaction = new Transaction({
    feePayer: payer,
    blockhash,
    lastValidBlockHeight,
  }).add(...instructions);
  return { transaction, blockhash, lastValidBlockHeight };
}

/**
 * Hands an already-signed release to the node, tagged with the settlement it
 * completes.
 *
 * The node queues it, submits it, and — only once it has observed the
 * signature confirmed for itself — records it on the settlement and moves the
 * state to `Completed`. Nothing here reports that as done: this returns when
 * the node has accepted the bytes, which is a different fact, and the trade
 * room keeps saying "not yet confirmed on-chain" until the node's own record
 * carries the signature.
 */
export async function relayRelease(
  signed: Transaction,
  settlementId: string,
): Promise<void> {
  // Every signature required, and verified here. `release_escrow` itself
  // takes no signer, so the only one is the fee payer's — and a wallet that
  // returned the transaction unsigned would otherwise be relayed to a node
  // that queues it, submits it, and watches it fail, with the failure
  // arriving minutes later and nowhere near the button that caused it.
  const bytes = signed.serialize();
  await nodeRpc<{ queued: boolean }>(nodeUrl(), "sendTransaction", {
    data: base64OfBytes(bytes),
    correlation: settlementCorrelation(settlementId),
  });
}

/**
 * Base64 for a whole transaction.
 *
 * Chunked rather than one spread into `String.fromCharCode`: a serialized
 * transaction runs to over a kilobyte, and spreading an array of that size
 * into a call's arguments is exactly the shape that starts throwing
 * `RangeError` on some engines and not others.
 */
function base64OfBytes(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** The token program that owns a mint, re-exported so the trade path has one import. */
export { tokenProgramForMint };
