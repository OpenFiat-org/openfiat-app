"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { Panel } from "@/components/panel";
import { shortSig } from "@/lib/format";
import {
  WALLET_CHANGED_EVENT,
  currentSigner,
  readWalletConnection,
  type WalletConnection,
} from "@/lib/wallet-connection";
import { DEVNET_OPEN_MINT, getConnection, PROTOCOL_TOKEN_NAME } from "@/lib/onchain-config";
import { fetchTokenBalance, type TokenBalance } from "@/lib/live-token-balances";
import {
  DEPOSITABLE_MINTS,
  fetchVault,
  formatBaseUnits,
  NATIVE_SOL_FLOW_LABEL,
  NATIVE_SOL_MINT_OPTION,
  nameForMint,
  parseBaseUnits,
  type LiveVault,
  type ReferenceMint,
} from "@/lib/live-vaults";
import { useMintNames } from "@/components/wallet/use-mint-names";
import {
  depositInstructions,
  fetchWrapCapacity,
  isWrappedSol,
  tokenProgramForMint,
  type WrapCapacity,
} from "@/lib/vault-instructions";

const inputCls =
  "w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm text-white outline-none focus:border-brand/50 [&>option]:bg-[#10151d]";

/** What a chosen mint resolves to once the chain has been asked about it. */
interface Resolved {
  mint: PublicKey;
  decimals: number;
  tokenProgram: PublicKey;
  /**
   * The wallet's own token holding. `null` means no token account at all —
   * and for SOL it is always `null`, because a SOL balance is not a token
   * account and `wrap` is what says how much there is.
   */
  held: TokenBalance | null;
  /** `null` means the vault does not exist and will be created by this deposit. */
  vault: LiveVault | null;
  /** SOL only: lamports, rent and fees resolved into a depositable amount. */
  wrap: WrapCapacity | null;
}

/** What the amount field is checked against, whichever kind of asset it is. */
function spendable(r: Resolved): bigint {
  return r.wrap ? r.wrap.depositable : (r.held?.amount ?? 0n);
}

type SubmitState =
  | { phase: "idle" }
  | { phase: "signing" }
  | { phase: "confirming"; signature: string }
  | { phase: "done"; signature: string; amount: string; created: boolean; wrapped: boolean }
  | { phase: "error"; message: string };

/**
 * Moves tokens from the connected wallet into its own liquidity vault with
 * a real, wallet-signed `deposit_liquidity` transaction.
 *
 * # What this replaced
 *
 * A page that showed a `pseudoAddress()` — a deterministic fake derived
 * from a string — labelled "Your USDT deposit address (Solana)", with a
 * button reading "I've sent the funds" and a footnote admitting no funds
 * move. Anyone who took it at its word sent real tokens to an address
 * nobody holds the key to.
 *
 * # The copy is part of the work
 *
 * A deposit here is not a wallet transfer. It hands tokens to a program
 * that will later move them to buyers without asking again, and that is the
 * single fact a merchant must understand before signing. It is stated in
 * the flow rather than in a help page.
 *
 * # SOL is offered as SOL
 *
 * The escrow program can only hold a token account, so a SOL vault is
 * really a wrapped-SOL vault. That is an implementation fact and not
 * something a merchant should have to act on, so this form takes SOL,
 * wraps it inside the deposit transaction, and closes the wrapped account
 * again in the same transaction. See `lib/vault-instructions.ts` for why
 * that has to be one transaction rather than two, and for what the amount
 * offered as Max leaves behind.
 */
/**
 * What the picker calls one of its options.
 *
 * Three sources, in this order, and the order is the point:
 *
 * 1. wSOL is offered as `SOL`, because that is what you hand over — the
 *    wrapping happens inside the same transaction. A statement about the
 *    flow, not about the mint. See `NATIVE_SOL_FLOW_LABEL`.
 * 2. OPEN is named by the protocol, because the node deliberately never
 *    names it: it is not a settlement mint until the public sale. See
 *    `PROTOCOL_TOKEN_NAME`.
 * 3. Everything else is the node's answer, or the address when it has none.
 *    Nothing here invents a third name.
 */
function optionLabel(address: string, mints: ReferenceMint[] | null | undefined): string {
  if (address === NATIVE_SOL_MINT_OPTION.address) return NATIVE_SOL_FLOW_LABEL;
  if (address === DEVNET_OPEN_MINT) return PROTOCOL_TOKEN_NAME;
  const naming = nameForMint(new PublicKey(address), mints);
  return naming.kind === "named" ? naming.symbol : address;
}

