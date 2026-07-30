"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { WALLET_CHANGED_EVENT, readWalletConnection } from "@/lib/wallet-connection";
import { hexForPeerId, peerIdBytesForAddress } from "@/lib/peer-id";
import { PeerIdentity } from "@/components/peer-identity";
import { useMyDisputes } from "@/components/disputes/use-my-disputes";
import type { Dispute, PublicDispute } from "@/lib/live-disputes";
import { formatDateMs, shortSig } from "@/lib/format";
import { CopyButton } from "@/components/copy-button";
import { Panel } from "@/components/panel";
import { TradeAttachments } from "@/components/orders/trade-attachments";
import { StatusPill } from "@/components/status-pill";

const STATUS_LABEL: Record<PublicDispute["status"], string> = {
  Open: "Open",
  CaseLocked: "Case Locked",
  RevealPhase: "Reveal Phase",
  Resolved: "Resolved",
};

const RESOLUTION_LABEL: Record<NonNullable<PublicDispute["resolution"]>, string> = {
  BuyerWins: "Buyer wins",
  MerchantWins: "Merchant wins",
  MutualSettlement: "Mutual settlement",
  Invalid: "Invalid dispute",
};

const sameBytes = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

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
  const [myPeerId, setMyPeerId] = useState<number[] | null>(null);
  const mine = useMyDisputes();
  const full = mine.data?.find((d) => d.id === dispute.id) ?? null;

  useEffect(() => {
    const update = () => {
      const wallet = readWalletConnection();
      setMyPeerId(wallet ? peerIdBytesForAddress(wallet.address) : null);
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
          Escrow for settlement {dispute.settlement_id} is frozen while this case is open.
        </p>
      )}

      <Panel title="Case record" action={<StatusPill status={STATUS_LABEL[dispute.status]} />}>
        <div className="divide-y divide-white/5 px-4">
          <Row label="Dispute ID" value={dispute.id} mono />
          <Row label="Settlement" value={dispute.settlement_id} mono />
          {full && <Parties dispute={full} myPeerId={myPeerId} />}
          <Row label="Arbitrators required" value={String(dispute.required_arbitrators)} />
          <Row label="Filed" value={formatDateMs(dispute.opened_at)} />
          <Row label="Updated" value={formatDateMs(dispute.updated_at)} />
        </div>
        {!full && <YourAccess state={mine} />}
      </Panel>

      {/* Evidence, above the arbitrator list because it is what an
          arbitrator has come to read. The panel resolves the settlement's
          own parties on the node, so only the buyer's and seller's
          attachments appear — anyone can publish a record naming this
          settlement. */}
      <Panel title="Evidence">
        <div className="px-4 py-4">
          <TradeAttachments settlementId={dispute.settlement_id} />
        </div>
      </Panel>

      <Panel title={`Arbitrators — ${dispute.arbitrators_seated} of ${dispute.required_arbitrators}`}>
        {full ? (
          <ArbitratorRoster dispute={full} />
        ) : dispute.arbitrators_seated === 0 ? (
          <p className="px-4 py-4 text-sm text-gray-500">No arbitrator has joined this case yet.</p>
        ) : (
          /* Counts, not names. Which arbitrator drew which case and how they
             voted is exactly the pairing worth misusing, so a node gives the
             totals to onlookers and the roster to the people in the case. */
          <p className="px-4 py-4 text-sm text-gray-400">
            {dispute.commitments} of {dispute.arbitrators_seated} seated{" "}
            {dispute.arbitrators_seated === 1 ? "arbitrator has" : "arbitrators have"} published a
            commitment, and {dispute.reveals} {dispute.reveals === 1 ? "has" : "have"} revealed a
            vote. Who they are is readable by the parties and the panel.
          </p>
        )}
      </Panel>

      {dispute.status === "Resolved" && dispute.resolution && (
        <Panel title={`Outcome — ${RESOLUTION_LABEL[dispute.resolution]}`} className="border-emerald-400/25">
          <div className="px-4 py-4">
            <p className="text-sm leading-relaxed text-gray-200">
              {dispute.reveals} of {dispute.arbitrators_seated} seated arbitrators revealed a vote.
            </p>
            <div className="mt-4 flex items-start justify-between gap-4 text-sm">
              <span className="shrink-0 text-gray-500">On-chain execution tx</span>
              {dispute.onchain_execution_signature ? (
                <span className="flex min-w-0 items-center gap-2 text-right text-gray-200">
                  <span className="truncate font-mono text-xs">{shortSig(dispute.onchain_execution_signature)}</span>
                  <CopyButton value={dispute.onchain_execution_signature} />
                </span>
              ) : (
                <span className="text-xs text-gray-500">Not yet confirmed on-chain</span>
              )}
            </div>
          </div>
        </Panel>
      )}

      {/* "The seller has agreed and the buyer has not" is a negotiating
          position between two people. It reaches those two people and the
          panel deciding the case, and nobody else. */}
      {full && (full.buyer_agreed_mutual_settlement || full.seller_agreed_mutual_settlement) && (
        <Panel title="Mutual settlement">
          <div className="divide-y divide-white/5 px-4">
            <Row label="Buyer agreed" value={full.buyer_agreed_mutual_settlement ? "Yes" : "No"} />
            <Row label="Seller agreed" value={full.seller_agreed_mutual_settlement ? "Yes" : "No"} />
          </div>
        </Panel>
      )}

      <Panel title="How this is decided">
        <p className="px-4 py-3 text-xs leading-relaxed text-gray-500">
          There is no assigned judge. Independent arbitrators stake OPEN to join a case they choose and vote by
          commit-and-reveal, so no one can see how others voted first. Consensus is computed by deterministic rules
          every implementation reaches identically, and the escrow program executes the result without human
          approval. Joining a case, committing, and revealing a vote is the arbitrator console&apos;s job — see{" "}
          <Link href="/arbitrate" className="text-brand hover:text-brand-hover">
            Arbitrate
          </Link>
          .
        </p>
      </Panel>
    </div>
  );
}

