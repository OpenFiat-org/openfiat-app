"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { WALLET_CHANGED_EVENT, readWalletConnection } from "@/lib/wallet-connection";
import { peerIdForAddress } from "@/lib/peer-id";
import { PeerIdentity } from "@/components/peer-identity";
import { useMyDisputes } from "@/components/disputes/use-my-disputes";
import type { Dispute, PublicDispute } from "@/lib/live-disputes";
import { formatDateMs, shortSig } from "@/lib/format";
import { CopyButton } from "@/components/copy-button";
import { Panel } from "@/components/panel";
import { TradeAttachments } from "@/components/orders/trade-attachments";
import { StatusPill } from "@/components/status-pill";

/** Canonical (spaced) status — drives StatusPill's colour. */
const STATUS_LABEL: Record<PublicDispute["status"], string> = {
  Open: "Open",
  CaseLocked: "Case Locked",
  RevealPhase: "Reveal Phase",
  Resolved: "Resolved",
};


/**
 * One real dispute, read from `getDispute` (OFS-2400) — and, if the connected
 * wallet is in it, from `getMyDisputes` as well.
 *
 * # Why the page is in two halves
 *
 * `getDispute` is open, and now redacted: it says the case exists, what stage
 * it is at, how many arbitrator seats are filled, and how it came out. It
 * does not say who the parties are, what the complaint says, or which
 * arbitrator voted which way. Those are, in order: the trade graph this
 * protocol gates on physical-safety grounds (`lib/counterparties.ts`), free
 * text that names people and banks as a matter of course, and the
 * arbitrator-to-vote pairing that makes pressuring an arbitrator worth doing.
 *
 * The buyer, the seller and the seated arbitrators read the whole case, by
 * signing a challenge with the wallet that is in it. So this page shows the
 * public record to anyone and fills in the rest for the people it belongs to.
 *
 * # No stand-ins
 *
 * Where the full record is absent, its fields are absent — no truncated
 * hash, no "hidden", no greyed-out row. A row on this page means the case
 * carries that value; the alternative teaches a reader that a blank means
 * something about the case rather than about their own access.
 *
 * # What this replaced
 *
 * A mock case view with a "Publish commitment" / "Reveal vote" flow labelled
 * "Simulated — nothing is signed or broadcast", a sealed-evidence list of
 * invented entries, an invented buyer/merchant Solana wallet pair, and an
 * arbitrator roster with invented reputation/stake/reward figures. None of
 * that has a live counterpart: `openfiat_disputes::Dispute` carries no
 * evidence list, no fiat leg, no filing fee, and no per-arbitrator
 * reputation/stake — see `lib/live-disputes.ts`'s own doc.
 *
 * Actually joining a case, committing a vote, and revealing it is the
 * arbitrator console's job (`components/arbitrate/arbitration-console.tsx`) —
 * this page is the disputant-facing read view and does not duplicate that
 * write flow.
 */
export function DisputeCaseView({ dispute }: { dispute: PublicDispute }) {
  const t = useTranslations("disputes");
  const [myPeerId, setMyPeerId] = useState<string | null>(null);
  const mine = useMyDisputes();
  const full = mine.data?.find((d) => d.id === dispute.id) ?? null;

  useEffect(() => {
    const update = () => {
      const wallet = readWalletConnection();
      setMyPeerId(wallet ? peerIdForAddress(wallet.address) : null);
    };
    update();
    window.addEventListener(WALLET_CHANGED_EVENT, update);
    return () => window.removeEventListener(WALLET_CHANGED_EVENT, update);
  }, []);

  const resolved = dispute.status === "Resolved";

  return (
    <div className="space-y-6">
      {!resolved && (
        <p className="border-l-2 border-red-400 bg-red-400/5 px-4 py-2.5 text-sm text-red-200">
          {t("frozenNote", { id: dispute.settlement_id })}
        </p>
      )}

      <Panel title={t("caseRecord")} action={<StatusPill status={STATUS_LABEL[dispute.status]} label={t(`status.${dispute.status}`)} />}>
        <div className="divide-y divide-white/5 px-4">
          <Row label={t("disputeId")} value={dispute.id} mono />
          <Row label={t("settlement")} value={dispute.settlement_id} mono />
          {full && <Parties dispute={full} myPeerId={myPeerId} />}
          <Row label={t("arbitratorsRequired")} value={String(dispute.required_arbitrators)} />
          <Row label={t("filed")} value={formatDateMs(dispute.opened_at)} />
          <Row label={t("updated")} value={formatDateMs(dispute.updated_at)} />
        </div>
        {!full && <YourAccess state={mine} />}
      </Panel>

      {/* Evidence, above the arbitrator list because it is what an
          arbitrator has come to read. The panel resolves the settlement's
          own parties on the node, so only the buyer's and seller's
          attachments appear — anyone can publish a record naming this
          settlement. */}
      <Panel title={t("evidence")}>
        <div className="px-4 py-4">
          <TradeAttachments settlementId={dispute.settlement_id} />
        </div>
      </Panel>

      <Panel title={t("arbitratorsTitle", { seated: dispute.arbitrators_seated, required: dispute.required_arbitrators })}>
        {full ? (
          <ArbitratorRoster dispute={full} />
        ) : dispute.arbitrators_seated === 0 ? (
          <p className="px-4 py-4 text-sm text-gray-500">{t("noArbitrator")}</p>
        ) : (
          /* Counts, not names. Which arbitrator drew which case and how they
             voted is exactly the pairing worth misusing, so a node gives the
             totals to onlookers and the roster to the people in the case. */
          <p className="px-4 py-4 text-sm text-gray-400">
            {t("arbitratorProgress", {
              commitments: dispute.commitments,
              seated: dispute.arbitrators_seated,
              reveals: dispute.reveals,
            })}
          </p>
        )}
      </Panel>

      {dispute.status === "Resolved" && dispute.resolution && (
        <Panel title={t("outcomeTitle", { resolution: t(`resolution.${dispute.resolution}`) })} className="border-emerald-400/25">
          <div className="px-4 py-4">
            <p className="text-sm leading-relaxed text-gray-200">
              {t("revealedCount", { reveals: dispute.reveals, seated: dispute.arbitrators_seated })}
            </p>
            <div className="mt-4 flex items-start justify-between gap-4 text-sm">
              <span className="shrink-0 text-gray-500">{t("onchainExecTx")}</span>
              {dispute.onchain_execution_signature ? (
                <span className="flex min-w-0 items-center gap-2 text-right text-gray-200">
                  <span className="truncate font-mono text-xs">{shortSig(dispute.onchain_execution_signature)}</span>
                  <CopyButton value={dispute.onchain_execution_signature} />
                </span>
              ) : (
                <span className="text-xs text-gray-500">{t("notYetConfirmed")}</span>
              )}
            </div>
          </div>
        </Panel>
      )}

      {/* "The seller has agreed and the buyer has not" is a negotiating
          position between two people. It reaches those two people and the
          panel deciding the case, and nobody else. */}
      {full && (full.buyer_agreed_mutual_settlement || full.seller_agreed_mutual_settlement) && (
        <Panel title={t("mutualTitle")}>
          <div className="divide-y divide-white/5 px-4">
            <Row label={t("buyerAgreed")} value={full.buyer_agreed_mutual_settlement ? t("yes") : t("no")} />
            <Row label={t("sellerAgreed")} value={full.seller_agreed_mutual_settlement ? t("yes") : t("no")} />
          </div>
        </Panel>
      )}

      <Panel title={t("howDecidedTitle")}>
        <p className="px-4 py-3 text-xs leading-relaxed text-gray-500">
          {t.rich("howDecided", {
            link: (chunks) => (
              <Link href="/arbitrate" className="text-brand hover:text-brand-hover">
                {chunks}
              </Link>
            ),
          })}
        </p>
      </Panel>
    </div>
  );
}

