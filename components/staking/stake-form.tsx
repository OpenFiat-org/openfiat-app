"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { STAKING_ROLES } from "@/lib/data/staking";
import { PROVIDER_TYPES } from "@/lib/data/providers";
import { formatNumber, shortSig } from "@/lib/format";
import { Panel } from "@/components/panel";
import {
  WALLET_CHANGED_EVENT,
  currentSigner,
  readWalletConnection,
  type WalletConnection,
} from "@/lib/wallet-connection";
import { fetchStakeAccount } from "@/lib/live-staking";
import { DEVNET_OPEN_MINT, getConnection, staking } from "@/lib/onchain-config";

const inputCls =
  "w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm text-white outline-none focus:border-brand/50 [&>option]:bg-[#10151d]";
const labelCls = "mb-1 block text-xs text-gray-500";

const ROLE_TO_ONCHAIN: Record<string, number> = {
  merchant: 0, // Role.Merchant
  arbitrator: 1, // Role.Arbitrator
  node: 2, // Role.NodeOperator
  provider: 3, // Role.NotificationProvider
};

const DECIMALS = 1_000_000_000; // OPEN has 9 decimals (OFS-4100 §1)
const OPEN_MINT = new PublicKey(DEVNET_OPEN_MINT);

type SubmitState =
  | { phase: "idle" }
  | { phase: "signing" }
  | { phase: "confirming"; signature: string }
  | { phase: "done"; signature: string; amount: number; role: string }
  | { phase: "error"; message: string };

/** Bonds OPEN for a chosen protocol role via a real, wallet-signed
 *  `openfiat-staking` transaction (OFS-4200 §5). */
export function StakeForm({ initialRole }: { initialRole?: string }) {
  const [roleKey, setRoleKey] = useState(
    STAKING_ROLES.some((r) => r.role === initialRole) ? (initialRole as string) : "merchant",
  );
  const [amount, setAmount] = useState("");
  const [nodeId, setNodeId] = useState("");
  const [serviceType, setServiceType] = useState("Notification Provider");
  const [wallet, setWallet] = useState<WalletConnection | null>(null);
  const [submit, setSubmit] = useState<SubmitState>({ phase: "idle" });

  useEffect(() => {
    const update = () => setWallet(readWalletConnection());
    update();
    window.addEventListener(WALLET_CHANGED_EVENT, update);
    return () => window.removeEventListener(WALLET_CHANGED_EVENT, update);
  }, []);

  const role = STAKING_ROLES.find((r) => r.role === roleKey)!;
  const value = Number(amount) || 0;
  const valid =
    value >= role.minBond &&
    (role.role !== "node" || nodeId.trim().length >= 4) &&
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
      const onchainRole = ROLE_TO_ONCHAIN[roleKey]!;
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
            {role.role === "node" ? ` for ${nodeId}` : ""}
            {role.role === "provider" ? ` (${serviceType})` : ""}. Confirmed on devnet.
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
            {STAKING_ROLES.map((r) => (
              <button
                key={r.role}
                onClick={() => setRoleKey(r.role)}
                className={`rounded-md border px-3.5 py-2.5 text-left text-sm transition-colors ${
                  roleKey === r.role ? "border-brand/50 bg-brand/10 text-white" : "border-white/10 text-gray-400 hover:text-white"
                }`}
              >
                <span className="block font-medium">{r.title}</span>
                <span className="mt-0.5 block text-xs text-gray-500">min {formatNumber(r.minBond, 0)} OPEN</span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-500">{role.requirement}</p>
        </div>

        {role.role === "node" && (
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

        {role.role === "provider" && (
          <div className="px-4 py-6">
            <label htmlFor="service-type" className={labelCls}>Service type (OFS-1500)</label>
            <select id="service-type" value={serviceType} onChange={(e) => setServiceType(e.target.value)} className={inputCls}>
              {Object.keys(PROVIDER_TYPES).map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        )}

        <div className="px-4 py-6">
          <div className="flex items-center justify-between">
            <label htmlFor="amount" className={labelCls}>Amount (OPEN)</label>
            <span className="text-xs tabular-nums text-gray-500">
              Minimum bond {formatNumber(role.minBond, 0)} OPEN
              <button onClick={() => setAmount(String(role.minBond))} className="ml-2 text-brand hover:text-brand-hover">
                Set min
              </button>
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
          {value > 0 && value < role.minBond && (
            <p className="mt-1.5 text-xs text-amber-300">
              Below the {formatNumber(role.minBond, 0)} OPEN minimum for {role.title}.
            </p>
          )}
          <p className="mt-3 text-xs text-gray-500">
            Unstaking starts a 7-day cooldown. Merchant bonds stay locked while you have active ads, reservations, or
            unsettled escrow.
          </p>
        </div>

        <div className="px-4 py-6">
          {!wallet && <p className="mb-2 text-center text-xs text-amber-300">Connect a wallet to stake.</p>}
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
