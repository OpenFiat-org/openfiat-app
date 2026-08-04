"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";

import { formatBaseUnits } from "@/lib/live-vaults";
import { fetchStakeAccount } from "@/lib/live-staking";
import { voteBy, votingClosed, type NodeProposal, type VoteChoice } from "@/lib/live-proposals";
import { staking } from "@/lib/onchain-config";
import { OPEN_DECIMALS, STAKING_ROLES } from "@/lib/staking-roles";
import { castNodeVote, explainGovernanceRefusal } from "@/lib/proposal-flow";
import { tradeIdentity } from "@/lib/trade-flow";
import { currentSigner, type WalletConnection } from "@/lib/wallet-connection";

const CHOICES: Array<[VoteChoice, string]> = [
  ["Approve", "Approve"],
  ["Reject", "Reject"],
  ["Abstain", "Abstain"],
];

interface StakeOption {
  role: number;
  label: string;
  /** Base58 `StakeAccount` PDA — what the vote actually names. */
  account: string;
  /** Currently staked base units, read from the account this vote will cite. */
  amount: bigint;
}

/**
 * Casting a vote on a network proposal.
 *
 * # What this panel refuses to claim
 *
 * That a vote counts. `sendVoteCast` verifies authorship synchronously and
 * then *queues* the vote: the node reads the `StakeAccount` the vote names
 * from Solana, checks it is owned by the staking program and belongs to
 * this voter, and only then records it with the amount it decoded — the
 * `weight` inside the signed event is never trusted. Submission returning
 * cleanly therefore means the signature was accepted and nothing else, and
 * a vote can still be dropped afterwards with no message back. So the panel
 * says "submitted, not yet counted" and asks the reader to reload, rather
 * than showing a tick that would be a lie for as long as five minutes and
 * sometimes permanently.
 *
 * The staked figure beside each role is likewise labelled as what this
 * client read from the chain, because it is exactly the number the node
 * will go and read for itself and may not agree with by the time it does.
 *
 * # Why staking devnet OPEN is not something this can paper over
 *
 * Weight comes from staked OPEN, and the devnet OPEN mint's authority is
 * permanently unset — no more can be issued, so a wallet holding none can
 * never obtain any. A voter with no stake account gets that stated plainly
 * here instead of a vote form whose every submission would be silently
 * discarded.
 */
