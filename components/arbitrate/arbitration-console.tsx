"use client";

import { PublicKey, Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import { useCallback, useEffect, useState } from "react";
import { Panel } from "@/components/panel";
import {
  buildCommit,
  buildJoin,
  buildReveal,
  clearSalt,
  commitmentFor,
  fetchDisputes,
  hasCommitted,
  hasJoined,
  hasRevealed,
  isJoinable,
  loadSalt,
  newSalt,
  OFFCHAIN_VOTE_BYTE,
  ONCHAIN_OUTCOME_BYTE,
  OUTCOME_LABEL,
  peerIdForPublicKey,
  saveSalt,
  sendSignedEvent,
  signPayload,
  type ArbitratorOutcome,
  type LiveDispute,
} from "@/lib/arbitration";
import { shortSig } from "@/lib/format";
import { NODE_CHANGED_EVENT, readNodeSelection } from "@/lib/node-preference";
import { escrow, getConnection, staking } from "@/lib/onchain-config";
import {
  WALLET_CHANGED_EVENT,
  currentSigner,
  readWalletConnection,
  type WalletConnection,
} from "@/lib/wallet-connection";

const OUTCOMES: ArbitratorOutcome[] = ["buyerWins", "merchantWins", "invalid"];

const inputCls =
  "w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm text-white outline-none focus:border-brand/50 [&>option]:bg-[#10151d]";

type Busy = { what: string } | null;

/**
 * Working a dispute case end to end in the browser.
 *
 * The off-chain half is fully automatic: the connected wallet doubles as the
 * protocol identity (both Ed25519), so joining, committing and revealing are
 * signed with `signMessage` and submitted to the selected node.
 *
 * The on-chain half needs the reservation id typed in, because nothing
 * correlates it to the off-chain case: `DisputeCase` is keyed by a `u64`
 * reservation id chosen when the escrow was created, while the off-chain
 * `Dispute` carries a string settlement id. There is no derivation between
 * them in the protocol today, so inferring one would be guesswork.
 */
export function ArbitrationConsole() {
  const [wallet, setWallet] = useState<WalletConnection | null>(null);
  const [endpoint, setEndpoint] = useState<string>(() => readNodeSelection().url);
  const [disputes, setDisputes] = useState<LiveDispute[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ArbitratorOutcome>("buyerWins");
  const [reservationId, setReservationId] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setWallet(readWalletConnection());
    update();
    window.addEventListener(WALLET_CHANGED_EVENT, update);
    return () => window.removeEventListener(WALLET_CHANGED_EVENT, update);
  }, []);

  useEffect(() => {
    // Every selection is a real endpoint now, so there is no "not a real
    // node" case to gate on — and `url` is the field to read, not `id`,
    // which is `custom:<host>` for a hand-typed node.
    const update = () => setEndpoint(readNodeSelection().url);
    update();
    window.addEventListener(NODE_CHANGED_EVENT, update);
    return () => window.removeEventListener(NODE_CHANGED_EVENT, update);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setDisputes(await fetchDisputes(endpoint));
      setError(null);
    } catch (err) {
      setDisputes([]);
      setError(err instanceof Error ? err.message : "Could not reach the selected node.");
    }
  }, [endpoint]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const publicKey = wallet ? bs58.decode(wallet.address) : null;
  const peerId = publicKey ? peerIdForPublicKey(publicKey) : null;
  const selected = disputes?.find((d) => d.id === selectedId) ?? null;

  async function run(what: string, fn: () => Promise<string>) {
    setBusy({ what });
    setNote(null);
    try {
      setNote(await fn());
      await refresh();
    } catch (err) {
      setNote(err instanceof Error ? `Failed: ${err.message}` : "Failed.");
    } finally {
      setBusy(null);
    }
  }

  function requireContext() {
    const provider = currentSigner(wallet);
    if (!provider) throw new Error("Reconnect your wallet with a real extension to sign.");
    if (!publicKey || !peerId) throw new Error("No wallet connected.");
    if (!selected) throw new Error("Select a case first.");
    return { provider, who: { publicKey, peerId }, endpoint, dispute: selected };
  }

  const offchainJoin = () =>
    run("join", async () => {
      const { provider, who, endpoint: url, dispute } = requireContext();
      const join = buildJoin(dispute.id, who);
      const signature = await signPayload(provider, join);
      await sendSignedEvent(url, "sendArbitratorJoin", { join, signature });
      return "Joined the case. The evidence is now visible to you.";
    });

  const offchainCommit = () =>
    run("commit", async () => {
      const { provider, who, endpoint: url, dispute } = requireContext();
      const salt = newSalt();
      const commitment = await commitmentFor(OFFCHAIN_VOTE_BYTE[outcome], salt);
      const commit = buildCommit(dispute.id, who, commitment);
      const signature = await signPayload(provider, commit);
      await sendSignedEvent(url, "sendVoteCommit", { commit, signature });
      saveSalt(dispute.id, salt, outcome);
      return `Committed "${OUTCOME_LABEL[outcome]}". The salt is stored in this browser — you need it to reveal.`;
    });

  const offchainReveal = () =>
    run("reveal", async () => {
      const { provider, who, endpoint: url, dispute } = requireContext();
      const stored = loadSalt(dispute.id);
      if (!stored) {
        throw new Error(
          "No salt stored for this case in this browser. Without it the commitment cannot be opened.",
        );
      }
      const reveal = buildReveal(dispute.id, who, stored.outcome, stored.salt);
      const signature = await signPayload(provider, reveal);
      await sendSignedEvent(url, "sendVoteReveal", { reveal, signature });
      clearSalt(dispute.id);
      return `Revealed "${OUTCOME_LABEL[stored.outcome]}".`;
    });

  if (!wallet) {
    return (
      <Panel title="Arbitration">
        <p className="px-4 py-6 text-sm text-gray-400">
          Connect a wallet to work a case. The same key signs your rulings and identifies you to
          the network.
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-6">
      <Panel title="Open cases" action={<button type="button" onClick={() => void refresh()} className="text-xs text-gray-400 hover:text-white">Refresh</button>}>
        {error && <p className="px-4 py-4 text-sm text-amber-400">{error}</p>}
        {!error && disputes?.length === 0 && (
          <p className="px-4 py-6 text-sm text-gray-400">No disputes on this node right now.</p>
        )}
        <ul className="divide-y divide-white/5">
          {disputes?.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => setSelectedId(d.id)}
                className={`flex w-full items-center justify-between gap-4 px-4 py-3 text-left text-sm hover:bg-white/5 ${d.id === selectedId ? "bg-white/5" : ""}`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-white">{d.id}</span>
                  <span className="block truncate text-xs text-gray-500">{d.reason}</span>
                </span>
                <span className="shrink-0 text-xs text-gray-400">
                  {d.status} · {d.arbitrators.length}/{d.required_arbitrators}
                  {peerId && hasJoined(d, peerId) ? " · joined" : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      {selected && peerId && (
        <Panel title={`Case ${selected.id}`}>
          <div className="space-y-5 px-4 py-4 text-sm">
            <p className="text-gray-400">{selected.reason}</p>

            <div>
              <span className="mb-1 block text-xs text-gray-500">Your ruling</span>
              <select
                className={inputCls}
                value={outcome}
                onChange={(e) => setOutcome(e.target.value as ArbitratorOutcome)}
              >
                {OUTCOMES.map((o) => (
                  <option key={o} value={o}>
                    {OUTCOME_LABEL[o]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap gap-2">
              <Action
                label="Join case"
                disabled={!isJoinable(selected) || hasJoined(selected, peerId) || busy !== null}
                onClick={offchainJoin}
              />
              <Action
                label="Commit (off-chain)"
                disabled={
                  !hasJoined(selected, peerId) || hasCommitted(selected, peerId) || busy !== null
                }
                onClick={offchainCommit}
              />
              <Action
                label="Reveal (off-chain)"
                disabled={
                  !hasCommitted(selected, peerId) || hasRevealed(selected, peerId) || busy !== null
                }
                onClick={offchainReveal}
              />
            </div>

            <div className="border-t border-white/5 pt-4">
              <span className="mb-1 block text-xs text-gray-500">
                On-chain reservation id — the stake-weighted vote that decides payout and slashing
              </span>
              <input
                className={inputCls}
                inputMode="numeric"
                placeholder="e.g. 1"
                value={reservationId}
                onChange={(e) => setReservationId(e.target.value)}
              />
              <p className="mt-2 text-xs text-gray-500">
                Nothing in the protocol links this to the case id above, so it has to be entered.
                The on-chain vote uses a different outcome encoding than the off-chain one; this
                console handles that for you.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Action
                  label="Commit (on-chain)"
                  disabled={busy !== null}
                  onClick={() =>
                    run("onchain-commit", async () => {
                      const { provider, dispute } = requireContext();
                      if (!/^\d+$/.test(reservationId)) {
                        throw new Error("Enter the on-chain reservation id (a whole number).");
                      }
                      const stored = loadSalt(dispute.id);
                      if (!stored) {
                        throw new Error("Commit off-chain first — that is what generates the salt.");
                      }
                      const commitment = await commitmentFor(
                        ONCHAIN_OUTCOME_BYTE[stored.outcome],
                        stored.salt,
                      );
                      const owner = new PublicKey(wallet.address);
                      const ix = escrow.commitDisputeVoteIx(
                        owner,
                        BigInt(reservationId),
                        commitment,
                      );
                      return await sendTx(provider, owner, ix);
                    })
                  }
                />
                <Action
                  label="Reveal (on-chain)"
                  disabled={busy !== null}
                  onClick={() =>
                    run("onchain-reveal", async () => {
                      const { provider, dispute } = requireContext();
                      if (!/^\d+$/.test(reservationId)) {
                        throw new Error("Enter the on-chain reservation id (a whole number).");
                      }
                      const stored = loadSalt(dispute.id);
                      if (!stored) throw new Error("No salt stored for this case in this browser.");
                      const owner = new PublicKey(wallet.address);
                      const [stakePda] = staking.stakeAccountPda(owner, 1); // Role.Arbitrator
                      const ix = escrow.revealDisputeVoteIx(
                        owner,
                        BigInt(reservationId),
                        ONCHAIN_OUTCOME_BYTE[stored.outcome],
                        stored.salt,
                        stakePda,
                      );
                      return await sendTx(provider, owner, ix);
                    })
                  }
                />
              </div>
            </div>

            {busy && <p className="text-xs text-gray-500">Working: {busy.what}…</p>}
            {note && <p className="text-xs text-gray-300">{note}</p>}
          </div>
        </Panel>
      )}
    </div>
  );
}

function Action({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void | Promise<void>;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => void onClick()}
      className="rounded-md border border-white/10 px-3 py-2 text-sm text-white transition hover:border-brand/50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {label}
    </button>
  );
}

async function sendTx(
  provider: NonNullable<ReturnType<typeof currentSigner>>,
  owner: PublicKey,
  instruction: Parameters<Transaction["add"]>[0],
): Promise<string> {
  const connection = getConnection();
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const tx = new Transaction({ feePayer: owner, blockhash, lastValidBlockHeight }).add(instruction);
  const { signature } = await provider.signAndSendTransaction(tx);
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  return `Submitted on chain: ${shortSig(signature)}`;
}