function Parties({ dispute, myPeerId }: { dispute: Dispute; myPeerId: string | null }) {
  const t = useTranslations("disputes");
  const label = (peer: string) => (
    <PeerIdentity peer={peer} isYou={myPeerId ? peer === myPeerId : false} />
  );
  return (
    <>
      <Row label={t("buyer")} value={label(dispute.buyer)} />
      <Row label={t("seller")} value={label(dispute.seller)} />
      <Row label={t("openedBy")} value={label(dispute.opener)} />
      <Row label={t("reason")} value={dispute.reason} />
    </>
  );
}

function ArbitratorRoster({ dispute }: { dispute: Dispute }) {
  const t = useTranslations("disputes");
  if (dispute.arbitrators.length === 0) {
    return <p className="px-4 py-4 text-sm text-gray-500">{t("noArbitrator")}</p>;
  }
  return (
    <ul className="divide-y divide-white/5">
      {dispute.arbitrators.map((a) => {
        const committed = dispute.commitments.some((c) => c.arbitrator === a);
        const reveal = dispute.reveals.find((r) => r.arbitrator === a);
        return (
          <li key={a} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            {/* An arbitrator is only ever a PeerId — they are chosen by
                stake, not by identity, and nothing names them. A face
                derived from that id is still just the id. */}
            <span className="text-xs text-gray-400">
              <PeerIdentity peer={a} size={20} />
            </span>
            <span className="ml-auto text-xs text-gray-500">
              {reveal ? (
                <span className="text-brand-teal">{t(`resolution.${reveal.vote}`)}</span>
              ) : committed ? (
                <span title={t("voteCommittedTitle")}>{t("voteCommitted")}</span>
              ) : (
                <span className="text-gray-600">{t("voteJoined")}</span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * What to say to a reader who is not (yet) shown the whole case.
 *
 * A wallet that signs and turns out not to be in this case gets told exactly
 * that — not silence, which would be indistinguishable from the read having
 * failed.
 */
function YourAccess({ state }: { state: ReturnType<typeof useMyDisputes> }) {
  const t = useTranslations("disputes");
  const border = "border-t border-white/5 px-4 py-3 text-xs leading-relaxed text-gray-500";

  if (state.status === "no-wallet") {
    return (
      <p className={border}>
        {t("accessConnect")}
      </p>
    );
  }
  if (state.status === "loaded") {
    return (
      <p className={border}>
        {t("accessNotParty")}
      </p>
    );
  }
  return (
    <p className={border}>
      {state.error && <span className="mr-2 text-amber-400">{state.error}</span>}
      <button
        type="button"
        onClick={state.read}
        disabled={state.status === "loading"}
        className="text-gray-400 underline decoration-dotted underline-offset-4 hover:text-white disabled:opacity-50"
      >
        {state.status === "loading" ? t("signing") : t("iAmInCase")}
      </button>{" "}
      {t("accessSignsChallenge")}
    </p>
  );
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <span className="shrink-0 text-gray-500">{label}</span>
      <span className={`truncate text-right text-gray-200 ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}