export function DepositForm({ initialMint }: { initialMint?: string }) {
  // Names come from the node, never from a table here — see `nameForMint`.
  const mints = useMintNames();
  const [wallet, setWallet] = useState<WalletConnection | null>(null);
  const [mintInput, setMintInput] = useState(initialMint ?? DEPOSITABLE_MINTS[0]!.address);
  const [amount, setAmount] = useState("");
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [submit, setSubmit] = useState<SubmitState>({ phase: "idle" });

  useEffect(() => {
    const update = () => setWallet(readWalletConnection());
    update();
    window.addEventListener(WALLET_CHANGED_EVENT, update);
    return () => window.removeEventListener(WALLET_CHANGED_EVENT, update);
  }, []);

  const resolve = useCallback(async (address: string, mintText: string) => {
    setLookupError(null);
    setResolved(null);
    let mint: PublicKey;
    try {
      mint = new PublicKey(mintText.trim());
    } catch {
      setLookupError("That is not a valid Solana address.");
      return;
    }
    try {
      const owner = new PublicKey(address);
      const tokenProgram = await tokenProgramForMint(mint);
      const native = isWrappedSol(mint);
      // Skipped for SOL: the wallet's SOL is not a token account, and the
      // wrapped one is transient by design. `fetchWrapCapacity` reads what
      // this form actually needs, including the wrapped balance a deposit
      // spends before it wraps anything new.
      const [held, vault] = await Promise.all([
        native ? Promise.resolve(null) : fetchTokenBalance(owner, mint),
        fetchVault(owner, mint),
      ]);
      const decimals =
        vault?.decimals ??
        held?.decimals ??
        DEPOSITABLE_MINTS.find((m) => m.address === mint.toBase58())?.decimals;
      if (decimals === undefined) {
        setLookupError("Could not read this mint's decimals.");
        return;
      }
      // Read after the vault, because whether the vault has to be created
      // decides how much rent this transaction has to keep back.
      const wrap = native
        ? await fetchWrapCapacity(owner, { createVault: vault === null, tokenProgram })
        : null;
      setResolved({ mint, decimals, tokenProgram, held, vault, wrap });
    } catch (err) {
      // A failed lookup is not "you hold nothing" — say which it is.
      setLookupError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    if (wallet) void resolve(wallet.address, mintInput);
  }, [wallet, mintInput, resolve]);

  const raw = resolved ? parseBaseUnits(amount, resolved.decimals) : null;
  const heldAmount = resolved ? spendable(resolved) : 0n;
  const overBalance = raw !== null && raw > heldAmount;
  const canSubmit =
    wallet !== null &&
    resolved !== null &&
    // A SOL deposit needs no pre-existing token account — it opens one. For
    // every other mint, no account means no balance and nothing to send.
    (resolved.wrap !== null || resolved.held !== null) &&
    raw !== null &&
    raw > 0n &&
    !overBalance &&
    submit.phase !== "signing" &&
    submit.phase !== "confirming";

  async function handleDeposit() {
    if (!wallet || !resolved || raw === null) return;
    const provider = currentSigner(wallet);
    if (!provider) {
      setSubmit({
        phase: "error",
        message: "This wallet connection can't sign — reconnect with a real extension.",
      });
      return;
    }

    setSubmit({ phase: "signing" });
    try {
      const owner = new PublicKey(wallet.address);
      const creating = resolved.vault === null;
      const { instructions, wrapping } = depositInstructions({
        merchant: owner,
        mint: resolved.mint,
        tokenProgram: resolved.tokenProgram,
        amount: raw,
        from: resolved.held?.address ?? null,
        wrappedBalance: resolved.wrap?.wrapped,
        createVault: creating,
      });

      const connection = getConnection();
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      const transaction = new Transaction({ feePayer: owner, blockhash, lastValidBlockHeight }).add(
        ...instructions,
      );

      const { signature } = await provider.signAndSendTransaction(transaction);
      setSubmit({ phase: "confirming", signature });
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
      setSubmit({
        phase: "done",
        signature,
        amount: formatBaseUnits(raw, resolved.decimals),
        created: creating,
        wrapped: wrapping > 0n,
      });
      void resolve(wallet.address, mintInput);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Transaction failed or was rejected.";
      // `deposit_liquidity` checks a ban record that `withdraw_liquidity`
      // has no equivalent of, so a deposit can fail for a reason a
      // withdrawal never will. Naming it beats showing a raw program error.
      const banned = /WalletBanned|0x177b/i.test(message);
      setSubmit({
        phase: "error",
        message: banned
          ? "The escrow program rejected this deposit because this wallet is banned. A ban blocks deposits only — withdrawing what you already hold is unaffected."
          : message,
      });
    }
  }

  if (submit.phase === "done") {
    return (
      <Panel>
        <div className="px-4 py-14 text-center">
          <p className="text-2xl text-emerald-400">✓</p>
          <h2 className="mt-3 text-lg font-semibold text-white">Deposit confirmed on devnet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-400">
            {submit.amount} moved from your wallet into your liquidity vault
            {submit.created ? ", and the vault was created in the same transaction" : ""}
            {submit.wrapped ? ", wrapped and unwrapped along the way so nothing was left behind" : ""}. Your
            Available balance rose by the full amount and can back a sell advertisement now.
          </p>
          <a
            href={`https://explorer.solana.com/tx/${submit.signature}?cluster=devnet`}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block font-mono text-xs text-brand-teal hover:underline"
          >
            {shortSig(submit.signature)}
          </a>
          <div className="mt-6 flex justify-center gap-2.5">
            <Link
              href="/wallet"
              className="rounded-md bg-brand px-6 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
            >
              Back to Wallet
            </Link>
            <button
              onClick={() => {
                setAmount("");
                setSubmit({ phase: "idle" });
              }}
              className="rounded-md border border-white/15 px-6 py-2 text-sm font-medium text-gray-200 hover:bg-white/5"
            >
              Deposit again
            </button>
          </div>
        </div>
      </Panel>
    );
  }

  const known = DEPOSITABLE_MINTS.find((m) => m.address === mintInput.trim());
  const native = resolved !== null && resolved.wrap !== null;

  return (
    <Panel title="Deposit into a liquidity vault">
      <div className="divide-y divide-white/5">
        <div className="px-4 py-6 text-sm leading-relaxed text-gray-400">
          <p>
            This moves tokens out of your wallet and into a liquidity vault owned by the escrow program. It
            is not a transfer between your own accounts.
          </p>
          <p className="mt-2.5">
            While the tokens sit there, the program can reserve them against a buyer&apos;s order and release
            them on settlement without asking you to sign again — that is what makes a sell advertisement
            fillable. Anything not reserved stays yours to withdraw at any time, and no one else can withdraw
            it.
          </p>
        </div>

        <div className="px-4 py-6">
          <label htmlFor="mint" className="mb-1 block text-xs text-gray-500">
            Token mint
          </label>
          <select
            id="mint"
            value={DEPOSITABLE_MINTS.some((m) => m.address === mintInput) ? mintInput : "custom"}
            onChange={(e) => {
              if (e.target.value !== "custom") setMintInput(e.target.value);
              else setMintInput("");
            }}
            className={inputCls}
          >
            {DEPOSITABLE_MINTS.map((m) => (
              <option key={m.address} value={m.address}>
                {optionLabel(m.address, mints)}
              </option>
            ))}
            <option value="custom">Another mint address…</option>
          </select>
          <input
            value={mintInput}
            onChange={(e) => setMintInput(e.target.value)}
            placeholder="Mint address"
            className={`mt-2 font-mono text-xs ${inputCls}`}
          />
          {/*
            * The address is always visible, even for a named mint. A name
            * is a nickname a node applied to an address; the address is the
            * fact underneath, and a merchant depositing into the wrong
            * token because two names looked alike loses the tokens.
            */}
          <p className="mt-1.5 text-[11px] text-gray-600">
            Names come from the node you are connected to, not from this app — no devnet mint here
            publishes on-chain metadata of its own. Check the address. SOL&apos;s address is wrapped
            SOL&apos;s, which is what the vault actually holds.
          </p>
          {known && <p className="mt-1.5 text-xs text-gray-500">{known.note}</p>}
          {known && !known.obtainable && (
            <p className="mt-1.5 text-xs text-amber-300">
              You cannot obtain this token on devnet, so a deposit will only work if you already hold some.
            </p>
          )}
        </div>

        {lookupError && (
          <div className="px-4 py-6">
            <p className="text-sm font-medium text-red-300">Could not read this mint from devnet</p>
            <p className="mt-1 text-xs text-gray-500">
              This is a failed lookup, not a zero balance.
            </p>
            <p className="mt-2 font-mono text-xs text-red-400/80">{lookupError}</p>
            <button
              onClick={() => wallet && void resolve(wallet.address, mintInput)}
              className="mt-3 rounded-md border border-white/15 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-white/5"
            >
              Retry
            </button>
          </div>
        )}

        {resolved && (
          <div className="px-4 py-6">
            <div className="flex items-center justify-between">
              <label htmlFor="amount" className="mb-1 block text-xs text-gray-500">
                Amount
              </label>
              <span className="text-xs tabular-nums text-gray-500">
                {native ? "You can deposit" : "In your wallet"}:{" "}
                {formatBaseUnits(heldAmount, resolved.decimals)}
                {heldAmount > 0n && (
                  <button
                    onClick={() => setAmount(formatBaseUnits(heldAmount, resolved.decimals).replace(/,/g, ""))}
                    className="ml-2 text-brand hover:text-brand-hover"
                  >
                    Max
                  </button>
                )}
              </span>
            </div>
            <input
              id="amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className={`tabular-nums ${inputCls}`}
            />

            {resolved.held === null && !native && (
              <p className="mt-2 text-xs text-amber-300">
                This wallet has no token account for this mint, so it holds none of it and there is nothing
                to deposit.
              </p>
            )}
            {/*
              * Stated as a number, not as "some SOL is kept for fees".
              * The gap between a wallet's SOL balance and what it can
              * deposit is otherwise unexplained, and a merchant who cannot
              * see why Max is short of their balance will type the balance
              * in by hand and get a transaction that fails on rent.
              */}
            {resolved.wrap && (
              <p className="mt-2 text-xs text-gray-500">
                Your wallet holds {formatBaseUnits(resolved.wrap.lamports, resolved.decimals)} SOL.{" "}
                {formatBaseUnits(resolved.wrap.reserved, resolved.decimals)} of it is held back for the
                transaction fee
                {resolved.vault === null ? " and the rent for the two accounts your vault is made of" : ""}
                {resolved.wrap.refunded > 0n
                  ? `, of which ${formatBaseUnits(resolved.wrap.refunded, resolved.decimals)} is rent for the wrapped-SOL account and comes straight back when it is closed in the same transaction`
                  : ""}
                .
                {resolved.wrap.wrapped > 0n && (
                  <>
                    {" "}
                    You also already hold {formatBaseUnits(resolved.wrap.wrapped, resolved.decimals)} wrapped
                    SOL, which this deposit spends before wrapping anything new.
                  </>
                )}
              </p>
            )}
            {amount.trim() !== "" && raw === null && (
              <p className="mt-2 text-xs text-amber-300">
                Enter a number with no more than {resolved.decimals} decimal places — this mint cannot
                represent a smaller amount.
              </p>
            )}
            {overBalance && (
              <p className="mt-2 text-xs text-amber-300">
                More than your wallet holds ({formatBaseUnits(heldAmount, resolved.decimals)}).
              </p>
            )}

            <div className="mt-4 rounded-md border border-white/10 bg-white/[0.02] px-3.5 py-3 text-xs text-gray-400">
              {resolved.vault ? (
                <p>
                  Your vault for this mint currently has{" "}
                  <span className="tabular-nums text-emerald-300">
                    {formatBaseUnits(resolved.vault.available, resolved.decimals)}
                  </span>{" "}
                  available.
                  {raw !== null && raw > 0n && !overBalance && (
                    <>
                      {" "}
                      After this deposit it will have{" "}
                      <span className="tabular-nums text-emerald-300">
                        {formatBaseUnits(resolved.vault.available + raw, resolved.decimals)}
                      </span>
                      .
                    </>
                  )}
                </p>
              ) : (
                <p>
                  You have no vault for this mint yet. One will be created in the same transaction, which
                  costs a small amount of SOL in rent, and the deposit will land in it.
                </p>
              )}
              {native && (
                <p className="mt-2 border-t border-white/10 pt-2 text-gray-500">
                  The escrow program can only hold a token account, so this transaction wraps your SOL, makes
                  the deposit, and closes the wrapped account again — in that order, in one transaction. You
                  never hold wrapped SOL, and a failure at any step leaves nothing behind, because either the
                  whole transaction lands or none of it does.
                </p>
              )}
            </div>
          </div>
        )}

        <div className="px-4 py-6">
          {!wallet && <p className="mb-2 text-center text-xs text-amber-300">Connect a wallet to deposit.</p>}
          {submit.phase === "error" && (
            <p className="mb-2 text-center text-xs text-red-300">{submit.message}</p>
          )}
          <button
            onClick={handleDeposit}
            disabled={!canSubmit}
            className="w-full rounded-md bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submit.phase === "signing"
              ? "Confirm in wallet…"
              : submit.phase === "confirming"
                ? "Confirming on devnet…"
                : resolved?.vault === null && resolved !== null
                  ? "Create vault and deposit"
                  : "Deposit into vault"}
          </button>
          <p className="mt-2 text-center text-[11px] text-gray-600">
            One transaction to the openfiat-escrow program on Solana devnet. Your wallet will show you
            exactly what it signs.
          </p>
        </div>
      </div>
    </Panel>
  );
}
