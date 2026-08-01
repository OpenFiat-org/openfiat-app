/**
 * OpenFiat protocol entity types.
 *
 * These mirror the entities defined in the OpenFiat whitepaper: Solana is the
 * settlement layer (escrow PDAs, staking, treasury, governance) and OpenFiat
 * is the coordination layer (ads, reservations, reputation, sessions,
 * notifications). Everything in `lib/data/` is simulated demo data until the
 * app is connected to a live OpenFiat node.
 */


/** ISO 4217 code (or local pseudo-code) — open-ended, see lib/data/countries.ts. */
export type FiatCurrency = string;

/** Buy/Sell from the perspective stated on the entity (ad: the merchant, trade: the current user). */
export type TradeDirection = "Buy" | "Sell";



/** Sentinel for the International market view (any currency, any payment method). */
export const INTERNATIONAL_MARKET = "INTERNATIONAL";

/** Settlement lifecycle (escrow-enforced on Solana). */
export type SettlementStatus =
  | "Escrow Locked"
  | "Awaiting Payment"
  | "Payment Submitted"
  | "Merchant Reviewing"
  | "Approved"
  | "Escrow Released"
  | "Completed"
  | "Rejected"
  | "Cancelled"
  | "Disputed";

/** Ordered happy-path lifecycle used by the trade-room stepper. */
export const SETTLEMENT_STEPS: SettlementStatus[] = [
  "Escrow Locked",
  "Awaiting Payment",
  "Payment Submitted",
  "Merchant Reviewing",
  "Approved",
  "Escrow Released",
  "Completed",
];

/**
 * OFS-2200 §18, in order — a separate state machine from settlement, not a
 * prefix of it. Reservation owns everything up to and including "Escrow
 * Locked"; that state is the handoff point where authority passes to
 * settlement (OFS-2300 §20), which is why "Escrow Locked" opens
 * `SETTLEMENT_STEPS` above rather than being a settlement-owned state.
 *
 * Every `Trade` in this app already exists past that handoff — a trade
 * object doesn't exist until its reservation resolved to Escrow Locked — so
 * this phase is always fully complete by the time a trade room renders it.
 * It's still drawn, not skipped: without it, the settlement stepper's
 * "Escrow Locked" reads as the start of the trade rather than the point one
 * phase handed off to another.
 */
export const RESERVATION_STEPS = [
  "Requested",
  "Validated",
  "Accepted",
  "Escrow Locked",
] as const;

/** One standardized, individually-copyable payment detail (per method shape). */
export interface PaymentField {
  label: string;
  value: string;
}

/*
 * A `Trade` interface and its `TradeEvent` chat rows used to sit here: a
 * fixture shape carrying `paymentInstructions`, hand-written `time` labels
 * like "14:02", and pseudo transaction signatures. The real one is in
 * `lib/live-trades.ts`, keyed the way the node keys it, and the trade chat
 * is the node's own sealed channel (`getMyTradeChannel`).
 */

/** OFS-2400 §14, in order. The stepper walks this list. */
export const DISPUTE_STAGES = [
  "Opened",
  "Escrow Frozen",
  "Evidence Submitted",
  "Investigation",
  "Arbitrators Joining",
  "Case Locked",
  "Evidence Released",
  "Commit Phase",
  "Reveal Phase",
  "Decision",
  "Escrow Released",
  "Reputation Updated",
  "Closed",
] as const;

export type DisputeStage = (typeof DISPUTE_STAGES)[number];

/**
 * Who is looking at a case. "Buyer" and "Seller" are parties to the disputed
 * trade; the other two are third parties who may arbitrate it. A party cannot
 * arbitrate their own dispute, so the two sets never overlap.
 */
export type DisputeViewerRole =
  | "Buyer"
  | "Seller"
  | "Arbitrator"
  | "Prospective arbitrator";

/** Grounds for opening, per OFS-2400 §5 / Chapter 11 §11.3. */
export type DisputeCategory =
  | "Merchant rejected payment"
  | "Buyer disputes rejection"
  | "Incorrect payment reported"
  | "Escrow issue reported"
  | "Payment delay exceeded timeout"
  | "Fraud suspected"
  | "No agreement reached";

/**
 * OFS-2400 §17. "Partial Settlement" is explicitly marked future work there,
 * so it is not a value this version can produce.
 */
export type DisputeOutcome =
  | "Buyer Wins"
  | "Merchant Wins"
  | "Mutual Settlement"
  | "Invalid Dispute";

/**
 * OFS-2400 §10-12. Protocol evidence is cryptographically verifiable and so
 * carries the most weight; risk intelligence informs but never decides
 * (§12). The distinction is shown rather than flattened into one list.
 */
export type EvidenceKind = "Protocol" | "Participant" | "Risk Intelligence";

export interface EvidenceEntry {
  /** Immutable reference — evidence is append-only (§9). */
  ref: string;
  kind: EvidenceKind;
  label: string;
  /** Protocol identifier, never a legal identity (Chapter 11 §11.8). */
  submittedBy: string;
  at: string;
  /** Content hash; large files live off-protocol with the hash recorded (§13). */
  hash: string;
  detail?: string;
}

