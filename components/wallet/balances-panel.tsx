"use client";

import { useCallback, useEffect, useState } from "react";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  WALLET_CHANGED_EVENT,
  currentSigner,
  readWalletConnection,
  type WalletConnection,
} from "@/lib/wallet-connection";
import {
  fetchNativeSolBalance,
  fetchTokenBalances,
  type TokenBalance,
} from "@/lib/live-token-balances";
import {
  formatBaseUnits,
  nameForMint,
  shortMint,
} from "@/lib/live-vaults";
import { NATIVE_SOL_TRADING_LABEL } from "@/lib/asset-display";
import { WRAPPED_SOL_DECIMALS, isWrappedSol, unwrapInstructions } from "@/lib/vault-instructions";
import { getConnection } from "@/lib/onchain-config";
import { useMintNames } from "@/components/wallet/use-mint-names";
import { DataTable, Td, Th, Tr } from "@/components/data-table";

/**
 * What the connected wallet actually holds, from its token accounts.
 *
 * The fixture this replaced also carried a "Value (USD)" column. It is gone
 * rather than reimplemented: this app reads no price oracle, the old column
 * was invented per asset, and a dollar figure beside a devnet test token
 * with no market is a specific false claim about what someone owns.
 *
 * # This is the one screen that does not call wrapped SOL "SOL"
 *
 * Everywhere a token is traded, the native mint reads as `SOL` — a trader
 * hands over SOL and the wrapping happens inside the transaction, so the
 * wrapped form is never a thing they chose to hold (`lib/asset-display.ts`).
 * A balance table is the exception, and the exception is the whole reason
 * that mapping is scoped rather than global: native SOL pays fees and
 * wrapped SOL does not. A row here labelled `SOL` that was really a token
 * account would be read as the gas balance, and the transaction that then
 * fails for want of lamports is undiagnosable from anything on this screen.
 *
 * So the node's `wSOL` stands on any wrapped position, native SOL gets its
 * own row saying what it is for, and the two are never added together.
 */
/** One unwrap at a time — the button is disabled while it is in flight. */
type UnwrapState =
  | { phase: "idle" }
  | { phase: "signing" }
  | { phase: "error"; message: string };

