"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ARBITRATOR_REQUIREMENTS,
  DISPUTE_OUTCOMES,
  MY_ARBITRATOR_STANDING,
  arbitratorEligible,
} from "@/lib/data/disputes";
import { merchantByName } from "@/lib/data/merchants";
import {
  DISPUTE_STAGES,
  type Dispute,
  type DisputeOutcome,
  type DisputeStage,
  type EvidenceKind,
  disputeStageIndex,
  evidenceVisible,
  isDisputeParty,
} from "@/lib/types";
import { formatDate, formatNumber, shortSig } from "@/lib/format";
import { CopyButton } from "@/components/copy-button";
import { MerchantCell } from "@/components/merchant-cell";
import { Panel } from "@/components/panel";
import { StatusPill } from "@/components/status-pill";

/** Stages that carry an explanation worth showing inline. */
const STAGE_NOTE: Partial<Record<DisputeStage, string>> = {
  "Escrow Frozen": "Automatic on filing. Neither party can release or reclaim funds.",
  "Arbitrators Joining": "Qualified arbitrators volunteer by committing stake. Evidence stays sealed until they are accepted.",
  "Case Locked": "The required number of arbitrators was reached, so no more may join.",
  "Evidence Released": "Evidence becomes available to seated arbitrators only.",
  "Commit Phase": "Each arbitrator publishes a cryptographic commitment to their vote. The commitment reveals nothing.",
  "Reveal Phase": "Votes and their secrets are revealed. Only reveals matching the earlier commitment count.",
  Decision: "Consensus follows deterministic rules — no operator interpretation.",
  "Escrow Released": "The escrow program executes the outcome without human approval.",
};

const KIND_STYLE: Record<EvidenceKind, string> = {
  Protocol: "border-brand-teal/40 text-brand-teal",
  Participant: "border-white/20 text-gray-300",
  "Risk Intelligence": "border-amber-400/40 text-amber-200",
};

const KIND_NOTE: Record<EvidenceKind, string> = {
  Protocol: "Generated and signed by the protocol, so it is cryptographically verifiable.",
  Participant: "Submitted by a party to the trade. Immutable once submitted.",
  "Risk Intelligence": "Contributed by a registered provider. Informs the case but never decides it.",
};

