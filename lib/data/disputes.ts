import type {
  ArbitratorEligibility,
  Dispute,
  DisputeCategory,
  DisputeOutcome,
} from "@/lib/types";

/**
 * Simulated disputes, following OFS-2400 (ODP) and Chapter 11.
 *
 * The shape of this data is the point. A dispute is not handed to a named
 * judge: it is published with metadata only, staked arbitrators volunteer,
 * evidence is released to them only after they are accepted, the number of
 * them required is never published, and they vote by commit-and-reveal. The
 * four cases below exist to show that sequence at four different points.
 */

/** Chapter 11 §11.6, as the network currently parameterises it. */
export const ARBITRATOR_REQUIREMENTS: ArbitratorEligibility = {
  minStake: 50_000,
  minReputation: 80,
  minProtocolAgeDays: 30,
  activePenalties: 0,
};

/** The current user's standing against those requirements. */
export const MY_ARBITRATOR_STANDING = {
  stakeAvailable: 62_500,
  reputation: 86,
  protocolAgeDays: 214,
  activePenalties: 0,
  casesRuled: 34,
  consensusRate: 94.1,
};

export function arbitratorEligible(): boolean {
  return (
    MY_ARBITRATOR_STANDING.stakeAvailable >= ARBITRATOR_REQUIREMENTS.minStake &&
    MY_ARBITRATOR_STANDING.reputation >= ARBITRATOR_REQUIREMENTS.minReputation &&
    MY_ARBITRATOR_STANDING.protocolAgeDays >=
      ARBITRATOR_REQUIREMENTS.minProtocolAgeDays &&
    MY_ARBITRATOR_STANDING.activePenalties ===
      ARBITRATOR_REQUIREMENTS.activePenalties
  );
}

/** Reasons a dispute may be opened, for the filing control (§5). */
export const DISPUTE_CATEGORIES: DisputeCategory[] = [
  "Merchant rejected payment",
  "Buyer disputes rejection",
  "Incorrect payment reported",
  "Escrow issue reported",
  "Payment delay exceeded timeout",
  "Fraud suspected",
  "No agreement reached",
];

/** §17. Partial Settlement is future work and deliberately absent. */
export const DISPUTE_OUTCOMES: DisputeOutcome[] = [
  "Buyer Wins",
  "Merchant Wins",
  "Mutual Settlement",
  "Invalid Dispute",
];

