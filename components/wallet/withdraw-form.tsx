"use client";

import { Link } from "@/i18n/navigation";
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
import { getConnection } from "@/lib/onchain-config";
import { tradingSymbol } from "@/lib/asset-display";
import {
  fetchVaultsByMerchant,
  formatBaseUnits,
  nameForMint,
  parseBaseUnits,
  shortMint,
  type LiveVault,
} from "@/lib/live-vaults";
import { useMintNames } from "@/components/wallet/use-mint-names";
import {
  fetchWrappedSolBalance,
  isWrappedSol,
  withdrawInstructions,
} from "@/lib/vault-instructions";

const inputCls =
  "w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm text-white outline-none focus:border-brand/50 [&>option]:bg-[#10151d]";

type SubmitState =
  | { phase: "idle" }
  | { phase: "signing" }
  | { phase: "confirming"; signature: string }
  | { phase: "done"; signature: string; amount: string; asSol: boolean }
  | { phase: "error"; message: string };

/**
 * Takes tokens back out of a liquidity vault with a real, wallet-signed
 * `withdraw_liquidity` transaction.
 *
 * # What this replaced
 *
 * A form that read `WALLET_BALANCES`, accepted any Solana address, and
 * finished on a "Withdrawal submitted" screen having sent nothing.
 *
 * # It withdraws from vaults, not from the wallet
 *
 * The old form was a generic "send assets to any Solana address" screen,
 * which is a wallet's job and not this app's. What this app can uniquely do
 * is move balance out of the escrow program's custody and back under the
 * merchant's — so that is what this does, and the choices offered are the
 * vaults that actually exist rather than a list of asset tickers.
 *
 * The destination is deliberately not a free-text address.
 * `withdraw_liquidity` requires a token account of the right mint, not a
 * wallet address, so the old form's free-text field would have produced a
 * transaction that fails every time. Sending elsewhere is a wallet transfer
 * afterwards, and saying that plainly beats offering a field that cannot
 * work.
 *
 * # A SOL vault pays out in SOL
 *
 * The one exception to "the destination is a token account" is wrapped SOL,
 * where the token account is closed in the same transaction and the wallet
 * receives plain SOL. See `lib/vault-instructions.ts` for why that is one
 * transaction and not two.
 */
