/**
 * OpenFiat protocol entity types.
 *
 * These mirror the entities defined in the OpenFiat whitepaper: Solana is the
 * settlement layer (escrow PDAs, staking, treasury, governance) and OpenFiat
 * is the coordination layer (ads, reservations, reputation, sessions,
 * notifications). Everything in `lib/data/` is simulated demo data until the
 * app is connected to a live OpenFiat node.
 */

export type StablecoinAsset = "USDT" | "USDC" | "USD1" | "SOL";
export type Asset = StablecoinAsset | "OPEN";

/** ISO 4217 code (or local pseudo-code) — open-ended, see lib/data/countries.ts. */
export type FiatCurrency = string;

/** Buy/Sell from the perspective stated on the entity (ad: the merchant, trade: the current user). */
export type TradeDirection = "Buy" | "Sell";

export type MerchantTier =
  | "Explorer"
  | "Verified"
  | "Professional"
  | "Elite"
  | "Institutional";

export type MerchantAvailability =
  | "Online"
  | "Busy"
  | "Away"
  | "Offline"
  | "Vacation";

export interface Merchant {
  id: string;
  name: string;
  /** ISO/pseudo country code — see lib/data/countries.ts. */
  countryCode: string;
  /** Borderless OTC desk: trades in any fiat currency, any payment method. */
  international?: boolean;
  tier: MerchantTier;
  orders: number;
  completionRate: number; // 0–100
  availability: MerchantAvailability;
  avgResponseTime: string; // e.g. "<1 min"
  /** Full Solana wallet address (deterministic pseudo-address in simulated data). */
  wallet: string;
  /** OPEN staked (merchant bond + delegation). */
  stake: number;
  /** Highest verified identity level. */
  identityLevel: IdentityLevel;
  /** e.g. "14 months". */
  merchantAge: string;
  /** 30-day trade volume in USDT. */
  volume30d: number;
  /** Average ticket size in USDT. */
  avgTicket: number;
  /** e.g. "6 min median". */
  settlementSpeed: string;
}

export type PricingModel =
  | { type: "Fixed"; price: number }
  | { type: "Floating"; premiumPct: number };

export type AdStatus = "Online" | "Paused";

export interface Advertisement {
  id: string;
  merchantId: string;
  asset: StablecoinAsset;
  /** Merchant's direction: a Sell ad appears under the taker's "Buy" tab. */
  direction: TradeDirection;
  fiatCurrency: FiatCurrency;
  pricing: PricingModel;
  minTrade: number; // fiat
  maxTrade: number; // fiat
  availableLiquidity: number; // crypto, backed by the merchant's liquidity vault
  /** Empty on international ads — they semantically accept any payment method. */
  paymentMethods: string[];
  /** Borderless ad: priced in USD, accepts any fiat currency (FX-converted) and any payment method. */
  international?: boolean;
  /**
   * Advertiser terms — the merchant's own conditions, in their own words.
   *
   * OFS-2100 §13 lets a merchant declare methods but not the practical
   * conditions around them, and those conditions are what disputes turn on:
   * whose name must be on the transfer, what reference to use, which hours
   * they settle. Shown before a taker commits rather than discovered in chat.
   */
  terms?: string;
  /**
   * Minimum counterparty reputation the merchant will trade with.
   *
   * Not a protocol field: OFS-2100 §6 enumerates what an advertisement contains
   * and this is not in it. It is an application-level preference, so it is
   * advisory — this client will not open an order below it and says why, but a
   * different client is under no obligation to honour it, and nothing on chain
   * enforces it. Presenting it as a hard gate would be a lie about where the
   * enforcement lives.
   *
   * Filtering on reputation is squarely within OFS-3000 §22, which leaves
   * marketplace ranking to the application; requiring it is the part the
   * protocol does not speak to.
   */
  minCounterpartyReputation?: number;
  status: AdStatus;
  updatedAt: string; // ISO timestamp
}

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

export interface TradeEvent {
  time: string; // static label, e.g. "14:02"
  kind: "event" | "message";
  actor: string;
  text: string;
}

export interface Trade {
  id: string;
  adId: string;
  counterpartyId: string;
  /** The current user's direction in this trade. */
  direction: TradeDirection;
  asset: StablecoinAsset;
  cryptoAmount: number;
  fiatAmount: number;
  price: number;
  fiatCurrency: FiatCurrency;
  paymentMethod: string;
  paymentInstructions: string;
  /** Standardized copyable payment details, shaped per payment method. */
  paymentFields: PaymentField[];
  /** Solana-style settlement transaction signature (88-char base58). */
  txSig: string;
  /** Escrow creation transaction signature. */
  escrowSig: string;
  status: SettlementStatus;
  createdAt: string; // ISO
  updatedAt: string; // static relative label, e.g. "2 min ago"
  events: TradeEvent[];
}

/*
 * Dispute resolution, modelled on OFS-2400 (ODP) and Chapter 11.
 *
 * The protocol is not a judge model. A case is published with metadata only,
 * qualified arbitrators volunteer by committing OPEN stake, evidence is
 * withheld until they are accepted, the required number of them is never
 * disclosed, and they vote by commit-and-reveal. Every type below exists to
 * keep one of those properties representable.
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

export type IdentityLevel = "L0" | "L1" | "L2" | "L3";
export type ClaimStatus = "Verified" | "Pending" | "Not started";

export interface IdentityClaim {
  level: IdentityLevel;
  title: string;
  description: string;
  status: ClaimStatus;
  details: string[];
  expiry?: string;
}

/**
 * A written review left by a counterparty after a trade.
 *
 * The rater is a truncated wallet, not a name: OFS-5000 publishes identity
 * claims only where a participant chose to, and a buyer who verified nothing
 * beyond their wallet has no name to show. Borrowing the merchant's convention
 * of display names here would invent identity for the other side.
 */