/** One arbitrator's participation in a case. */
export interface ArbitratorSeat {
  /** Protocol identifier only. */
  id: string;
  /** OPEN committed to join (Chapter 11 §11.7). */
  stake: number;
  reputation: number;
  joinedAt: string;
  /** Commitment published during the commit phase (§11.12). */
  commitment?: string;
  /** Revealed vote; only reveals matching the commitment are counted. */
  revealed?: DisputeOutcome;
  /** Set once consensus is known (§11.13). */
  withConsensus?: boolean;
  /** Moderate partial slash for a minority reveal (§11.16). */
  slashed?: number;
  /** Reward for participating with consensus (§11.15). */
  reward?: number;
  /** True for the seat held by the current user. */
  isYou?: boolean;
}

/** Chapter 11 §11.6. Governance may change these over time. */
export interface ArbitratorEligibility {
  minStake: number;
  minReputation: number;
  minProtocolAgeDays: number;
  activePenalties: number;
}

export interface Dispute {
  /** Permanent, for audit (OFS-2400 §7). */
  id: string;
  tradeId: string;
  reservationId: string;
  adId: string;
  /** Wallets, per the §8 record — not names. */
  buyerWallet: string;
  merchantWallet: string;
  counterparty: string;
  /**
   * How the current user relates to this case. A party to the trade and a
   * third-party juror are different viewers with different rights, and
   * collapsing them into one "role" is what makes the evidence seal
   * unrepresentable — a buyer always sees their own case, an arbitrator only
   * after committing stake.
   */
  viewerRole: DisputeViewerRole;
  category: DisputeCategory;
  openedAt: string; // ISO
  stage: DisputeStage;
  /** Asset held in the frozen escrow. */
  asset: string;
  amount: number;
  fiatCurrency: string;
  fiatAmount: number;
  /** OPEN required to join this case as an arbitrator. */
  arbitrationStake: number;
  filingFee: number;
  arbitrators: ArbitratorSeat[];
  /**
   * Chapter 11 §11.9: the required arbitrator count is withheld while a case
   * is open, because publishing it would leak the value at risk. It becomes
   * knowable only once the case locks.
   */
  seatsRequired: number | null;
  evidence: EvidenceEntry[];
  outcome?: DisputeOutcome;
  /** Tally of revealed votes once the reveal phase closes. */
  tally?: Partial<Record<DisputeOutcome, number>>;
  resolutionNote?: string;
  settlement?: string[];
  reputationImpact?: string[];
}

/** Where a case sits in the §14 sequence. */
export function disputeStageIndex(stage: DisputeStage): number {
  return DISPUTE_STAGES.indexOf(stage);
}

/** True for the buyer or seller of the disputed trade. */
export function isDisputeParty(dispute: Dispute): boolean {
  return dispute.viewerRole === "Buyer" || dispute.viewerRole === "Seller";
}

/**
 * Evidence stays sealed until an arbitrator has committed stake and been
 * accepted (Chapter 11 §11.8) — the property that makes bribery before
 * participation pointless, since there is nothing to bribe about yet.
 *
 * Note what does *not* unseal it: reaching a later stage. Evidence is released
 * to seated arbitrators, never published to the network — §13 distributes
 * evidence *references* so every node agrees on what exists, and §23 keeps the
 * contents private. A case at reveal stage is no more readable to a passer-by
 * than one still collecting arbitrators.
 *
 * Parties to the trade submitted the evidence, so sealing it from them would
 * protect nothing.
 */
export function evidenceVisible(dispute: Dispute, joined: boolean): boolean {
  return isDisputeParty(dispute) || joined;
}


/*
 * `ReputationProfile` — a tier, a next tier, a percentage toward it and eight
 * 0-100 dimension scores — is gone with its only instance. The protocol has
 * no tiers and no scores of any kind: `crates/reputation` records counters
 * and derives rates from them, which is what `lib/live-reputation.ts` reads
 * and `components/account/live-reputation.tsx` shows.
 */

/*
 * `WalletBalance`, `Vault` and `VaultEvent` used to be declared here, as the
 * shapes of `lib/data/wallet.ts`'s fixtures. All three are gone with it.
 *
 * They are not replaced by equivalents, because the real shapes are not
 * equivalent and pretending otherwise is what let the fixture look
 * plausible. A real vault is keyed by token MINT rather than by an asset
 * ticker, carries five counters rather than four (`pending_settlement` was
 * simply missing), and stores every one of them as a u64 of base units
 * rather than a float — a `number` cannot hold a u64 without rounding, and
 * a balance is the last place to accept that.
 *
 * The live shapes are `LiveVault` in `lib/live-vaults.ts` and `TokenBalance`
 * in `lib/live-token-balances.ts`, each declared next to the code that reads
 * it from chain.
 */


/** OFS-4100 §5's 6-category taxonomy, chosen over OFS-4000's 5-category one. */
export type ProposalCategory =
  | "Informational"
  | "Standards"
  | "Parameter"
  | "Treasury"
  | "Protocol-Upgrade"
  | "Constitutional";



// ── Service Registry (OFS-1500) ───────────────────────────────────────────────

export type ServiceType =
  | "Notification Provider"
  | "Oracle Provider"
  | "Risk Intelligence Provider"
  | "Snapshot Provider"
  | "Merchant Gateway"
  | "Public API Node";

/** OFS-1500 §11. Maintenance is a distinct state from degraded: one is
 *  planned, the other is not, and a client picking a provider should be able to
 *  tell them apart. */
