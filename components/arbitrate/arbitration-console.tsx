"use client";

import { PublicKey, Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { Panel } from "@/components/panel";
import {
  buildCommit,
  buildJoin,
  buildReveal,
  clearSalt,
  commitmentFor,
  explainArbitrationRefusal,
  hasCommitted,
  hasJoined,
  hasRevealed,
  isJoinable,
  loadSalt,
  newSalt,
  OFFCHAIN_VOTE_BYTE,
  ONCHAIN_OUTCOME_BYTE,
  peerIdForPublicKey,
  saveSalt,
  sendSignedEvent,
  signPayload,
  type ArbitratorOutcome,
} from "@/lib/arbitration";
import { useMyDisputes } from "@/components/disputes/use-my-disputes";
import { fetchDisputes, type PublicDispute } from "@/lib/live-disputes";
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
 *
 * # Two reads, and why the docket is thin
 *
 * The case list is the public, redacted `getDisputes`: id, stage, and how
 * many of the required seats are filled. That is everything needed to pick a
 * case with a seat free, and it is all a node will tell someone who has not
 * joined one. The complaint itself — free text naming people, banks and
 * references — and the roster of who else is seated arrive only through
 * `getMyDisputes`, which answers for the wallet that signs for it.
 *
 * So this screen shows less than it used to before a case is joined, and the
 * order is now the honest one rather than an accident: join the case, then
 * read it. The button that always said "Joined the case. The evidence is now
 * visible to you" was describing this rule before the node enforced it.
 */
export function ArbitrationConsole() {
  const t = useTranslations("arbitrate");
  const D = useTranslations("disputes");
  const R = useTranslations("refusals");
  const [wallet, setWallet] = useState<WalletConnection | null>(null);
  const [endpoint, setEndpoint] = useState<string>(() => readNodeSelection().url);
  const [disputes, setDisputes] = useState<PublicDispute[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * The cases this wallet can read in full. Null until the arbitrator asks:
   * the read costs a wallet prompt, and a console that pops one because the
   * page loaded trains people to approve prompts without reading them.
   */
  const mine = useMyDisputes();
  const myCases = mine.data;
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
      setError(err instanceof Error ? err.message : t("nodeUnreachable"));
    }
  }, [endpoint, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const publicKey = wallet ? bs58.decode(wallet.address) : null;
  const peerId = publicKey ? peerIdForPublicKey(publicKey) : null;
  const selected = disputes?.find((d) => d.id === selectedId) ?? null;
  /** The full record for the selected case, if this wallet is entitled to it. */
  const selectedMine = myCases?.find((d) => d.id === selectedId) ?? null;

  async function run(what: string, fn: () => Promise<string>) {
    setBusy({ what });
    setNote(null);
    try {
      setNote(await fn());
      await refresh();
    } catch (err) {
      setNote(t("failed", { reason: explainArbitrationRefusal(R, err) }));
    } finally {
      setBusy(null);
    }
  }

  function requireContext() {
    const provider = currentSigner(wallet);
    if (!provider) throw new Error(t("reconnectSign"));
    if (!publicKey || !peerId) throw new Error(t("noWalletConnected"));
    if (!selected) throw new Error(t("selectCaseFirst"));
    return { provider, who: { publicKey, peerId }, endpoint, dispute: selected };
  }

  const offchainJoin = () =>
    run(t("busyJoin"), async () => {
      const { provider, who, endpoint: url, dispute } = requireContext();
      const join = buildJoin(dispute.id, who);
      const signature = await signPayload(provider, join);
      await sendSignedEvent(url, "sendArbitratorJoin", { join, signature });
      mine.forget();
      return t("joinedMsg");
    });

  const offchainCommit = () =>
    run(t("busyCommit"), async () => {
      const { provider, who, endpoint: url, dispute } = requireContext();
      const salt = newSalt();
      const commitment = await commitmentFor(OFFCHAIN_VOTE_BYTE[outcome], salt);
      const commit = buildCommit(dispute.id, who, commitment);
      const signature = await signPayload(provider, commit);
      await sendSignedEvent(url, "sendVoteCommit", { commit, signature });
      saveSalt(dispute.id, salt, outcome);
      mine.forget();
      return t("committedMsg", { outcome: t(`outcome.${outcome}`) });
    });

  const offchainReveal = () =>
    run(t("busyReveal"), async () => {
      const { provider, who, endpoint: url, dispute } = requireContext();
      const stored = loadSalt(dispute.id);
      if (!stored) {
        throw new Error(t("noSaltReveal"));
      }
      const reveal = buildReveal(dispute.id, who, stored.outcome, stored.salt);
      const signature = await signPayload(provider, reveal);
      await sendSignedEvent(url, "sendVoteReveal", { reveal, signature });
      clearSalt(dispute.id);
      mine.forget();
      return t("revealedMsg", { outcome: t(`outcome.${stored.outcome}`) });
    });

  if (!wallet) {
    return (
      <Panel title={t("panelArbitration")}>
        <p className="px-4 py-6 text-sm text-gray-400">
          {t("connectPrompt")}
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-6">
      <Panel title={t("openCases")} action={<button type="button" onClick={() => void refresh()} className="text-xs text-gray-400 hover:text-white">{t("refresh")}</button>}>
        {error && <p className="px-4 py-4 text-sm text-amber-400">{error}</p>}
        {!error && disputes?.length === 0 && (
          <p className="px-4 py-6 text-sm text-gray-400">{t("noDisputesNow")}</p>
        )}
        <ul className="divide-y divide-white/5">
          {disputes?.map((d) => {
            const seat = myCases?.find((c) => c.id === d.id) ?? null;
            return (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(d.id)}
                  className={`flex w-full items-center justify-between gap-4 px-4 py-3 text-left text-sm hover:bg-white/5 ${d.id === selectedId ? "bg-white/5" : ""}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-white">{d.id}</span>
                    {/* The complaint used to sit here. It is free text naming
                        people and banks, and a node no longer shows it to
                        someone who has not joined the case — so there is
                        nothing truthful to put on this line until then, and
                        the settlement it concerns is what identifies it. */}
                    <span className="block truncate text-xs text-gray-500">
                      {D("settlementRef", { id: d.settlement_id })}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-gray-400">
                    {D(`status.${d.status}`)} · {d.arbitrators_seated}/{d.required_arbitrators}
                    {seat && peerId && hasJoined(seat, peerId) ? t("joinedSuffix") : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Panel>

      {/* Reading your own cases is a separate, signed request. It is offered
          rather than done on load: it costs a wallet prompt, and a prompt
          nobody asked for is a prompt nobody reads. */}
      <Panel
        title={t("yourCases")}
        action={
          <button
            type="button"
            onClick={mine.read}
            className="text-xs text-gray-400 hover:text-white"
          >
            {mine.status === "loading" ? t("signing") : myCases ? t("readAgain") : t("readMyCases")}
          </button>
        }
      >
        <div className="px-4 py-4 text-sm">
          {mine.error ? (
            <p className="text-amber-400">{mine.error}</p>
          ) : myCases === null ? (
            <p className="text-gray-400">
              {t("yourCasesPrompt")}
            </p>
          ) : myCases.length === 0 ? (
            <p className="text-gray-400">
              {t("notSeatedAny")}
            </p>
          ) : (
            <p className="text-gray-400">
              {t("casesReadable", { count: myCases.length })}
            </p>
          )}
        </div>
      </Panel>

      {selected && peerId && (
        <Panel title={t("caseTitle", { id: selected.id })}>
          <div className="space-y-5 px-4 py-4 text-sm">
            {/* The complaint appears only once this wallet is entitled to it.
                Nothing stands in for it: an empty quote or a "hidden" label
                would both suggest the case says something it may not. */}
            {selectedMine ? (
              <p className="text-gray-400">{selectedMine.reason}</p>
            ) : (
              <p className="text-gray-500">
                {t("joinToSeeComplaint")}
              </p>
            )}

            <div>
              <span className="mb-1 block text-xs text-gray-500">{t("yourRuling")}</span>
              <select
                className={inputCls}
                value={outcome}
                onChange={(e) => setOutcome(e.target.value as ArbitratorOutcome)}
              >
                {OUTCOMES.map((o) => (
                  <option key={o} value={o}>
                    {t(`outcome.${o}`)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap gap-2">
              {/* Every one of these is gated on the full record, so before
                  "Read my cases" the console cannot tell a case this wallet
                  has already joined from one it has not. Joining a case twice
                  is refused by the node, which is the right place for it: the
                  alternative is guessing here. */}
              <Action
                label={t("joinCase")}
                disabled={
                  !isJoinable(selected) || (selectedMine !== null && hasJoined(selectedMine, peerId)) || busy !== null
                }
                onClick={offchainJoin}
              />
              <Action
                label={t("commitOff")}
                disabled={
                  selectedMine === null ||
                  !hasJoined(selectedMine, peerId) ||
                  hasCommitted(selectedMine, peerId) ||
                  busy !== null
                }
                onClick={offchainCommit}
              />
              <Action
                label={t("revealOff")}
                disabled={
                  selectedMine === null ||
                  !hasCommitted(selectedMine, peerId) ||
                  hasRevealed(selectedMine, peerId) ||
                  busy !== null
                }
                onClick={offchainReveal}
              />
            </div>

            <div className="border-t border-white/5 pt-4">
              <span className="mb-1 block text-xs text-gray-500">
                {t("onchainResId")}
              </span>
              <input
                className={inputCls}
                inputMode="numeric"
                placeholder={t("onchainResPlaceholder")}
                value={reservationId}
                onChange={(e) => setReservationId(e.target.value)}
              />
              <p className="mt-2 text-xs text-gray-500">
                {t("onchainNote")}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Action
                  label={t("commitOn")}
                  disabled={busy !== null}
                  onClick={() =>
                    run(t("busyOnchainCommit"), async () => {
                      const { provider, dispute } = requireContext();
                      if (!/^\d+$/.test(reservationId)) {
                        throw new Error(t("enterResId"));
                      }
                      const stored = loadSalt(dispute.id);
                      if (!stored) {
                        throw new Error(t("commitOffFirst"));
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
                      return t("submittedOnChain", { sig: await sendTx(provider, owner, ix) });
                    })
                  }
                />
                <Action
                  label={t("revealOn")}
                  disabled={busy !== null}
                  onClick={() =>
                    run(t("busyOnchainReveal"), async () => {
                      const { provider, dispute } = requireContext();
                      if (!/^\d+$/.test(reservationId)) {
                        throw new Error(t("enterResId"));
                      }
                      const stored = loadSalt(dispute.id);
                      if (!stored) throw new Error(t("noSaltShort"));
                      const owner = new PublicKey(wallet.address);
                      const [stakePda] = staking.stakeAccountPda(owner, 1); // Role.Arbitrator
                      const ix = escrow.revealDisputeVoteIx(
                        owner,
                        BigInt(reservationId),
                        ONCHAIN_OUTCOME_BYTE[stored.outcome],
                        stored.salt,
                        stakePda,
                      );
                      return t("submittedOnChain", { sig: await sendTx(provider, owner, ix) });
                    })
                  }
                />
              </div>
            </div>

            {busy && <p className="text-xs text-gray-500">{t("working", { what: busy.what })}</p>}
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
  return shortSig(signature);
}
