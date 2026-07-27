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

export type DisputeStatus =
  | "Evidence Submitted"
  | "Investigation"
  | "Decision"
  | "Closed";

export type DisputeOutcome =
  | "Buyer Wins"
  | "Merchant Wins"
  | "Mutual Settlement"
  | "Invalid Dispute";

export interface Dispute {
  id: string;
  tradeId: string;
  counterparty: string;
  userRole: "Buyer" | "Seller";
  openedAt: string; // ISO
  status: DisputeStatus;
  arbitrator: string;
  outcome?: DisputeOutcome;
  resolutionNote?: string;
  reputationImpact?: string;
  evidence: TradeEvent[];
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

export interface Proposal {
  id: string; // OFP-###
  title: string;
  description: string;
  status: ProposalStatus;
  votingEnds: string; // static label
  votesFor: number; // percent
  votesAgainst: number; // percent
  votesAbstain: number; // percent
  quorumPct: number; // required quorum
  turnoutPct: number; // current turnout
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

export type ProviderStatus = "Online" | "Degraded" | "Offline";

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