export function NodeVotePanel({
  proposal,
  wallet,
  myPeerId,
  onVoted,
}: {
  proposal: NodeProposal;
  wallet: WalletConnection | null;
  myPeerId: string | null;
  /** Re-reads the proposal from the node — the only way to learn a vote landed. */
  onVoted: () => void;
}) {
  const [stakes, setStakes] = useState<StakeOption[] | null | undefined>(undefined);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);

  useEffect(() => {
    if (!wallet) {
      setStakes(null);
      return;
    }
    let cancelled = false;
    const owner = new PublicKey(wallet.address);
    Promise.all(
      STAKING_ROLES.map(async ({ onchain, title }) => {
        const account = await fetchStakeAccount(owner, onchain);
        if (!account) return null;
        return {
          role: onchain,
          label: title,
          account: staking.stakeAccountPda(owner, onchain)[0].toBase58(),
          amount: account.amount,
        } satisfies StakeOption;
      }),
    )
      .then((rows) => {
        if (cancelled) return;
        const found = rows.filter((row): row is StakeOption => row !== null);
        setStakes(found);
        setSelected(found[0]?.account ?? null);
      })
      // `undefined` stays "could not read the cluster", which is not the
      // same answer as "this wallet has no stake" and must not render alike.
      .catch(() => !cancelled && setStakes(undefined));
    return () => {
      cancelled = true;
    };
  }, [wallet]);

  const mine = voteBy(proposal, myPeerId);
  const closed = votingClosed(proposal) || proposal.status !== "Voting";

  if (mine) {
    return (
      <div className="px-4 py-3 text-sm">
        <p className="text-gray-200">
          This wallet voted <span className="font-semibold">{mine.choice}</span>.
        </p>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">
          Recorded with a weight of {formatBaseUnits(BigInt(mine.weight), OPEN_DECIMALS)} OPEN — the
          amount this node decoded from your stake account on chain, not the figure the vote
          claimed. A vote cannot be changed once recorded.
        </p>
      </div>
    );
  }

  if (closed) {
    return <p className="px-4 py-3 text-xs text-gray-500">Voting on this proposal has closed.</p>;
  }

  if (!wallet) {
    return <p className="px-4 py-3 text-xs text-amber-300">Connect a wallet to vote.</p>;
  }

  if (stakes === undefined) {
    return (
      <p className="px-4 py-3 text-xs text-gray-500">
        Reading your stake accounts from the cluster… If this does not resolve, the cluster could
        not be reached — which is not the same as your having no stake.
      </p>
    );
  }

  if (stakes === null || stakes.length === 0) {
    return (
      <div className="px-4 py-3">
        <p className="text-xs leading-relaxed text-amber-300">
          This wallet has no stake account, so a vote from it would carry a weight of zero. The node
          never trusts the weight a vote claims — it reads the stake account for itself — so
          submitting one would look like it worked and then be dropped without a word.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-gray-500">
          Voting weight is staked OPEN, and on devnet the OPEN mint&apos;s authority is permanently
          unset: no more can ever be issued, so a wallet holding none cannot obtain any. If you do
          hold some,{" "}
          <Link href="/staking" className="text-brand-teal hover:underline">
            stake it first
          </Link>
          .
        </p>
      </div>
    );
  }

  const option = stakes.find((row) => row.account === selected) ?? stakes[0]!;

  async function cast(choice: VoteChoice) {
    const signer = currentSigner(wallet);
    if (!wallet || !signer) {
      setNote({ text: "This wallet connection cannot sign — reconnect it and try again.", bad: true });
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      await castNodeVote(tradeIdentity(signer, wallet.address), {
        proposalId: proposal.id,
        choice,
        stakeAccount: option.account,
        // Recorded inside the signature and ignored by the node in favour of
        // what it decodes from the account itself. Sent as what this client
        // actually read, so the record is not a fiction either way.
        claimedWeight: Number(option.amount),
      });
      setNote({
        text: "Signed and submitted. It is not counted yet: this node now reads your stake account from Solana and records the vote with the amount it decodes there. Reload in a moment to see whether it landed.",
        bad: false,
      });
      onVoted();
    } catch (err) {
      setNote({
        text: explainGovernanceRefusal(err),
        bad: true,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 px-4 py-3">
      {stakes.length > 1 && (
        <label className="block">
          <span className="block text-xs text-gray-500">Vote with the stake under</span>
          <select
            value={selected ?? ""}
            onChange={(event) => setSelected(event.target.value)}
            className="mt-1 rounded-md border border-white/10 bg-transparent px-2 py-1 text-xs text-white [&>option]:bg-[#10151d]"
          >
            {stakes.map((row) => (
              <option key={row.account} value={row.account}>
                {row.label} — {formatBaseUnits(row.amount, OPEN_DECIMALS)} OPEN
              </option>
            ))}
          </select>
        </label>
      )}

      <p className="text-xs leading-relaxed text-gray-500">
        {formatBaseUnits(option.amount, OPEN_DECIMALS)} OPEN staked as {option.label}, read from{" "}
        <span className="font-mono">{option.account.slice(0, 8)}…</span> just now. Your vote names
        that account; the node reads it again itself and records whatever it finds there, so this
        figure is what to expect and not a promise.
      </p>

      <div className="flex flex-wrap gap-2">
        {CHOICES.map(([choice, label]) => (
          <button
            key={choice}
            type="button"
            onClick={() => void cast(choice)}
            disabled={busy}
            className="rounded-lg border border-white/15 px-4 py-1.5 text-sm font-medium text-gray-100 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Submitting…" : label}
          </button>
        ))}
      </div>

      {note && (
        <p className={`text-xs leading-relaxed ${note.bad ? "text-red-300" : "text-emerald-300"}`}>
          {note.text}
        </p>
      )}
    </div>
  );
}