export interface MerchantReview {
  id: string;
  merchantId: string;
  /** Truncated wallet of the counterparty who left it. */
  rater: string;
  positive: boolean;
  at: string; // ISO
  /** What the rater did, from their side of the trade. */
  side: "Bought" | "Sold";
  comment: string;
}

export interface ReputationDimension {
  label: string;
  score: number; // 0–100
  display: string; // human-readable value, e.g. "98.6%" or "4.2 h"
}

export interface ReputationProfile {
  tier: MerchantTier;
  nextTier: MerchantTier;
  progressPct: number; // progress toward nextTier
  dimensions: ReputationDimension[];
}

export interface WalletBalance {
  asset: Asset;
  balance: number;
  fiatValue: number; // USD equivalent
}

/** Per-merchant, per-stablecoin liquidity vault. */
export interface Vault {
  asset: StablecoinAsset;
  total: number;
  available: number;
  reserved: number;
  settled: number;
}

export interface VaultEvent {
  time: string;
  type: string; // protocol event name, e.g. "VaultBalanceReserved"
  asset: StablecoinAsset;
  amount: number;
  summary: string;
}

export type NodeRole =
  | "Full Node"
  | "Bootstrap Node"
  | "Snapshot Provider"
  | "Notification Gateway"
  | "Oracle Provider"
  | "Risk Intelligence Provider"
  | "Merchant Gateway"
  | "Public API Node";

export interface StakingPosition {
  node: string;
  role: NodeRole;
  amount: number; // OPEN
  aprPct: number;
  rewards: number; // OPEN earned
}

export interface StakingSummary {
  totalStaked: number; // OPEN
  merchantBond: number; // OPEN locked as the bond required to publish ads
  pendingRewards: number; // OPEN
  cooldownDays: number;
}

export type ProposalStatus = "Active" | "Passed" | "Rejected" | "Executed";

/** OFS-4100 §5's 6-category taxonomy, chosen over OFS-4000's 5-category one. */
export type ProposalCategory =
  | "Informational"
  | "Standards"
  | "Parameter"
  | "Treasury"
  | "Protocol-Upgrade"
  | "Constitutional";

export interface Proposal {
  id: string; // OFIP-####
  category: ProposalCategory;
  title: string;
  description: string;
  status: ProposalStatus;
  votingEnds: string; // static label
  votesFor: number; // percent
  votesAgainst: number; // percent
  votesAbstain: number; // percent
  /** Required quorum, set by category (OFS-4100 §5) — 10% standard, 20% for Protocol-Upgrade/Constitutional. */
  quorumPct: number;
  /** Required For-share to pass, set by category — 50/60/66 (simple majority / Treasury / Protocol-Upgrade & Constitutional). */
  approvalThresholdPct: number;
  turnoutPct: number; // current turnout
  /** [PROPOSED — NEEDS SIGN-OFF] OFS-4100 §5: 5,000 OPEN, refunded if quorum is met by the deadline. */
  depositOpen: number;
  /** null while voting is still open; set once the deadline passes. */
  depositRefunded: boolean | null;
}

export type NodeStatus = "Online" | "Syncing" | "Offline";

export interface NetworkNode {
  id: string;
  role: NodeRole;
  region: string;
  version: string;
  status: NodeStatus;
  latencyMs: number;
  peers: number;
}

export interface NetworkStats {
  nodesOnline: number;
  peers: number;
  blockHeight: number;
  epoch: number;
  protocolVersion: string;
}

/** Event-sourced coordination layer: every transition emits a signed event. */
export interface ProtocolEvent {
  type: string; // e.g. "ReservationAccepted"
  actor: string;
  timestamp: string; // ISO
  summary: string;
}

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
export type ProviderStatus = "Online" | "Maintenance" | "Degraded" | "Offline";

export interface PricingItem {
  item: string;
  price: string;
}

/** OFS-1500 Service Registration. */
export interface ServiceProvider {
  /** Service ID, e.g. "svc-pingrelay". */
  id: string;
  type: ServiceType;
  /** Provider identity (display name). */
  name: string;
  /** Provider wallet (registration signer). */
  wallet: string;
  /**
   * The rest of the §5 identity. A registered endpoint URL on its own proves
   * nothing — anyone can advertise a host. A node connecting to a provider
   * needs the peer ID it expects to handshake with and the public key the
   * registration was signed under, or the registry becomes a list of addresses
   * an attacker can impersonate.
   */
  nodeIdentity: string;
  peerId: string;
  publicKey: string;
  endpoints: string[];
  protocolVersions: string[];
  region: string;
  capabilities: string[];
  pricing: PricingItem[];
  /** Registration timestamp (ISO). */
  registeredAt: string;
  /** Registration signature over the record. */
  signature: string;
  status: ProviderStatus;
  uptimePct: number; // 0–100
  latencyMs: number;
  description: string;
}