export function BalancesPanel() {
  // Names come from the node, never from a table here — see `nameForMint`.
  const mints = useMintNames();
  const [wallet, setWallet] = useState<WalletConnection | null>(null);
  const [balances, setBalances] = useState<TokenBalance[] | null>(null);
  /** Lamports. `null` while unread — never rendered as a zero gas balance. */
  const [lamports, setLamports] = useState<bigint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unwrapping, setUnwrapping] = useState<UnwrapState>({ phase: "idle" });

  useEffect(() => {
    const update = () => setWallet(readWalletConnection());
    update();
    window.addEventListener(WALLET_CHANGED_EVENT, update);
    return () => window.removeEventListener(WALLET_CHANGED_EVENT, update);
  }, []);

  const load = useCallback(async (address: string) => {
    setError(null);
    try {
      const owner = new PublicKey(address);
      // One await, both reads. A wallet with token positions and an
      // unreadable lamport balance is not a state worth rendering: the gas
      // row is the point of showing this table at all.
      const [positions, gas] = await Promise.all([
        fetchTokenBalances(owner),
        fetchNativeSolBalance(owner),
      ]);
      setBalances(positions);
      setLamports(gas);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBalances(null);
      setLamports(null);
    }
  }, []);

  useEffect(() => {
    if (wallet) {
      void load(wallet.address);
    } else {
      setBalances(null);
      setLamports(null);
    }
  }, [wallet, load]);

  /**
   * Turns a stranded wrapped-SOL account back into SOL.
   *
   * Nothing this app does leaves one behind — every vault deposit and
   * withdrawal wraps and unwraps inside its own transaction — but a wallet
   * can arrive here holding one from anywhere else, and until now this
   * screen could only show it. A balance a user can see and cannot act on,
   * in a form they were never asked to understand, is the whole problem
   * wrapping causes; this is the way out of it, in one signature.
   */
  const unwrap = useCallback(
    async (position: TokenBalance) => {
      if (!wallet) return;
      const provider = currentSigner(wallet);
      if (!provider) {
        setUnwrapping({
          phase: "error",
          message: "This wallet connection can't sign — reconnect with a real wallet.",
        });
        return;
      }
      setUnwrapping({ phase: "signing" });
      try {
        const owner = new PublicKey(wallet.address);
        const connection = getConnection();
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        const transaction = new Transaction({ feePayer: owner, blockhash, lastValidBlockHeight }).add(
          ...unwrapInstructions(owner, position.address, position.tokenProgram),
        );
        const { signature } = await provider.signAndSendTransaction(transaction);
        await connection.confirmTransaction(
          { signature, blockhash, lastValidBlockHeight },
          "confirmed",
        );
        setUnwrapping({ phase: "idle" });
        void load(wallet.address);
      } catch (err) {
        setUnwrapping({
          phase: "error",
          message: err instanceof Error ? err.message : "Transaction failed or was rejected.",
        });
      }
    },
    [wallet, load],
  );

  if (!wallet) {
    return <p className="text-sm text-gray-500">Connect a wallet to see what it holds.</p>;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/[0.04] p-6">
        <p className="text-sm font-medium text-red-300">Could not read your token accounts</p>
        <p className="mt-1 text-sm text-gray-400">
          Nothing below is a balance of zero — the lookup itself failed.
        </p>
        <p className="mt-2 font-mono text-xs text-red-400/80">{error}</p>
        <button
          onClick={() => void load(wallet.address)}
          className="mt-4 rounded-md border border-white/15 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-white/5"
        >
          Retry
        </button>
      </div>
    );
  }

  if (balances === null) return <p className="text-sm text-gray-500">Reading token accounts…</p>;

  return (
    <>
    <DataTable
      minWidth={680}
      head={
        <tr>
          <Th>Mint</Th>
          <Th right>Balance</Th>
          <Th right>Token program</Th>
        </tr>
      }
    >
      {/*
        * Gas, first and on its own. It is not a token position and is not
        * counted among them — it has no mint, no token account and no token
        * program — which is exactly why it earns a row rather than being
        * folded into one: every transaction on every other row is paid for
        * out of this number.
        */}
      <Tr>
        <Td>
          <span className="block font-medium text-gray-200">{NATIVE_SOL_TRADING_LABEL}</span>
          <span className="mt-0.5 block text-[11px] text-gray-500">
            Native SOL — pays transaction fees and account rent. Not a token balance.
          </span>
        </Td>
        <Td right num className="text-gray-200">
          {lamports === null ? "—" : formatBaseUnits(lamports, WRAPPED_SOL_DECIMALS)}
        </Td>
        <Td right className="text-[11px] text-gray-500">
          None
        </Td>
      </Tr>
      {balances.map((b) => {
        const naming = nameForMint(b.mint, mints);
        return (
          <Tr key={`${b.mint.toBase58()}-${b.tokenProgram.toBase58()}`}>
            <Td>
              {/*
               * Three headings for three answers, and never the address as
               * one of them. A row whose first line was a base58 string read
               * as a token called `Ge7q…`, which is what "unknown tokens in
               * my balance" turned out to mean.
               *
               * `unnamed` is the node saying it has no name for this mint —
               * an ordinary answer, so the row says so in words. `unasked`
               * and `asking` are facts about this app's connection and are
               * labelled as such, because rendering either as "unrecognised"
               * would turn a failed request into a finding about somebody's
               * token. Nothing here invents a name.
               */}
              <span
                className={`block font-medium ${naming.kind === "named" ? "text-gray-200" : "text-gray-500"}`}
              >
                {naming.kind === "named"
                  ? naming.symbol
                  : naming.kind === "unnamed"
                    ? "Unrecognised mint"
                    : naming.kind === "asking"
                      ? "Reading token names…"
                      : "Name unavailable"}
              </span>
              {/* The address, in full when there is no name above it to
                  identify the token by: `shortMint` would otherwise leave a
                  reader identifying a token by eight characters. */}
              <span
                className={
                  naming.kind === "named"
                    ? "mt-0.5 block font-mono text-[11px] text-gray-500"
                    : "mt-0.5 block font-mono text-[11px] text-gray-400 [overflow-wrap:anywhere]"
                }
                title={b.mint.toBase58()}
              >
                {naming.kind === "named" ? shortMint(b.mint) : b.mint.toBase58()}
              </span>
              {/*
                * The one position whose name a reader is most likely to
                * misread as the row above it. Said in words rather than
                * relabelled, because the difference between these two
                * balances is the difference between being able to send a
                * transaction and not.
                */}
              {isWrappedSol(b.mint) && (
                <>
                  <span className="mt-0.5 block text-[11px] text-amber-300/80">
                    Wrapped SOL, held as a token. It does not pay fees — the SOL row above does.
                  </span>
                  {/*
                    * The way out, offered rather than explained. Nothing in
                    * this app leaves a wrapped account behind, so a balance
                    * here came from somewhere else — and telling somebody
                    * they are holding the wrong form of their own money
                    * without giving them a button is worse than not
                    * mentioning it. Closes the account and returns the whole
                    * balance, plus its rent, as SOL.
                    */}
                  <button
                    type="button"
                    onClick={() => void unwrap(b)}
                    disabled={unwrapping.phase === "signing"}
                    className="mt-1.5 rounded-md border border-white/15 px-2.5 py-1 text-[11px] font-medium text-gray-200 hover:bg-white/5 disabled:opacity-50"
                  >
                    {unwrapping.phase === "signing" ? "Unwrapping…" : "Unwrap to SOL"}
                  </button>
                  {unwrapping.phase === "error" && (
                    <span className="mt-1 block text-[11px] text-red-300">
                      {unwrapping.message}
                    </span>
                  )}
                </>
              )}
            </Td>
            <Td right num className="text-gray-200">
              {formatBaseUnits(b.amount, b.decimals)}
            </Td>
            <Td right className="text-[11px] text-gray-500">
              {b.tokenProgram.toBase58().startsWith("Tokenz") ? "Token-2022" : "SPL Token"}
            </Td>
          </Tr>
        );
      })}
    </DataTable>
      {balances.length === 0 && (
        <p className="mt-2 text-sm text-gray-500">
          This wallet holds no SPL token accounts on devnet — only the native SOL above. Note that
          devnet OPEN cannot be obtained at all: its mint authority is permanently unset.
        </p>
      )}
      {mints === null && (
        <p className="mt-2 text-[11px] text-gray-600">
          Token names could not be read from an OpenFiat node, so mints are shown by address. The
          balances themselves come from Solana and are unaffected.
        </p>
      )}
    </>
  );
}