export const DISPUTES: Dispute[] = [
  /*
   * Open for participation. This is the case an arbitrator can join: the
   * metadata below is everything §11.8 permits before joining, and the
   * evidence list is deliberately populated so the UI has something to seal —
   * it renders as sealed until stake is committed.
   */
  {
    id: "DSP-118",
    tradeId: "TRD-7012",
    reservationId: "RSV-41902",
    adId: "AD-1002",
    buyerWallet: "7pPHq4Xy2mKcVn8dRfL3sWbGtY6uJvE9aNqZxCtUuv",
    merchantWallet: "9wKmB3nRtLpXe2vHsA7cQdY4fZuJ6gTkNoPrVi8Duqz",
    counterparty: "SwiftKES",
    viewerRole: "Prospective arbitrator",
    category: "Payment delay exceeded timeout",
    openedAt: "2026-07-27T09:12:00Z",
    stage: "Arbitrators Joining",
    asset: "USDT",
    amount: 450,
    fiatCurrency: "KES",
    fiatAmount: 59_391,
    arbitrationStake: 50_000,
    filingFee: 25,
    seatsRequired: null,
    arbitrators: [
      { id: "arb:4f81c2", stake: 50_000, reputation: 91, joinedAt: "2026-07-27T09:48:00Z" },
      { id: "arb:9a03de", stake: 50_000, reputation: 84, joinedAt: "2026-07-27T10:02:00Z" },
    ],
    evidence: [
      {
        ref: "EV-118-1",
        kind: "Protocol",
        label: "ReservationCreated",
        submittedBy: "protocol",
        at: "2026-07-27T08:31:00Z",
        hash: "b7f2…91ac",
        detail: "450.00 USDT reserved from the merchant's liquidity vault; 20-minute window opened.",
      },
      {
        ref: "EV-118-2",
        kind: "Protocol",
        label: "PaymentSubmitted",
        submittedBy: "protocol",
        at: "2026-07-27T08:44:00Z",
        hash: "3c81…70de",
        detail: "Buyer signed the payment declaration for KES 59,391.00.",
      },
      {
        ref: "EV-118-3",
        kind: "Participant",
        label: "Bank transfer receipt (PDF)",
        submittedBy: "buyer",
        at: "2026-07-27T08:52:00Z",
        hash: "e05a…44b1",
        detail: "Stored off-protocol; the hash recorded here is what arbitrators verify against.",
      },
      {
        ref: "EV-118-4",
        kind: "Protocol",
        label: "EscrowFrozen",
        submittedBy: "protocol",
        at: "2026-07-27T09:12:00Z",
        hash: "aa19…5f2c",
        detail: "Automatic on filing. No funds can move while the dispute is active.",
      },
    ],
  },

  /*
   * Locked and under review — the user holds a seat, so evidence is released
   * to them and they can commit a vote.
   */
  {
    id: "DSP-117",
    tradeId: "TRD-7013",
    reservationId: "RSV-41855",
    adId: "AD-1016",
    buyerWallet: "5tRxN8kMbVc3qWdF7uYzHpA2sLeJ4gTnQoZiXr9Bmky",
    merchantWallet: "2hLpQ7vXnB4mKcRt9wYdA6sZfU3eJgTkNoPrVi5Cuxa",
    counterparty: "WestlandsOTC",
    viewerRole: "Arbitrator",
    category: "Incorrect payment reported",
    openedAt: "2026-07-26T17:05:00Z",
    stage: "Commit Phase",
    asset: "USDT",
    amount: 1_500,
    fiatCurrency: "KES",
    fiatAmount: 195_720,
    arbitrationStake: 50_000,
    filingFee: 25,
    seatsRequired: 5,
    arbitrators: [
      { id: "arb:4f81c2", stake: 50_000, reputation: 91, joinedAt: "2026-07-26T17:41:00Z", commitment: "0x8c1f…a20b" },
      { id: "arb:71bd90", stake: 50_000, reputation: 88, joinedAt: "2026-07-26T17:52:00Z", commitment: "0x44de…9f13" },
      { id: "arb:you", stake: 50_000, reputation: 86, joinedAt: "2026-07-26T18:04:00Z", isYou: true },
      { id: "arb:c2ee15", stake: 50_000, reputation: 83, joinedAt: "2026-07-26T18:19:00Z", commitment: "0x0b77…31ca" },
      { id: "arb:e93a48", stake: 50_000, reputation: 95, joinedAt: "2026-07-26T18:26:00Z" },
    ],
    evidence: [
      {
        ref: "EV-117-1",
        kind: "Protocol",
        label: "PaymentSubmitted",
        submittedBy: "protocol",
        at: "2026-07-26T16:40:00Z",
        hash: "5d90…c1e7",
        detail: "Merchant marked KES 195,720.00 as sent.",
      },
      {
        ref: "EV-117-2",
        kind: "Participant",
        label: "Bank statement, 60-day window (PDF)",
        submittedBy: "seller",
        at: "2026-07-26T17:14:00Z",
        hash: "9be3…d802",
        detail: "No matching credit on the stated date.",
      },
      {
        ref: "EV-117-3",
        kind: "Participant",
        label: "Transfer receipt (screenshot)",
        submittedBy: "buyer",
        at: "2026-07-27T09:14:00Z",
        hash: "c471…6a55",
        detail: "Reference number does not appear in the seller's statement.",
      },
      {
        ref: "EV-117-4",
        kind: "Protocol",
        label: "OraclePriceHistory",
        submittedBy: "protocol",
        at: "2026-07-26T16:40:00Z",
        hash: "1f8b…4470",
        detail: "USDT/KES mid at reservation: 132.24. Confirms the amount owed.",
      },
      {
        ref: "EV-117-5",
        kind: "Risk Intelligence",
        label: "Wallet screening — no adverse findings",
        submittedBy: "provider:cipherowl",
        at: "2026-07-26T18:31:00Z",
        hash: "77ca…9e10",
        detail: "Informs the investigation; per §12 it does not determine the outcome.",
      },
    ],
  },

  /* Reveal phase: commitments in, votes coming out. */
  {
    id: "DSP-116",
    tradeId: "TRD-7014",
    reservationId: "RSV-41790",
    adId: "AD-1001",
    buyerWallet: "8mKvB2nQtRpXe5cHsA9wYdZ3fUuJ7gTkNoPrVi4Dxqm",
    merchantWallet: "4qWdF8uYzHpA6sLeJ2gTnQoZiXr7BmkyRxN3tVc5Puh",
    counterparty: "KenyaStarTrades",
    viewerRole: "Prospective arbitrator",
    category: "Merchant rejected payment",
    openedAt: "2026-07-25T12:20:00Z",
    stage: "Reveal Phase",
    asset: "USDT",
    amount: 900,
    fiatCurrency: "KES",
    fiatAmount: 119_205,
    arbitrationStake: 50_000,
    filingFee: 25,
    seatsRequired: 3,
    arbitrators: [
      { id: "arb:4f81c2", stake: 50_000, reputation: 91, joinedAt: "2026-07-25T12:58:00Z", commitment: "0x2a9c…7701", revealed: "Buyer Wins" },
      { id: "arb:b7f120", stake: 50_000, reputation: 87, joinedAt: "2026-07-25T13:10:00Z", commitment: "0xdd41…3e8a", revealed: "Buyer Wins" },
      { id: "arb:e93a48", stake: 50_000, reputation: 95, joinedAt: "2026-07-25T13:22:00Z", commitment: "0x91b0…c26f" },
    ],
    evidence: [
      {
        ref: "EV-116-1",
        kind: "Protocol",
        label: "PaymentSubmitted",
        submittedBy: "protocol",
        at: "2026-07-25T11:52:00Z",
        hash: "6e21…b930",
      },
      {
        ref: "EV-116-2",
        kind: "Participant",
        label: "M-Pesa transaction reference",
        submittedBy: "buyer",
        at: "2026-07-25T11:55:00Z",
        hash: "0ac8…51f4",
        detail: "Reference resolves to the merchant's stated paybill for the full amount.",
      },
      {
        ref: "EV-116-3",
        kind: "Protocol",
        label: "SessionHistory",
        submittedBy: "protocol",
        at: "2026-07-25T12:20:00Z",
        hash: "b204…7dd9",
        detail: "Merchant rejected the payment 4 minutes after it was declared, with no stated reason.",
      },
    ],
  },

  /* Closed. Consensus reached, escrow settled, one minority reveal slashed. */
  {
    id: "DSP-112",
    tradeId: "TRD-7015",
    reservationId: "RSV-41604",
    adId: "AD-1007",
    buyerWallet: "7pPHq4Xy2mKcVn8dRfL3sWbGtY6uJvE9aNqZxCtUuv",
    merchantWallet: "6sZfU3eJgTkNoPrVi9CuxaHLpQ7vXnB2mKcRt4wYdAe",
    counterparty: "KenyaStarTrades",
    viewerRole: "Buyer",
    category: "Payment delay exceeded timeout",
    openedAt: "2026-07-20T13:30:00Z",
    stage: "Closed",
    asset: "USDC",
    amount: 300,
    fiatCurrency: "KES",
    fiatAmount: 39_510,
    arbitrationStake: 50_000,
    filingFee: 25,
    seatsRequired: 5,
    arbitrators: [
      { id: "arb:4f81c2", stake: 50_000, reputation: 91, joinedAt: "2026-07-20T14:02:00Z", commitment: "0x71aa…0c39", revealed: "Buyer Wins", withConsensus: true, reward: 180 },
      { id: "arb:71bd90", stake: 50_000, reputation: 88, joinedAt: "2026-07-20T14:11:00Z", commitment: "0x5b02…ff81", revealed: "Buyer Wins", withConsensus: true, reward: 180 },
      { id: "arb:8ac401", stake: 50_000, reputation: 86, joinedAt: "2026-07-20T14:20:00Z", commitment: "0xc390…12ab", revealed: "Buyer Wins", withConsensus: true, reward: 180 },
      { id: "arb:c2ee15", stake: 50_000, reputation: 83, joinedAt: "2026-07-20T14:33:00Z", commitment: "0x2f81…77b0", revealed: "Buyer Wins", withConsensus: true, reward: 180 },
      { id: "arb:d40b71", stake: 50_000, reputation: 79, joinedAt: "2026-07-20T14:40:00Z", commitment: "0x9ee1…4a02", revealed: "Merchant Wins", withConsensus: false, slashed: 5_000 },
    ],
    outcome: "Buyer Wins",
    tally: { "Buyer Wins": 4, "Merchant Wins": 1 },
    evidence: [
      {
        ref: "EV-112-1",
        kind: "Protocol",
        label: "PaymentSubmitted",
        submittedBy: "protocol",
        at: "2026-07-20T13:10:00Z",
        hash: "e410…22bc",
      },
      {
        ref: "EV-112-2",
        kind: "Participant",
        label: "M-Pesa confirmation SMS",
        submittedBy: "buyer",
        at: "2026-07-20T13:12:00Z",
        hash: "8d02…c751",
      },
      {
        ref: "EV-112-3",
        kind: "Protocol",
        label: "NotificationHistory",
        submittedBy: "protocol",
        at: "2026-07-20T13:30:00Z",
        hash: "44f9…10ae",
        detail: "Three delivery attempts to the merchant; none acknowledged within the window.",
      },
    ],
    resolutionNote:
      "Four of five revealed votes matched. Consensus follows deterministic rules — no node operator or AllenHark interpretation is involved.",
    settlement: [
      "300.00 USDC released from escrow to the buyer",
      "Filing fee of 25 OPEN refunded to the buyer",
      "720 OPEN distributed to the four arbitrators in consensus",
      "5,000 OPEN slashed from the minority reveal — 10% of stake, partial by design",
    ],
    reputationImpact: [
      "Merchant: dispute rate up, settlement speed down",
      "Buyer: payment accuracy unaffected; evidence submitted promptly",
      "Arbitrators in consensus: consensus alignment and throughput up",
      "Minority arbitrator: consensus alignment down; no penalty beyond the partial slash, since honest disagreement is expected",
    ],
  },
];

export function disputeById(id: string): Dispute | undefined {
  return DISPUTES.find((d) => d.id === id);
}

/** Cases still accepting arbitrators (Chapter 11 §11.7). */
export function openForParticipation(): Dispute[] {
  return DISPUTES.filter((d) => d.stage === "Arbitrators Joining");
}
