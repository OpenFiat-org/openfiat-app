"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  WALLET_CHANGED_EVENT,
  currentSigner,
  readWalletConnection,
  type WalletConnection,
} from "@/lib/wallet-connection";
import { fetchStakeAccount } from "@/lib/live-staking";
import { getConnection, governance } from "@/lib/onchain-config";
import { shortSig } from "@/lib/format";

const ROLE_LABELS: Array<{ role: number; label: string }> = [
  { role: 0, label: "Merchant" },
  { role: 1, label: "Arbitrator" },
  { role: 2, label: "Node Operator" },
  { role: 3, label: "Notification Provider" },
  { role: 4, label: "Oracle Provider" },
  { role: 5, label: "Risk Intelligence Provider" },
  { role: 6, label: "Snapshot Provider" },
];

type VoteState =
  | { phase: "idle" }
  | { phase: "signing" }
  | { phase: "confirming"; signature: string }
  | { phase: "done"; signature: string; inFavor: boolean }
  | { phase: "error"; message: string };

/** Casts a real, wallet-signed vote on `openfiat-governance`'s `cast_vote`
 *  (OFS-4200 §6) — the voter needs their own `StakeAccount` under
 *  whichever role they vote with; `cast_vote`'s weight comes from that
 *  account's real staked amount, not anything this UI sends. */
export function VotePanel({ proposalId, state }: { proposalId: bigint; state: string }) {
  const [wallet, setWallet] = useState<WalletConnection | null>(null);
  const [stakedRoles, setStakedRoles] = useState<number[] | null>(null);
  const [selectedRole, setSelectedRole] = useState<number | null>(null);
  const [vote, setVote] = useState<VoteState>({ phase: "idle" });

  useEffect(() => {
    const update = () => setWallet(readWalletConnection());
    update();
    window.addEventListener(WALLET_CHANGED_EVENT, update);
    return () => window.removeEventListener(WALLET_CHANGED_EVENT, update);
  }, []);

  useEffect(() => {
    if (!wallet) {
      setStakedRoles(null);
      return;
    }
    let cancelled = false;
    async function load() {
      const owner = new PublicKey(wallet!.address);
      const results = await Promise.all(
        ROLE_LABELS.map(async ({ role }) => ((await fetchStakeAccount(owner, role)) ? role : null)),
      );
      if (!cancelled) {
        const roles = results.filter((r): r is number => r !== null);
        setStakedRoles(roles);
        setSelectedRole(roles[0] ?? null);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [wallet]);

  if (state !== "Voting") {
    return <p className="text-xs text-gray-500">Voting is closed on this proposal.</p>;
  }

  if (!wallet) {
    return <p className="text-xs text-amber-300">Connect a wallet to vote.</p>;
  }

  if (stakedRoles !== null && stakedRoles.length === 0) {
    return (
      <p className="text-xs text-amber-300">
        You need a stake under some role to vote —{" "}
        <Link href="/staking" className="text-brand-teal hover:underline">
          stake first
        </Link>
        .
      </p>
    );
  }

  async function castVote(inFavor: boolean) {
    if (!wallet || selectedRole === null) return;
    const provider = currentSigner(wallet);
    if (!provider) {
      setVote({ phase: "error", message: "This wallet connection can't sign — reconnect with a real extension." });
      return;
    }
    setVote({ phase: "signing" });
    try {
      const voter = new PublicKey(wallet.address);
      const connection = getConnection();
      const ix = governance.castVoteIx(voter, proposalId, inFavor, selectedRole);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      const transaction = new Transaction({ feePayer: voter, blockhash, lastValidBlockHeight }).add(ix);
      const { signature } = await provider.signAndSendTransaction(transaction);
      setVote({ phase: "confirming", signature });
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
      setVote({ phase: "done", signature, inFavor });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Transaction failed or was rejected.";
      setVote({ phase: "error", message });
    }
  }

  if (vote.phase === "done") {
    return (
      <p className="text-sm text-brand-teal">
        ✓ Vote recorded on-chain: <span className="font-semibold">{vote.phase === "done" && vote.inFavor ? "For" : "Against"}</span>
        {" — "}
        <a
          href={`https://explorer.solana.com/tx/${vote.signature}?cluster=devnet`}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-xs hover:underline"
        >
          {shortSig(vote.signature)}
        </a>
      </p>
    );
  }

  const busy = vote.phase === "signing" || vote.phase === "confirming";

  return (
    <div>
      {stakedRoles && stakedRoles.length > 1 && (
        <div className="mb-2">
          <label htmlFor="vote-role" className="mb-1 block text-xs text-gray-500">Vote with role</label>
          <select
            id="vote-role"
            value={selectedRole ?? ""}
            onChange={(e) => setSelectedRole(Number(e.target.value))}
            className="rounded-md border border-white/10 bg-transparent px-2 py-1 text-xs text-white [&>option]:bg-[#10151d]"
          >
            {stakedRoles.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS.find((l) => l.role === r)?.label}</option>
            ))}
          </select>
        </div>
      )}
      {vote.phase === "error" && <p className="mb-2 text-xs text-red-300">{vote.message}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => castVote(true)}
          disabled={busy || selectedRole === null}
          className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Submitting…" : "For"}
        </button>
        <button
          onClick={() => castVote(false)}
          disabled={busy || selectedRole === null}
          className="rounded-lg bg-red-500/80 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Submitting…" : "Against"}
        </button>
      </div>
    </div>
  );
}
