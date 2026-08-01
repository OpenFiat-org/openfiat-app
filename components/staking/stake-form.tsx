"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { STAKING_ROLES, roleByKey, toOpen, unbondingLabel } from "@/lib/staking-roles";
import { formatNumber, shortSig } from "@/lib/format";
import { Panel } from "@/components/panel";
import {
  WALLET_CHANGED_EVENT,
  currentSigner,
  readWalletConnection,
  type WalletConnection,
} from "@/lib/wallet-connection";
import { fetchStakeAccount, fetchStakingConfig } from "@/lib/live-staking";
import type { DecodedStakingConfig } from "@/lib/onchain-decode";
import { DEVNET_OPEN_MINT, getConnection, staking } from "@/lib/onchain-config";

const inputCls =
  "w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm text-white outline-none focus:border-brand/50 [&>option]:bg-[#10151d]";
const labelCls = "mb-1 block text-xs text-gray-500";

const DECIMALS = 1_000_000_000; // OPEN has 9 decimals (OFS-4100 §1)
const OPEN_MINT = new PublicKey(DEVNET_OPEN_MINT);

type SubmitState =
  | { phase: "idle" }
  | { phase: "signing" }
  | { phase: "confirming"; signature: string }
  | { phase: "done"; signature: string; amount: number; role: string }
  | { phase: "error"; message: string };

/**
 * Bonds OPEN for a chosen protocol role via a real, wallet-signed
 * `openfiat-staking` transaction (OFS-4200 §5).
 *
 * # The minimum comes from the chain, and the form waits for it
 *
 * It used to come from `lib/data/staking.ts`, whose figures were stale in
 * the direction that matters: the fixture said a merchant bond was 1,000
 * OPEN and an arbitrator's 10,000 while the deployed `StakingConfig` holds
 * 500 for both. So the form refused a valid 500 OPEN stake with "Below the
 * 1,000 OPEN minimum" — the app rejecting a transaction the program would
 * have accepted, citing a number the program does not hold.
 *
 * There is no fallback. Until the config is read the submit button is
 * disabled and says why: a minimum this form guessed at could only ever be
 * a transaction the chain rejects, or a stake the user did not need to make.
 */