export function WithdrawForm({ initialMint }: { initialMint?: string }) {
  // Names come from the node, never from a table here — see `nameForMint`.
  const mints = useMintNames();
  const [wallet, setWallet] = useState<WalletConnection | null>(null);
  const [vaults, setVaults] = useState<LiveVault[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(initialMint ?? null);
  const [amount, setAmount] = useState("");
  const [submit, setSubmit] = useState<SubmitState>({ phase: "idle" });
  /**
   * wSOL the wallet already holds, which unwrapping will return as SOL
   * alongside the withdrawal. `null` until read — and it stays `null` if
   * the read fails, which is why the disclosure below is only rendered for
   * a number that came back rather than defaulted to zero.
   */
  const [existingWrapped, setExistingWrapped] = useState<bigint | null>(null);

  useEffect(() => {
    const update = () => setWallet(readWalletConnection());
    update();
    window.addEventListener(WALLET_CHANGED_EVENT, update);
    return () => window.removeEventListener(WALLET_CHANGED_EVENT, update);
  }, []);

  const load = useCallback(async (address: string) => {
    setError(null);
    try {
      setVaults(await fetchVaultsByMerchant(new PublicKey(address)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setVaults(null);
    }
  }, []);

  useEffect(() => {
    if (wallet) void load(wallet.address);
    else setVaults(null);
  }, [wallet, load]);

  const vault =
    vaults?.find((v) => v.mint.toBase58() === selected) ?? (selected === null ? vaults?.[0] : undefined);
  const unwraps = vault !== undefined && isWrappedSol(vault.mint);

  useEffect(() => {
    if (!wallet || !unwraps || !vault) {
      setExistingWrapped(null);
      return;
    }
    let cancelled = false;
    fetchWrappedSolBalance(new PublicKey(wallet.address), vault.tokenProgram)
      .then((held) => {
        if (!cancelled) setExistingWrapped(held);
      })
      // Swallowed on purpose. This read only feeds an extra sentence; a
      // failed lookup must not block a withdrawal or, worse, be rendered as
      // "you hold no wrapped SOL" when nobody asked the chain successfully.
      .catch(() => {
        if (!cancelled) setExistingWrapped(null);
      });
    return () => {
      cancelled = true;
    };
  }, [wallet, unwraps, vault]);

  const raw = vault ? parseBaseUnits(amount, vault.decimals) : null;
  const overAvailable = vault !== undefined && raw !== null && raw > vault.available;
  const canSubmit =
    wallet !== null &&
    vault !== undefined &&
    raw !== null &&
    raw > 0n &&
    !overAvailable &&
    submit.phase !== "signing" &&
    submit.phase !== "confirming";

  async function handleWithdraw() {
    if (!wallet || !vault || raw === null) return;
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
      const connection = getConnection();
      const { instructions } = withdrawInstructions({
        merchant: owner,
        mint: vault.mint,
        tokenProgram: vault.tokenProgram,
        amount: raw,
      });

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
        amount: formatBaseUnits(raw, vault.decimals),
        asSol: unwraps,
      });
      void load(wallet.address);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Transaction failed or was rejected.";
      // Distinct from the deposit path on purpose: `withdraw_liquidity` has
      // no ban check at all, and its one precondition is the available
      // balance. Sharing one message would misdescribe both.
      const insufficient = /InsufficientAvailableLiquidity/i.test(message);
      setSubmit({
        phase: "error",
        message: insufficient
          ? "The program rejected this withdrawal: the vault's available balance is lower than the amount requested. Reserved and pending-settlement balances cannot be withdrawn until those trades close."
          : message,
      });
    }
  }

  if (submit.phase === "done") {
    return (
      <Panel>
        <div className="px-4 py-14 text-center">
          <p className="text-2xl text-emerald-400">✓</p>
          <h2 className="mt-3 text-lg font-semibold text-white">Withdrawal confirmed on devnet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-400">
            {submit.amount} left the vault and is{" "}
            {submit.asSol
              ? "in your wallet as SOL — the wrapped-SOL account it passed through was closed in the same transaction"
              : "in your wallet's token account"}
            . The vault&apos;s Available balance fell by the same amount, so anything you advertise against it
            should come down too.
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
              Withdraw again
            </button>
          </div>
        </div>
      </Panel>
    );
  }

  if (!wallet) {
    return (
      <Panel>
        <p className="px-4 py-8 text-sm text-gray-400">
          Connect a wallet to withdraw from the liquidity vaults it owns.
        </p>
      </Panel>
    );
  }

  if (error) {
    return (
      <Panel>
        <div className="px-4 py-6">
          <p className="text-sm font-medium text-red-300">Could not read your vaults from Solana devnet</p>
          <p className="mt-1 text-sm text-gray-400">
            The lookup failed, so this is not a statement that you have nothing to withdraw.
          </p>
          <p className="mt-2 font-mono text-xs text-red-400/80">{error}</p>
          <button
            onClick={() => void load(wallet.address)}
            className="mt-4 rounded-md border border-white/15 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-white/5"
          >
            Retry
          </button>
        </div>
      </Panel>
    );
  }

  if (vaults === null) {
    return (
      <Panel>
        <p className="px-4 py-8 text-sm text-gray-500">Reading your vaults from devnet…</p>
      </Panel>
    );
  }

  if (vaults.length === 0) {
    return (
      <Panel>
        <div className="px-4 py-8">
          <p className="text-sm text-gray-300">
            This wallet owns no liquidity vaults, so there is nothing to withdraw.
          </p>
          <p className="mt-1.5 text-sm text-gray-500">That is the chain&apos;s answer, not a failed lookup.</p>
          <Link
            href="/wallet/deposit"
            className="mt-4 inline-block rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            Deposit instead
          </Link>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Withdraw from a liquidity vault">
      <div className="divide-y divide-white/5">
        <div className="px-4 py-6 text-sm leading-relaxed text-gray-400">
          <p>
            This takes tokens back out of the escrow program&apos;s custody and returns them to your wallet,
            in one transaction you sign — into your own token account, or as plain SOL if the vault holds
            SOL.
          </p>
          <p className="mt-2.5">
            You can only withdraw what is <span className="text-emerald-300">Available</span>. Balance
            reserved against an open order, or already funded into a trade escrow, stays where it is until
            that trade settles, is cancelled, or expires — the program rejects a withdrawal that reaches into
            it.
          </p>
        </div>

        <div className="px-4 py-6">
          <label htmlFor="vault" className="mb-1 block text-xs text-gray-500">
            Vault
          </label>
          <select
            id="vault"
            value={vault?.mint.toBase58() ?? ""}
            onChange={(e) => {
              setSelected(e.target.value);
              setAmount("");
            }}
            className={inputCls}
          >
            {vaults.map((v) => {
              // Named: the symbol, with the short address to disambiguate.
              // Unnamed: the address in full. This picks which vault to
              // withdraw from, so an unnamed mint identified by eight
              // characters would be the one place truncation could cost
              // somebody the wrong token.
              const naming = nameForMint(v.mint, mints);
              // Named through `tradingSymbol`, so the option a merchant picks
              // reads `SOL` — which is what this form pays out, since it
              // unwraps in the same transaction. See `lib/asset-display.ts`.
              const label =
                naming.kind === "named"
                  ? `${tradingSymbol(v.mint.toBase58(), naming.symbol)} (${shortMint(v.mint)})`
                  : v.mint.toBase58();
              return (
                <option key={v.address.toBase58()} value={v.mint.toBase58()}>
                  {label} — {formatBaseUnits(v.available, v.decimals)} available
                </option>
              );
            })}
          </select>
        </div>

        {vault && (
          <div className="px-4 py-6">
            <div className="flex items-center justify-between">
              <label htmlFor="amount" className="mb-1 block text-xs text-gray-500">
                Amount
              </label>
              <span className="text-xs tabular-nums text-gray-500">
                Available: {formatBaseUnits(vault.available, vault.decimals)}
                {vault.available > 0n && (
                  <button
                    onClick={() =>
                      setAmount(formatBaseUnits(vault.available, vault.decimals).replace(/,/g, ""))
                    }
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

            {vault.available === 0n && (
              <p className="mt-2 text-xs text-amber-300">
                This vault has nothing available.{" "}
                {vault.reserved > 0n || vault.pendingSettlement > 0n
                  ? "Its balance is committed to open trades."
                  : "Everything it held has already settled away."}
              </p>
            )}
            {amount.trim() !== "" && raw === null && vault.available > 0n && (
              <p className="mt-2 text-xs text-amber-300">
                Enter a number with no more than {vault.decimals} decimal places — this mint cannot represent
                a smaller amount.
              </p>
            )}
            {overAvailable && (
              <p className="mt-2 text-xs text-amber-300">
                More than this vault has available ({formatBaseUnits(vault.available, vault.decimals)}).
                {vault.reserved > 0n && (
                  <>
                    {" "}
                    A further {formatBaseUnits(vault.reserved, vault.decimals)} is reserved and cannot be
                    withdrawn.
                  </>
                )}
              </p>
            )}

            {unwraps ? (
              <div className="mt-4 space-y-2 text-xs text-gray-500">
                <p>
                  Arrives as <span className="text-gray-300">SOL</span>, spendable straight away. The program
                  can only pay into a wrapped-SOL token account, so this transaction opens one, takes the
                  withdrawal into it, and closes it again — all before you see the result. You never hold
                  wrapped SOL, and nothing is left behind if any step fails, because all of it is one
                  transaction.
                </p>
                {existingWrapped !== null && existingWrapped > 0n && (
                  <p className="text-amber-300">
                    You are already holding {formatBaseUnits(existingWrapped, vault.decimals)} wrapped SOL.
                    Closing the account returns that to you as SOL as well, so expect{" "}
                    {raw !== null && raw > 0n
                      ? formatBaseUnits(existingWrapped + raw, vault.decimals)
                      : `${formatBaseUnits(existingWrapped, vault.decimals)} plus the amount withdrawn`}{" "}
                    SOL in total.
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-4 text-xs text-gray-500">
                Goes to your own associated token account for this mint, created in the same transaction if
                you do not have one. To send it anywhere else, transfer from your wallet afterwards — the
                program only pays out to a token account of this exact mint.
              </p>
            )}
          </div>
        )}

        <div className="px-4 py-6">
          {submit.phase === "error" && (
            <p className="mb-2 text-center text-xs text-red-300">{submit.message}</p>
          )}
          <button
            onClick={handleWithdraw}
            disabled={!canSubmit}
            className="w-full rounded-md bg-brand py-2.5 text-sm font-semibold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submit.phase === "signing"
              ? "Confirm in wallet…"
              : submit.phase === "confirming"
                ? "Confirming on devnet…"
                : "Withdraw to my wallet"}
          </button>
          <p className="mt-2 text-center text-[11px] text-gray-600">
            One transaction to the openfiat-escrow program on Solana devnet.
          </p>
        </div>
      </div>
    </Panel>
  );
}