function Parties({ dispute, myPeerId }: { dispute: Dispute; myPeerId: number[] | null }) {
  const label = (peer: number[]) => (
    <PeerIdentity peer={peer} isYou={myPeerId ? sameBytes(peer, myPeerId) : false} />
  );
  return (
    <>
      <Row label="Buyer" value={label(dispute.buyer)} />
      <Row label="Seller" value={label(dispute.seller)} />
      <Row label="Opened by" value={label(dispute.opener)} />
      <Row label="Reason" value={dispute.reason} />
    </>
  );
}

function ArbitratorRoster({ dispute }: { dispute: Dispute }) {
  if (dispute.arbitrators.length === 0) {
    return <p className="px-4 py-4 text-sm text-gray-500">No arbitrator has joined this case yet.</p>;
  }
  return (
    <ul className="divide-y divide-white/5">
      {dispute.arbitrators.map((a) => {
        const hex = hexForPeerId(a);
        const committed = dispute.commitments.some((c) => sameBytes(c.arbitrator, a));
        const reveal = dispute.reveals.find((r) => sameBytes(r.arbitrator, a));
        return (
          <li key={hex} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            {/* An arbitrator is only ever a PeerId — they are chosen by
                stake, not by identity, and nothing names them. A face
                derived from that id is still just the id. */}
            <span className="text-xs text-gray-400">
              <PeerIdentity peer={a} size={20} />
            </span>
            <span className="ml-auto text-xs text-gray-500">
              {reveal ? (
                <span className="text-brand-teal">{reveal.vote}</span>
              ) : committed ? (
                <span title="Commitment published; vote not yet revealed">committed</span>
              ) : (
                <span className="text-gray-600">joined</span>
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
  const border = "border-t border-white/5 px-4 py-3 text-xs leading-relaxed text-gray-500";

  if (state.status === "no-wallet") {
    return (
      <p className={border}>
        The parties and the complaint are readable by the buyer, the seller and the arbitrators
        seated on this case. Connect the wallet that is in it to see them.
      </p>
    );
  }
  if (state.status === "loaded") {
    return (
      <p className={border}>
        The connected wallet is not a party to this case and is not seated on it, so the parties
        and the complaint stay closed.
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
        {state.status === "loading" ? "Signing…" : "I am in this case"}
      </button>{" "}
      — signs a challenge with your wallet to unlock the parties and the complaint.
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
