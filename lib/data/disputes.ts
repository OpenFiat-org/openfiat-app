import type { Dispute } from "@/lib/types";

/**
 * Simulated disputes. Disputes can only be opened on active trades and freeze
 * the escrow PDA automatically until an arbitrator rules.
 */
export const DISPUTES: Dispute[] = [
  {
    id: "DSP-101",
    tradeId: "TRD-7012",
    counterparty: "SwiftKES",
    userRole: "Buyer",
    openedAt: "2026-07-26T11:45:00Z",
    status: "Evidence Submitted",
    arbitrator: "Pending assignment",
    evidence: [
      { time: "11:12", kind: "event", actor: "You", text: "PaymentSubmitted — signed “I Paid” action for KES 59,391.00." },
      { time: "11:20", kind: "message", actor: "You", text: "M-Pesa confirmation message and I&M transfer receipt uploaded." },
      { time: "11:45", kind: "event", actor: "You", text: "DisputeOpened — merchant has not approved payment after 30 min." },
      { time: "12:05", kind: "event", actor: "Protocol", text: "EvidenceSubmitted — 2 documents from buyer, awaiting merchant response." },
    ],
  },
  {
    id: "DSP-102",
    tradeId: "TRD-7013",
    counterparty: "WestlandsOTC",
    userRole: "Seller",
    openedAt: "2026-07-25T17:05:00Z",
    status: "Investigation",
    arbitrator: "Arb. Wanjiru K. (Elite Arbitrator)",
    evidence: [
      { time: "16:40", kind: "event", actor: "WestlandsOTC", text: "PaymentSubmitted — merchant marked KES 195,720.00 as sent." },
      { time: "17:05", kind: "event", actor: "You", text: "DisputeOpened — no funds received; bank statement uploaded." },
      { time: "18:22", kind: "event", actor: "Arbitrator", text: "InvestigationStarted — arbitrator requested merchant's bank proof." },
      { time: "09:14", kind: "event", actor: "WestlandsOTC", text: "EvidenceSubmitted — merchant provided a transfer receipt (under review)." },
    ],
  },
  {
    id: "DSP-103",
    tradeId: "TRD-7014",
    counterparty: "KenyaStarTrades",
    userRole: "Buyer",
    openedAt: "2026-07-24T10:44:00Z",
    status: "Decision",
    arbitrator: "Arb. Otieno M. (Institutional Arbitrator)",
    evidence: [
      { time: "10:15", kind: "event", actor: "You", text: "PaymentSubmitted — signed “I Paid” action for KES 119,205.00." },
      { time: "10:44", kind: "event", actor: "KenyaStarTrades", text: "DisputeOpened — merchant claims KES 118,205.00 received (1,000 short)." },
      { time: "11:30", kind: "event", actor: "Protocol", text: "EvidenceSubmitted — both parties submitted M-Pesa statements." },
      { time: "15:12", kind: "event", actor: "Arbitrator", text: "DecisionPending — arbitrator is drafting the ruling." },
    ],
  },
  {
    id: "DSP-104",
    tradeId: "TRD-7015",
    counterparty: "KenyaStarTrades",
    userRole: "Buyer",
    openedAt: "2026-07-20T13:30:00Z",
    status: "Closed",
    arbitrator: "Arb. Wanjiru K. (Elite Arbitrator)",
    outcome: "Buyer Wins",
    resolutionNote: "Merchant failed to respond within the evidence window. Escrow released to the buyer in full (300.00 USDC).",
    reputationImpact: "Merchant's Dispute Rate increased and Settlement Speed decreased; your Payment Accuracy was unaffected.",
    evidence: [
      { time: "13:10", kind: "event", actor: "You", text: "PaymentSubmitted — signed “I Paid” action for KES 39,510.00." },
      { time: "13:30", kind: "event", actor: "You", text: "DisputeOpened — merchant unresponsive after payment." },
      { time: "13:58", kind: "event", actor: "Protocol", text: "EvidenceSubmitted — M-Pesa receipt and chat log uploaded." },
      { time: "14:05", kind: "event", actor: "Arbitrator", text: "DisputeResolved — Buyer Wins; escrow released to buyer." },
    ],
  },
];

export function disputeById(id: string): Dispute | undefined {
  return DISPUTES.find((d) => d.id === id);
}
