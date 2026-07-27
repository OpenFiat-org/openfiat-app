import type { NetworkNode, NetworkStats, ProtocolEvent } from "@/lib/types";

/**
 * Simulated network view: node inventory and a recent protocol event feed.
 * OpenFiat is event-sourced — every state transition emits a signed event.
 */

/** Registry of protocol event types emitted by the coordination layer. */
export const PROTOCOL_EVENT_TYPES = [
  "AdvertisementCreated",
  "AdvertisementUpdated",
  "ReservationRequested",
  "ReservationValidated",
  "ReservationAccepted",
  "ReservationExpired",
  "EscrowLocked",
  "PaymentSubmitted",
  "PaymentApproved",
  "SettlementCompleted",
  "DisputeOpened",
  "DisputeResolved",
  "VaultBalanceReserved",
  "VaultDeposit",
  "StakeBonded",
  "ProposalCreated",
  "VoteCast",
  "OraclePriceUpdated",
  "IdentityClaimVerified",
  "MerchantAvailabilityChanged",
] as const;

export const NETWORK_STATS: NetworkStats = {
  nodesOnline: 128,
  peers: 3412,
  blockHeight: 312445902,
  epoch: 742,
  protocolVersion: "v0.4.2",
};

export const NETWORK_NODES: NetworkNode[] = [
  { id: "node-ke-full-01", role: "Full Node", region: "Nairobi, KE", version: "0.4.2", status: "Online", latencyMs: 12, peers: 148 },
  { id: "node-ke-gateway-01", role: "Notification Gateway", region: "Nairobi, KE", version: "0.4.2", status: "Online", latencyMs: 15, peers: 96 },
  { id: "node-eu-full-03", role: "Full Node", region: "Frankfurt, DE", version: "0.4.2", status: "Online", latencyMs: 88, peers: 210 },
  { id: "node-bootstrap-01", role: "Bootstrap Node", region: "Frankfurt, DE", version: "0.4.2", status: "Online", latencyMs: 84, peers: 512 },
  { id: "node-bootstrap-02", role: "Bootstrap Node", region: "Singapore, SG", version: "0.4.1", status: "Online", latencyMs: 160, peers: 487 },
  { id: "node-snapshot-01", role: "Snapshot Provider", region: "Virginia, US", version: "0.4.2", status: "Syncing", latencyMs: 142, peers: 64 },
  { id: "node-oracle-02", role: "Oracle Provider", region: "London, UK", version: "0.4.2", status: "Online", latencyMs: 95, peers: 41 },
  { id: "node-risk-01", role: "Risk Intelligence Provider", region: "London, UK", version: "0.4.2", status: "Online", latencyMs: 98, peers: 37 },
  { id: "node-merchant-gw-04", role: "Merchant Gateway", region: "Lagos, NG", version: "0.4.1", status: "Online", latencyMs: 122, peers: 73 },
  { id: "node-api-01", role: "Public API Node", region: "Virginia, US", version: "0.4.2", status: "Offline", latencyMs: 0, peers: 0 },
];

export const PROTOCOL_EVENTS: ProtocolEvent[] = [
  { type: "SettlementCompleted", actor: "SwiftKES", timestamp: "2026-07-27T13:59:00Z", summary: "340.00 USDT released to buyer — TRD-7007 settled" },
  { type: "ReservationAccepted", actor: "KenyaStarTrades", timestamp: "2026-07-27T13:58:00Z", summary: "Reservation TRD-7001 accepted on AD-1001" },
  { type: "VaultBalanceReserved", actor: "OpenWalletKe", timestamp: "2026-07-27T13:59:00Z", summary: "800.00 USDT reserved for TRD-7005" },
  { type: "PaymentSubmitted", actor: "You", timestamp: "2026-07-27T13:34:00Z", summary: "Signed “I Paid” for KES 132,900.00 — TRD-7002" },
  { type: "OraclePriceUpdated", actor: "node-oracle-02", timestamp: "2026-07-27T13:30:00Z", summary: "USDT/KES mid 131.40 (±0.02 across 3 providers)" },
  { type: "AdvertisementCreated", actor: "WestlandsOTC", timestamp: "2026-07-27T13:21:00Z", summary: "Sell 240.5 SOL for KES (floating +1.5%) — AD-1009" },
  { type: "VoteCast", actor: "7xKm…9fQ2", timestamp: "2026-07-27T13:05:00Z", summary: "25,000 OPEN voted For OFP-021" },
  { type: "DisputeOpened", actor: "You", timestamp: "2026-07-26T11:45:00Z", summary: "DSP-101 opened on TRD-7012 — escrow frozen" },
  { type: "EscrowLocked", actor: "Protocol", timestamp: "2026-07-27T13:52:00Z", summary: "120.00 USDT locked in escrow PDA — TRD-7004" },
  { type: "ReservationExpired", actor: "Protocol", timestamp: "2026-07-27T12:40:00Z", summary: "Reservation TRD-7018 expired after 20 min timeout" },
  { type: "MerchantAvailabilityChanged", actor: "MombasaPay", timestamp: "2026-07-27T12:15:00Z", summary: "Availability set to Busy" },
  { type: "IdentityClaimVerified", actor: "ThikaRoadTraders", timestamp: "2026-07-27T11:48:00Z", summary: "L1 Verified Contact claim approved" },
  { type: "StakeBonded", actor: "OpenWalletKe", timestamp: "2026-07-27T10:20:00Z", summary: "3,000 OPEN delegated to node-oracle-02" },
  { type: "ProposalCreated", actor: "EuroVaultTrading", timestamp: "2026-07-25T09:00:00Z", summary: "OFP-021 submitted for OPEN-weighted voting" },
  { type: "VaultDeposit", actor: "OpenWalletKe", timestamp: "2026-07-27T08:10:00Z", summary: "5,000.00 USDT deposited to liquidity vault" },
];
