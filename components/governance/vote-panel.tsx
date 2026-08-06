"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
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

/** The seven staking roles, in on-chain discriminant order; labels are translated. */
const VOTE_ROLES: number[] = [0, 1, 2, 3, 4, 5, 6];

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
  const t = useTranslations("governance");
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
        VOTE_ROLES.map(async (role) => ((await fetchStakeAccount(owner, role)) ? role : null)),
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
    return <p className="text-xs text-gray-500">{t("votingClosedShort")}</p>;
  }

  if (!wallet) {
    return <p className="text-xs text-amber-300">{t("connectToVote")}</p>;
  }

  if (stakedRoles !== null && stakedRoles.length === 0) {
    return (
      <p className="text-xs text-amber-300">
        {t.rich("needStake", {
          link: (c) => (
            <Link href="/staking" className="text-brand-teal hover:underline">
              {c}
            </Link>
          ),
        })}
      </p>
    );
  }

  async function castVote(inFavor: boolean) {
    if (!wallet || selectedRole === null) return;
    const provider = currentSigner(wallet);
    if (!provider) {
      setVote({ phase: "error", message: t("cantSignExtension") });
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
      const message = err instanceof Error ? err.message : t("txFailed");
      setVote({ phase: "error", message });
    }
  }

  if (vote.phase === "done") {
    return (
      <p className="text-sm text-brand-teal">
        {t("voteRecorded")}: <span className="font-semibold">{vote.phase === "done" && vote.inFavor ? t("forLabel") : t("againstLabel")}</span>
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
          <label htmlFor="vote-role" className="mb-1 block text-xs text-gray-500">{t("voteWithRole")}</label>
          <select
            id="vote-role"
            value={selectedRole ?? ""}
            onChange={(e) => setSelectedRole(Number(e.target.value))}
            className="rounded-md border border-white/10 bg-transparent px-2 py-1 text-xs text-white [&>option]:bg-[#10151d]"
          >
            {stakedRoles.map((r) => (
              <option key={r} value={r}>{t(`voteRole.${r}`)}</option>
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
          {busy ? t("submitting") : t("forLabel")}
        </button>
        <button
          onClick={() => castVote(false)}
          disabled={busy || selectedRole === null}
          className="rounded-lg bg-red-500/80 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? t("submitting") : t("againstLabel")}
        </button>
      </div>
    </div>
  );
}