export function StakeForm({ initialRole }: { initialRole?: string }) {
  const [roleKey, setRoleKey] = useState(roleByKey(initialRole)?.key ?? "merchant");
  const [amount, setAmount] = useState("");
  const [nodeId, setNodeId] = useState("");
  const [wallet, setWallet] = useState<WalletConnection | null>(null);
  const [config, setConfig] = useState<DecodedStakingConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [submit, setSubmit] = useState<SubmitState>({ phase: "idle" });

  useEffect(() => {
    const update = () => setWallet(readWalletConnection());
    update();
    window.addEventListener(WALLET_CHANGED_EVENT, update);
    return () => window.removeEventListener(WALLET_CHANGED_EVENT, update);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const live = await fetchStakingConfig();
        if (cancelled) return;
        setConfig(live);
        if (!live) setConfigError("No staking config exists on this cluster.");
      } catch (err) {
        if (!cancelled) {
          setConfigError(
            err instanceof Error
              ? `Couldn't read the staking config: ${err.message}`
              : "Couldn't read the staking config from the chain.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const role = roleByKey(roleKey)!;
  const minStakeRaw = config?.minStakeByRole[role.onchain];
  const minBond = minStakeRaw === undefined ? null : toOpen(minStakeRaw);
  const unbonding = config?.unbondingPeriodSecsByRole[role.onchain];
  const value = Number(amount) || 0;
  const valid =
    minBond !== null &&
    value >= minBond &&
    (role.key !== "node" || nodeId.trim().length >= 4) &&
    wallet !== null &&
    submit.phase !== "signing" &&
    submit.phase !== "confirming";

  async function handleStake() {
    if (!wallet) return;
    const provider = currentSigner(wallet);
    if (!provider) {
      setSubmit({ phase: "error", message: "This wallet connection can't sign — reconnect with a real extension." });
      return;
    }

    setSubmit({ phase: "signing" });
    try {
      const owner = new PublicKey(wallet.address);
      const onchainRole = role.onchain;
      const connection = getConnection();

      const from = getAssociatedTokenAddressSync(OPEN_MINT, owner, false, TOKEN_2022_PROGRAM_ID);
      const fromAccount = await connection.getAccountInfo(from);
      if (!fromAccount) {
        setSubmit({
          phase: "error",
          message: "You don't have an OPEN token account yet — you need OPEN in your wallet before you can stake.",
        });
        return;
      }

      const existingStake = await fetchStakeAccount(owner, onchainRole);
      const amountRaw = BigInt(Math.round(value * DECIMALS));

      const instructions = existingStake
        ? [staking.stakeIx(owner, OPEN_MINT, onchainRole, from, amountRaw)]
        : [
            staking.initializeStakeAccountIx(owner, onchainRole),
            staking.stakeIx(owner, OPEN_MINT, onchainRole, from, amountRaw),
          ];

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      const transaction = new Transaction({ feePayer: owner, blockhash, lastValidBlockHeight }).add(...instructions);

      const { signature } = await provider.signAndSendTransaction(transaction);
      setSubmit({ phase: "confirming", signature });
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
      setSubmit({ phase: "done", signature, amount: value, role: role.title });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Transaction failed or was rejected.";
      setSubmit({ phase: "error", message });
    }
  }

  if (submit.phase === "done") {
    return (
      <Panel>
        <div className="px-4 py-14 text-center">
          <p className="text-2xl text-emerald-400">✓</p>
          <h2 className="mt-3 text-lg font-semibold text-white">Stake bonded</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-400">
            {formatNumber(submit.amount, 0)} OPEN bonded as {submit.role}
            {role.key === "node" ? ` for ${nodeId}` : ""}. Confirmed on devnet.
          </p>
          <a
            href={`https://explorer.solana.com/tx/${submit.signature}?cluster=devnet`}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block font-mono text-xs text-brand-teal hover:underline"
          >
            {shortSig(submit.signature)}
          </a>
          <div>
            <Link
              href="/staking"
              className="mt-6 inline-block rounded-md bg-brand px-6 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
            >
              Back to Staking
            </Link>
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Bond OPEN">
      <div className="divide-y divide-white/5">
        <div className="px-4 py-6">
          <p className={labelCls}>Role</p>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {STAKING_ROLES.map((r) => {
              const min = config?.minStakeByRole[r.onchain];
              return (
                <button
                  key={r.key}
                  onClick={() => setRoleKey(r.key)}
                  className={`rounded-md border px-3.5 py-2.5 text-left text-sm transition-colors ${
                    roleKey === r.key ? "border-brand/50 bg-brand/10 text-white" : "border-white/10 text-gray-400 hover:text-white"
                  }`}
                >
                  <span className="block font-medium">{r.title}</span>
                  <span className="mt-0.5 block text-xs text-gray-500">
                    {min === undefined ? "minimum unread" : `min ${formatNumber(toOpen(min), 0)} OPEN`}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-gray-500">{role.requirement}</p>
        </div>

        {role.key === "node" && (
          <div className="px-4 py-6">
            <label htmlFor="node-id" className={labelCls}>Node ID you operate</label>
            <input
              id="node-id"
              value={nodeId}
              onChange={(e) => setNodeId(e.target.value)}
              placeholder="e.g. node-ke-full-02"
              className={`font-mono ${inputCls}`}
            />
            <p className="mt-1.5 text-[11px] text-gray-600">
              Recorded here for display only — the staking program itself has no per-node field.
            </p>
          </div>
        )}

        <div className="px-4 py-6">
          <div className="flex items-center justify-between">
            <label htmlFor="amount" className={labelCls}>Amount (OPEN)</label>
            <span className="text-xs tabular-nums text-gray-500">
              {minBond === null ? "Minimum bond unread" : `Minimum bond ${formatNumber(minBond, 0)} OPEN`}
              {minBond !== null && (
                <button onClick={() => setAmount(String(minBond))} className="ml-2 text-brand hover:text-brand-hover">
                  Set min
                </button>
              )}
            </span>
          </div>
          <input
            id="amount"
            type="number"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`tabular-nums ${inputCls}`}
          />
          {minBond !== null && value > 0 && value < minBond && (
            <p className="mt-1.5 text-xs text-amber-300">
              Below the {formatNumber(minBond, 0)} OPEN minimum for {role.title}.
            </p>
          )}
          <p className="mt-3 text-xs text-gray-500">
            {/* Per role, from the config. A flat "7-day cooldown" was stated
                here for every role while the chain holds 24 hours for a
                merchant and 3 days for an arbitrator. */}
            {unbonding === undefined
              ? "The unbonding period could not be read from the chain."
              : `Unstaking starts a ${unbondingLabel(unbonding)} cooldown for this role.`}{" "}
            Merchant bonds stay locked while you have active ads, reservations, or unsettled escrow.
          </p>
        </div>

        <div className="px-4 py-6">
          {!wallet && <p className="mb-2 text-center text-xs text-amber-300">Connect a wallet to stake.</p>}
          {configError && <p className="mb-2 text-center text-xs text-amber-300">{configError}</p>}
          {!configError && minBond === null && (
            <p className="mb-2 text-center text-xs text-gray-500">Reading the minimum from the chain…</p>
          )}
          {submit.phase === "error" && <p className="mb-2 text-center text-xs text-red-300">{submit.message}</p>}
          <button
            onClick={handleStake}
            disabled={!valid}
            className="w-full rounded-md bg-brand py-2.5 text-sm font-semibold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submit.phase === "signing"
              ? "Confirm in wallet…"
              : submit.phase === "confirming"
                ? "Confirming on devnet…"
                : `Bond ${value > 0 ? `${formatNumber(value, 0)} ` : ""}OPEN as ${role.title}`}
          </button>
          <p className="mt-2 text-center text-[11px] text-gray-600">
            Submits a real transaction to the openfiat-staking program on Solana devnet.
          </p>
        </div>
      </div>
    </Panel>
  );
}