export function DisputeCaseView({
  dispute,
  tradeSig,
}: {
  dispute: Dispute;
  tradeSig?: string;
}) {
  const seatedFromData = dispute.arbitrators.some((a) => a.isYou);
  const [joined, setJoined] = useState(seatedFromData);
  const [commitment, setCommitment] = useState<string | null>(
    dispute.arbitrators.find((a) => a.isYou)?.commitment ?? null,
  );
  const [choice, setChoice] = useState<DisputeOutcome | "">("");
  const [revealed, setRevealed] = useState<DisputeOutcome | null>(
    dispute.arbitrators.find((a) => a.isYou)?.revealed ?? null,
  );

  const stageAt = disputeStageIndex(dispute.stage);
  const closed = dispute.stage === "Closed";
  const party = isDisputeParty(dispute);
  const canSeeEvidence = evidenceVisible(dispute, joined);
  // A party to the trade cannot arbitrate their own dispute, so the join
  // affordance only appears to third parties.
  const openForJoining = dispute.stage === "Arbitrators Joining" && !party;
  const eligible = arbitratorEligible();

  /* A commitment is a hash of vote + secret. Derived here from the choice so
     the value shown changes with the vote, without pretending to be real. */
  function commit() {
    if (!choice) return;
    const seed = `${dispute.id}:${choice}`;
    let h = 0;
    for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) | 0;
    setCommitment(`0x${(h >>> 0).toString(16).padStart(8, "0")}…${dispute.id.slice(-3)}`);
  }

  return (
    <div className="space-y-6">
      {!closed && (
        <p className="border-l-2 border-red-400 bg-red-400/5 px-4 py-2.5 text-sm text-red-200">
          Escrow for trade {dispute.tradeId} is frozen — {formatNumber(dispute.amount, 2)}{" "}
          {dispute.asset} cannot move while this case is open.
        </p>
      )}

      {/* §14 timeline */}
      <Panel title="Case timeline">
        <ol className="divide-y divide-white/5">
          {DISPUTE_STAGES.map((stage, i) => {
            const done = i < stageAt;
            const now = i === stageAt;
            return (
              <li key={stage} className="flex gap-3 px-4 py-2.5">
                <span
                  aria-hidden
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                    now ? "bg-brand" : done ? "bg-brand-teal/60" : "bg-white/15"
                  }`}
                />
                <div className="min-w-0">
                  <p className={`text-sm ${now ? "font-medium text-white" : done ? "text-gray-400" : "text-gray-600"}`}>
                    {stage}
                    {now && <span className="ml-2 text-xs font-normal text-brand">current</span>}
                  </p>
                  {STAGE_NOTE[stage] && (now || done) && (
                    <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{STAGE_NOTE[stage]}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          {/* Evidence — sealed unless seated or already released */}
          <Panel
            title={canSeeEvidence ? `Evidence — ${dispute.evidence.length} entries` : "Evidence — sealed"}
          >
            {canSeeEvidence ? (
              <ol className="divide-y divide-white/5">
                {dispute.evidence.map((e) => (
                  <li key={e.ref} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded border px-1.5 py-0.5 text-[0.6875rem] uppercase tracking-wide ${KIND_STYLE[e.kind]}`}
                        title={KIND_NOTE[e.kind]}
                      >
                        {e.kind}
                      </span>
                      <span className="text-sm font-medium text-gray-200">{e.label}</span>
                      <span className="ml-auto font-mono text-xs text-gray-600">{e.ref}</span>
                    </div>
                    {e.detail && <p className="mt-1.5 text-xs leading-relaxed text-gray-400">{e.detail}</p>}
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-3 text-xs text-gray-600">
                      <span>{e.submittedBy}</span>
                      <span className="tabular-nums">{formatDate(e.at)}</span>
                      <span className="font-mono">hash {e.hash}</span>
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="px-4 py-4">
                <p className="text-sm text-gray-300">
                  Evidence is withheld until an arbitrator has committed stake and been accepted into the case.
                </p>
                <p className="mt-2 text-xs leading-relaxed text-gray-500">
                  This is deliberate. Before joining you receive only the metadata below — no payment evidence, no
                  screenshots, no bank references, no trade messages, and no participant identity beyond protocol
                  identifiers. Because there is nothing to see before committing stake, there is little to bribe an
                  arbitrator about.
                </p>
                <dl className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                  {[
                    ["Case identifier", dispute.id],
                    ["Dispute category", dispute.category],
                    ["Required stake", `${formatNumber(dispute.arbitrationStake, 0)} OPEN`],
                    ["Filed", formatDate(dispute.openedAt)],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4 border-t border-white/5 pt-2">
                      <dt className="text-gray-500">{k}</dt>
                      <dd className="text-right text-gray-200">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </Panel>

          {/* Voting — only meaningful for a seated arbitrator */}
          {joined && !closed && (
            <Panel title="Your vote">
              <div className="px-4 py-4">
                {!commitment ? (
                  <>
                    <p className="text-xs leading-relaxed text-gray-500">
                      Commit phase. Choose an outcome and publish a commitment; the commitment reveals nothing about the
                      vote itself. You reveal the vote and its secret after the commit period closes.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {DISPUTE_OUTCOMES.map((o) => (
                        <button
                          key={o}
                          type="button"
                          onClick={() => setChoice(o)}
                          className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                            choice === o
                              ? "border-brand bg-brand/10 text-white"
                              : "border-white/10 text-gray-300 hover:border-white/25"
                          }`}
                        >
                          {o}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={commit}
                      disabled={!choice}
                      className="mt-4 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                    >
                      Publish commitment
                    </button>
                    <p className="mt-2 text-xs text-gray-600">
                      Simulated — nothing is signed or broadcast.
                    </p>
                  </>
                ) : !revealed ? (
                  <>
                    <p className="text-sm text-gray-200">
                      Commitment published:{" "}
                      <span className="font-mono text-xs text-brand-teal">{commitment}</span>
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-gray-500">
                      Reveal phase. The protocol checks the revealed vote against this commitment and counts it only if
                      they match. A revealed vote outside the final consensus forfeits part of your stake — a partial,
                      moderate slash, because honest arbitrators sometimes disagree.
                    </p>
                    <button
                      type="button"
                      onClick={() => setRevealed((choice as DisputeOutcome) || "Buyer Wins")}
                      className="mt-4 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white"
                    >
                      Reveal vote
                    </button>
                  </>
                ) : (
                  <p className="text-sm text-gray-200">
                    Revealed <span className="font-medium text-white">{revealed}</span>. Counted — it matches your
                    commitment. The outcome is determined once the reveal deadline passes.
                  </p>
                )}
              </div>
            </Panel>
          )}

          {closed && dispute.outcome && (
            <Panel title={`Outcome — ${dispute.outcome}`} className="border-emerald-400/25">
              <div className="px-4 py-4">
                {dispute.tally && (
                  <ul className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                    {Object.entries(dispute.tally).map(([outcome, n]) => (
                      <li key={outcome} className="tabular-nums text-gray-300">
                        {outcome}: <span className="font-medium text-white">{n}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-sm leading-relaxed text-gray-200">{dispute.resolutionNote}</p>

                {dispute.settlement && (
                  <>
                    <h3 className="mt-5 text-xs font-semibold uppercase tracking-wider text-gray-500">Settlement</h3>
                    <ul className="mt-2 space-y-1">
                      {dispute.settlement.map((s) => (
                        <li key={s} className="text-sm text-gray-300">{s}</li>
                      ))}
                    </ul>
                  </>
                )}

                {dispute.reputationImpact && (
                  <>
                    <h3 className="mt-5 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Reputation impact
                    </h3>
                    <ul className="mt-2 space-y-1">
                      {dispute.reputationImpact.map((r) => (
                        <li key={r} className="text-sm text-gray-400">{r}</li>
                      ))}
                    </ul>
                  </>
                )}

                <p className="mt-5 border-t border-white/5 pt-3 text-xs leading-relaxed text-gray-500">
                  This version has no appeal process. Multiple arbitration rounds would extend settlement times and
                  leave finality uncertain, so the decision above is final.
                </p>
              </div>
            </Panel>
          )}
        </div>

        <div className="space-y-6">
          {/* §8 dispute record */}
          <Panel title="Case record">
            <div className="divide-y divide-white/5 px-4">
              {merchantByName(dispute.counterparty) && (
                <div className="py-4">
                  <MerchantCell merchant={merchantByName(dispute.counterparty)!} size="md" />
                </div>
              )}
              <Row label="Dispute ID" value={dispute.id} />
              <Row label="Trade" value={dispute.tradeId} href={`/orders/${dispute.tradeId}`} />
              <Row label="Reservation" value={dispute.reservationId} />
              <Row label="Advertisement" value={dispute.adId} />
              <Row label="Buyer wallet" value={shortSig(dispute.buyerWallet)} copy={dispute.buyerWallet} />
              <Row label="Merchant wallet" value={shortSig(dispute.merchantWallet)} copy={dispute.merchantWallet} />
              {tradeSig && <Row label="Escrow tx" value={shortSig(tradeSig)} copy={tradeSig} />}
              <Row label="Grounds" value={dispute.category} />
              <Row label="You are" value={dispute.viewerRole} />
              <Row label="Filed" value={formatDate(dispute.openedAt)} />
              <Row
                label="Amount frozen"
                value={`${formatNumber(dispute.amount, 2)} ${dispute.asset}`}
              />
              <Row
                label="Fiat leg"
                value={`${formatNumber(dispute.fiatAmount, 2)} ${dispute.fiatCurrency}`}
              />
              <Row label="Filing fee" value={`${formatNumber(dispute.filingFee, 0)} OPEN`} />
            </div>
          </Panel>

          {/* Arbitrator seats */}
          <Panel
            title={`Arbitrators — ${dispute.arbitrators.length}${
              openForJoining ? " so far" : ` of ${dispute.seatsRequired}`
            }`}
          >
            <div className="px-4 py-3">
              {openForJoining && (
                <p className="mb-3 text-xs leading-relaxed text-gray-500">
                  The number required is not published. Disclosing it would let anyone estimate the value at risk, so
                  the protocol keeps the threshold internal and locks the case the moment it is met.
                </p>
              )}
              <ul className="divide-y divide-white/5">
                {dispute.arbitrators.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <span className="font-mono text-xs text-gray-400">{a.id}</span>
                    {a.isYou && <span className="text-xs text-brand">you</span>}
                    <span className="ml-auto flex items-center gap-3 text-xs tabular-nums text-gray-500">
                      <span title="Arbitrator reputation">rep {a.reputation}</span>
                      <span title="OPEN stake committed to this case">
                        {formatNumber(a.stake, 0)}
                      </span>
                      {a.revealed ? (
                        <span className={a.withConsensus === false ? "text-amber-300" : "text-brand-teal"}>
                          {a.revealed}
                        </span>
                      ) : a.commitment ? (
                        <span className="text-gray-400" title="Commitment published; vote not yet revealed">
                          committed
                        </span>
                      ) : (
                        <span className="text-gray-600">joined</span>
                      )}
                      {a.slashed ? (
                        <span className="text-amber-300" title="Partial slash for a minority reveal">
                          −{formatNumber(a.slashed, 0)}
                        </span>
                      ) : a.reward ? (
                        <span className="text-emerald-300" title="Arbitration reward">
                          +{formatNumber(a.reward, 0)}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>

              {openForJoining && !joined && (
                <div className="mt-4 border-t border-white/5 pt-4">
                  {eligible ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setJoined(true)}
                        className="w-full rounded-md bg-brand px-4 py-2.5 text-sm font-medium text-white"
                      >
                        Commit {formatNumber(dispute.arbitrationStake, 0)} OPEN and join
                      </button>
                      <p className="mt-2 text-xs leading-relaxed text-gray-500">
                        Joining releases the evidence to you and obliges you to vote. Simulated — no stake moves.
                      </p>
                    </>
                  ) : (
                    <p className="text-xs leading-relaxed text-amber-200">
                      You do not currently meet the arbitrator requirements — at least{" "}
                      {formatNumber(ARBITRATOR_REQUIREMENTS.minStake, 0)} OPEN staked, reputation{" "}
                      {ARBITRATOR_REQUIREMENTS.minReputation}, {ARBITRATOR_REQUIREMENTS.minProtocolAgeDays} days of
                      protocol age and no active penalties. You have {MY_ARBITRATOR_STANDING.reputation} reputation.
                    </p>
                  )}
                </div>
              )}

              {joined && openForJoining && (
                <p className="mt-4 border-t border-white/5 pt-4 text-xs leading-relaxed text-brand-teal">
                  Stake committed and participation accepted. Evidence has been released to you.
                </p>
              )}
            </div>
          </Panel>

          <Panel title="How this is decided">
            <p className="px-4 py-3 text-xs leading-relaxed text-gray-500">
              There is no assigned judge. Independent arbitrators stake OPEN to join a case they choose, review evidence
              that stays sealed until they commit, and vote by commit-and-reveal so no one can see how others voted
              first. Consensus is computed by deterministic rules that every implementation reaches identically, and the
              escrow program executes the result without human approval.{" "}
              <Link href="/guide" className="text-brand hover:text-brand-hover">
                Read the guide
              </Link>
            </p>
          </Panel>

          <Panel title="Status">
            <div className="px-4 py-3">
              <StatusPill status={dispute.stage} />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, href, copy }: { label: string; value: string; href?: string; copy?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <span className="shrink-0 text-gray-500">{label}</span>
      <span className="flex min-w-0 items-center gap-2 text-right text-gray-200">
        {href ? (
          <Link href={href} className="text-brand hover:text-brand-hover">{value}</Link>
        ) : (
          <span className={`truncate ${copy ? "font-mono text-xs" : ""}`}>{value}</span>
        )}
        {copy && <CopyButton value={copy} />}
      </span>
    </div>
  );
}
