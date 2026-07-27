import type { PaymentField, Trade } from "@/lib/types";
import { pseudoSignature } from "@/lib/format";

/**
 * Simulated trades (reservations + settlement state) for the current user,
 * covering every lifecycle state. Session logs render as trade-room chat;
 * entries with kind "event" are signed protocol events.
 */
const TRADE_INPUTS: Array<Omit<Trade, "paymentFields" | "txSig" | "escrowSig">> = [
  {
    id: "TRD-7001",
    adId: "AD-1001",
    counterpartyId: "m-kenyastar",
    direction: "Buy",
    asset: "USDT",
    cryptoAmount: 250,
    fiatAmount: 33112.5,
    price: 132.45,
    fiatCurrency: "KES",
    paymentMethod: "M-Pesa Kenya (Safaricom)",
    paymentInstructions: "Send KES 33,112.50 to M-Pesa 0712 345 678 (KenyaStar Trades Ltd). Use your trade ID TRD-7001 as the reference.",
    status: "Awaiting Payment",
    createdAt: "2026-07-27T13:58:00Z",
    updatedAt: "2 min ago",
    events: [
      { time: "13:58", kind: "event", actor: "Protocol", text: "ReservationRequested — reservation created on AD-1001 (first-come-first-served, 20 min timeout)." },
      { time: "13:58", kind: "event", actor: "Protocol", text: "ReservationValidated — merchant availability and limits verified." },
      { time: "13:59", kind: "event", actor: "Protocol", text: "ReservationAccepted — KenyaStarTrades accepted the reservation." },
      { time: "13:59", kind: "event", actor: "Protocol", text: "EscrowLocked — 250.00 USDT locked in escrow PDA on Solana." },
      { time: "13:59", kind: "message", actor: "KenyaStarTrades", text: "Hi! Please send to M-Pesa 0712 345 678 and click “I Paid”. I release in under a minute usually." },
    ],
  },
  {
    id: "TRD-7002",
    adId: "AD-1003",
    counterpartyId: "m-westlands",
    direction: "Buy",
    asset: "USDT",
    cryptoAmount: 1000,
    fiatAmount: 132900,
    price: 132.9,
    fiatCurrency: "KES",
    paymentMethod: "Equity Bank",
    paymentInstructions: "Bank transfer to Equity Bank, acc. 0550 1987 2233, Westlands OTC Ltd. Reference TRD-7002.",
    status: "Payment Submitted",
    createdAt: "2026-07-27T13:20:00Z",
    updatedAt: "18 min ago",
    events: [
      { time: "13:20", kind: "event", actor: "Protocol", text: "ReservationAccepted — WestlandsOTC accepted the reservation." },
      { time: "13:21", kind: "event", actor: "Protocol", text: "EscrowLocked — 1,000.00 USDT locked in escrow PDA." },
      { time: "13:34", kind: "event", actor: "You", text: "PaymentSubmitted — signed “I Paid” action recorded for KES 132,900.00." },
      { time: "13:34", kind: "message", actor: "You", text: "Sent via Equity, ref TRD-7002. Receipt attached." },
    ],
  },
  {
    id: "TRD-7003",
    adId: "AD-1016",
    counterpartyId: "m-westlands",
    direction: "Sell",
    asset: "USDT",
    cryptoAmount: 500,
    fiatAmount: 65240,
    price: 130.48,
    fiatCurrency: "KES",
    paymentMethod: "M-Pesa Kenya (Safaricom)",
    paymentInstructions: "Merchant sends KES 65,240.00 to your M-Pesa 0722 901 234.",
    status: "Merchant Reviewing",
    createdAt: "2026-07-27T12:45:00Z",
    updatedAt: "41 min ago",
    events: [
      { time: "12:45", kind: "event", actor: "Protocol", text: "ReservationAccepted — WestlandsOTC accepted your sell reservation." },
      { time: "12:46", kind: "event", actor: "Protocol", text: "EscrowLocked — 500.00 USDT locked from your liquidity vault." },
      { time: "12:50", kind: "event", actor: "WestlandsOTC", text: "PaymentSubmitted — merchant marked fiat as sent." },
      { time: "12:52", kind: "message", actor: "WestlandsOTC", text: "Sent from Equity to your M-Pesa, should land any second. Please confirm." },
    ],
  },
  {
    id: "TRD-7004",
    adId: "AD-1004",
    counterpartyId: "m-nairobihub",
    direction: "Buy",
    asset: "USDT",
    cryptoAmount: 120,
    fiatAmount: 15840,
    price: 132,
    fiatCurrency: "KES",
    paymentMethod: "M-Pesa Kenya (Safaricom)",
    paymentInstructions: "Send KES 15,840.00 to M-Pesa 0733 456 789 (Nairobi Liquidity Hub). Reference TRD-7004.",
    status: "Escrow Locked",
    createdAt: "2026-07-27T13:52:00Z",
    updatedAt: "8 min ago",
    events: [
      { time: "13:52", kind: "event", actor: "Protocol", text: "ReservationAccepted — NairobiLiquidityHub accepted the reservation." },
      { time: "13:52", kind: "event", actor: "Protocol", text: "EscrowLocked — 120.00 USDT locked in escrow PDA." },
    ],
  },
  {
    id: "TRD-7005",
    adId: "AD-1015",
    counterpartyId: "m-kenyastar",
    direction: "Sell",
    asset: "USDT",
    cryptoAmount: 800,
    fiatAmount: 103840,
    price: 129.8,
    fiatCurrency: "KES",
    paymentMethod: "Equity Bank",
    paymentInstructions: "Merchant sends KES 103,840.00 to your Equity Bank account.",
    status: "Approved",
    createdAt: "2026-07-27T11:30:00Z",
    updatedAt: "1 h ago",
    events: [
      { time: "11:30", kind: "event", actor: "Protocol", text: "ReservationAccepted — KenyaStarTrades accepted your sell reservation." },
      { time: "11:31", kind: "event", actor: "Protocol", text: "EscrowLocked — 800.00 USDT locked from your liquidity vault." },
      { time: "11:44", kind: "event", actor: "KenyaStarTrades", text: "PaymentSubmitted — merchant marked fiat as sent." },
      { time: "11:47", kind: "event", actor: "You", text: "PaymentApproved — you confirmed fiat receipt off-chain." },
    ],
  },
  {
    id: "TRD-7006",
    adId: "AD-1009",
    counterpartyId: "m-westlands",
    direction: "Buy",
    asset: "SOL",
    cryptoAmount: 4,
    fiatAmount: 75760,
    price: 18940,
    fiatCurrency: "KES",
    paymentMethod: "KCB",
    paymentInstructions: "Bank transfer to KCB, acc. 1280 445 990, Westlands OTC Ltd. Reference TRD-7006.",
    status: "Escrow Released",
    createdAt: "2026-07-27T10:15:00Z",
    updatedAt: "3 h ago",
    events: [
      { time: "10:15", kind: "event", actor: "Protocol", text: "ReservationAccepted — WestlandsOTC accepted the reservation." },
      { time: "10:16", kind: "event", actor: "Protocol", text: "EscrowLocked — 4.00 SOL locked in escrow PDA." },
      { time: "10:28", kind: "event", actor: "You", text: "PaymentSubmitted — signed “I Paid” action recorded." },
      { time: "10:33", kind: "event", actor: "WestlandsOTC", text: "PaymentApproved — merchant verified fiat receipt off-chain." },
      { time: "10:33", kind: "event", actor: "Protocol", text: "EscrowReleased — 4.00 SOL released to your wallet." },
    ],
  },
  {
    id: "TRD-7007",
    adId: "AD-1002",
    counterpartyId: "m-swiftkes",
    direction: "Buy",
    asset: "USDT",
    cryptoAmount: 340,
    fiatAmount: 44873.2,
    price: 131.98,
    fiatCurrency: "KES",
    paymentMethod: "Mpesa Pochi la Biashara",
    paymentInstructions: "Send KES 44,873.20 to Pochi la Biashara till 556677. Reference TRD-7007.",
    status: "Completed",
    createdAt: "2026-07-26T15:10:00Z",
    updatedAt: "1 day ago",
    events: [
      { time: "15:10", kind: "event", actor: "Protocol", text: "ReservationAccepted — SwiftKES accepted the reservation." },
      { time: "15:11", kind: "event", actor: "Protocol", text: "EscrowLocked — 340.00 USDT locked in escrow PDA." },
      { time: "15:16", kind: "event", actor: "You", text: "PaymentSubmitted — signed “I Paid” action recorded." },
      { time: "15:19", kind: "event", actor: "SwiftKES", text: "PaymentApproved — merchant verified fiat receipt off-chain." },
      { time: "15:19", kind: "event", actor: "Protocol", text: "SettlementCompleted — 340.00 USDT released. Trade complete." },
    ],
  },
  {
    id: "TRD-7008",
    adId: "AD-1021",
    counterpartyId: "m-lagosnaira",
    direction: "Sell",
    asset: "USDT",
    cryptoAmount: 600,
    fiatAmount: 922500,
    price: 1537.5,
    fiatCurrency: "NGN",
    paymentMethod: "Bank Transfer",
    paymentInstructions: "Merchant sends NGN 922,500.00 to your Kuda account 2011 883 445.",
    status: "Completed",
    createdAt: "2026-07-25T09:05:00Z",
    updatedAt: "2 days ago",
    events: [
      { time: "09:05", kind: "event", actor: "Protocol", text: "ReservationAccepted — LagosNairaPro accepted your sell reservation." },
      { time: "09:06", kind: "event", actor: "Protocol", text: "EscrowLocked — 600.00 USDT locked from your liquidity vault." },
      { time: "09:20", kind: "event", actor: "LagosNairaPro", text: "PaymentSubmitted — merchant marked fiat as sent." },
      { time: "09:26", kind: "event", actor: "You", text: "PaymentApproved — you confirmed fiat receipt off-chain." },
      { time: "09:26", kind: "event", actor: "Protocol", text: "SettlementCompleted — 600.00 USDT released. Trade complete." },
    ],
  },
  {
    id: "TRD-7009",
    adId: "AD-1012",
    counterpartyId: "m-eurovault",
    direction: "Buy",
    asset: "USDC",
    cryptoAmount: 1200,
    fiatAmount: 1116,
    price: 0.93,
    fiatCurrency: "EUR",
    paymentMethod: "SEPA",
    paymentInstructions: "SEPA transfer to DE44 5001 0517 5407 3249 31, EuroVault Trading UG. Reference TRD-7009.",
    status: "Completed",
    createdAt: "2026-07-24T14:40:00Z",
    updatedAt: "3 days ago",
    events: [
      { time: "14:40", kind: "event", actor: "Protocol", text: "ReservationAccepted — EuroVaultTrading accepted the reservation." },
      { time: "14:41", kind: "event", actor: "Protocol", text: "EscrowLocked — 1,200.00 USDC locked in escrow PDA." },
      { time: "15:02", kind: "event", actor: "You", text: "PaymentSubmitted — signed “I Paid” action recorded." },
      { time: "16:20", kind: "event", actor: "EuroVaultTrading", text: "PaymentApproved — merchant verified fiat receipt off-chain." },
      { time: "16:20", kind: "event", actor: "Protocol", text: "SettlementCompleted — 1,200.00 USDC released. Trade complete." },
    ],
  },
  {
    id: "TRD-7010",
    adId: "AD-1005",
    counterpartyId: "m-mombasapay",
    direction: "Buy",
    asset: "USDT",
    cryptoAmount: 75,
    fiatAmount: 9982.5,
    price: 133.1,
    fiatCurrency: "KES",
    paymentMethod: "M-Pesa Kenya (Safaricom)",
    paymentInstructions: "Send KES 9,982.50 to M-Pesa 0740 111 222. Reference TRD-7010.",
    status: "Cancelled",
    createdAt: "2026-07-26T08:12:00Z",
    updatedAt: "1 day ago",
    events: [
      { time: "08:12", kind: "event", actor: "Protocol", text: "ReservationRequested — reservation created on AD-1005." },
      { time: "08:14", kind: "event", actor: "You", text: "ReservationCancelled — you cancelled before escrow lock." },
    ],
  },
  {
    id: "TRD-7011",
    adId: "AD-1017",
    counterpartyId: "m-nairobihub",
    direction: "Sell",
    asset: "USDT",
    cryptoAmount: 200,
    fiatAmount: 25870,
    price: 129.35,
    fiatCurrency: "KES",
    paymentMethod: "M-Pesa Kenya (Safaricom)",
    paymentInstructions: "Merchant sends KES 25,870.00 to your M-Pesa 0722 901 234.",
    status: "Cancelled",
    createdAt: "2026-07-23T19:30:00Z",
    updatedAt: "4 days ago",
    events: [
      { time: "19:30", kind: "event", actor: "Protocol", text: "ReservationRequested — reservation created on AD-1017." },
      { time: "19:50", kind: "event", actor: "Protocol", text: "ReservationExpired — 20 min reservation timeout reached; escrow never locked." },
    ],
  },
  {
    id: "TRD-7012",
    adId: "AD-1002",
    counterpartyId: "m-swiftkes",
    direction: "Buy",
    asset: "USDT",
    cryptoAmount: 450,
    fiatAmount: 59391,
    price: 131.98,
    fiatCurrency: "KES",
    paymentMethod: "I&M Bank",
    paymentInstructions: "Bank transfer to I&M Bank, acc. 0030 5521 8876, SwiftKES Ltd. Reference TRD-7012.",
    status: "Disputed",
    createdAt: "2026-07-26T11:00:00Z",
    updatedAt: "5 h ago",
    events: [
      { time: "11:00", kind: "event", actor: "Protocol", text: "ReservationAccepted — SwiftKES accepted the reservation." },
      { time: "11:01", kind: "event", actor: "Protocol", text: "EscrowLocked — 450.00 USDT locked in escrow PDA." },
      { time: "11:12", kind: "event", actor: "You", text: "PaymentSubmitted — signed “I Paid” action recorded." },
      { time: "11:45", kind: "event", actor: "You", text: "DisputeOpened — escrow frozen pending arbitration (DSP-101)." },
    ],
  },
  {
    id: "TRD-7013",
    adId: "AD-1016",
    counterpartyId: "m-westlands",
    direction: "Sell",
    asset: "USDT",
    cryptoAmount: 1500,
    fiatAmount: 195720,
    price: 130.48,
    fiatCurrency: "KES",
    paymentMethod: "Equity Bank",
    paymentInstructions: "Merchant sends KES 195,720.00 to your Equity Bank account.",
    status: "Disputed",
    createdAt: "2026-07-25T16:20:00Z",
    updatedAt: "1 day ago",
    events: [
      { time: "16:20", kind: "event", actor: "Protocol", text: "ReservationAccepted — WestlandsOTC accepted your sell reservation." },
      { time: "16:21", kind: "event", actor: "Protocol", text: "EscrowLocked — 1,500.00 USDT locked from your liquidity vault." },
      { time: "16:40", kind: "event", actor: "WestlandsOTC", text: "PaymentSubmitted — merchant marked fiat as sent." },
      { time: "17:05", kind: "event", actor: "You", text: "DisputeOpened — funds never arrived; escrow frozen (DSP-102)." },
    ],
  },
  {
    id: "TRD-7014",
    adId: "AD-1001",
    counterpartyId: "m-kenyastar",
    direction: "Buy",
    asset: "USDT",
    cryptoAmount: 900,
    fiatAmount: 119205,
    price: 132.45,
    fiatCurrency: "KES",
    paymentMethod: "M-Pesa Kenya (Safaricom)",
    paymentInstructions: "Send KES 119,205.00 to M-Pesa 0712 345 678. Reference TRD-7014.",
    status: "Disputed",
    createdAt: "2026-07-24T10:00:00Z",
    updatedAt: "2 days ago",
    events: [
      { time: "10:00", kind: "event", actor: "Protocol", text: "ReservationAccepted — KenyaStarTrades accepted the reservation." },
      { time: "10:01", kind: "event", actor: "Protocol", text: "EscrowLocked — 900.00 USDT locked in escrow PDA." },
      { time: "10:15", kind: "event", actor: "You", text: "PaymentSubmitted — signed “I Paid” action recorded." },
      { time: "10:44", kind: "event", actor: "KenyaStarTrades", text: "DisputeOpened — merchant claims amount mismatch; escrow frozen (DSP-103)." },
    ],
  },
  {
    id: "TRD-7015",
    adId: "AD-1007",
    counterpartyId: "m-kenyastar",
    direction: "Buy",
    asset: "USDC",
    cryptoAmount: 300,
    fiatAmount: 39510,
    price: 131.7,
    fiatCurrency: "KES",
    paymentMethod: "M-Pesa Kenya (Safaricom)",
    paymentInstructions: "Send KES 39,510.00 to M-Pesa 0712 345 678. Reference TRD-7015.",
    status: "Completed",
    createdAt: "2026-07-20T13:00:00Z",
    updatedAt: "7 days ago",
    events: [
      { time: "13:00", kind: "event", actor: "Protocol", text: "ReservationAccepted — KenyaStarTrades accepted the reservation." },
      { time: "13:01", kind: "event", actor: "Protocol", text: "EscrowLocked — 300.00 USDC locked in escrow PDA." },
      { time: "13:10", kind: "event", actor: "You", text: "PaymentSubmitted — signed “I Paid” action recorded." },
      { time: "13:30", kind: "event", actor: "You", text: "DisputeOpened — merchant unresponsive; escrow frozen (DSP-104)." },
      { time: "14:05", kind: "event", actor: "Arbitrator", text: "DisputeResolved — Buyer Wins; escrow released to buyer." },
    ],
  },
];

// ── Standardized payment detail fields ────────────────────────────────────────

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

type TradeInput = Omit<Trade, "paymentFields" | "txSig" | "escrowSig">;

/**
 * Deterministic, individually-copyable payment details shaped per method:
 * mobile money, local bank, SWIFT/international bank, or fintech handle.
 */
export function buildPaymentFields(trade: TradeInput): PaymentField[] {
  const m = trade.paymentMethod.toLowerCase();
  const h = hashCode(trade.id + trade.paymentMethod);
  const name = trade.counterpartyId
    .replace(/^m-/, "")
    .replace(/(^|[a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  const ref = trade.id;

  if (/m-?pesa|pochi|mobile money|airtel|tigo|vodafone cash|mtn|telebirr|cbe|gcash|maya|easypaisa|jazzcash|bkash|nagad|gopay|ovo|promptpay|momo|yape|plin|mercado pago|pago móvil|kbzpay|stc pay|jawwal|orange money|wave money|wave/.test(m)) {
    return [
      { label: "Recipient name", value: `${name} Ltd` },
      { label: "Provider", value: trade.paymentMethod },
      { label: "Phone number", value: `+254 7${String(10000000 + (h % 89999999)).slice(0, 8)}` },
      { label: "Reference", value: ref },
    ];
  }
  if (/wise|revolut|skrill|paypay|alipay|wechat|zelle|papara|interac|payid|spei|nequi|daviplata|lemon|mach|cash plus|line pay/.test(m)) {
    return [
      { label: "Account name", value: `${name} Ltd` },
      { label: "Email / Handle", value: `${trade.counterpartyId.replace(/^m-/, "")}${h % 97}@example.com` },
      { label: "Reference", value: ref },
    ];
  }
  if (/sepa|wire|swift|ach/.test(m)) {
    return [
      { label: "Account name", value: `${name} Ltd` },
      { label: "IBAN / Account number", value: `DE${String(h).padStart(10, "0")}${String(hashCode(trade.id)).padStart(10, "0")}` },
      { label: "SWIFT / BIC", value: `OFTP${["DEFF", "GB2L", "US33"][h % 3]}${100 + (h % 900)}` },
      { label: "Bank name", value: ["OpenFiat Trust Bank", "Meridian Clearing AG", "Atlas Settlement Bank"][h % 3] },
      { label: "Bank address", value: ["1 Bahnhofstrasse, Frankfurt", "25 Old Broad St, London", "88 Madison Ave, New York"][h % 3] },
      { label: "Reference", value: ref },
    ];
  }
  // Local bank transfer
  return [
    { label: "Account name", value: `${name} Ltd` },
    { label: "Account number", value: String(1000000000 + (h % 8999999999)).slice(0, 10) },
    { label: "Bank name", value: trade.paymentMethod === "Bank Transfer" ? "National Bank" : trade.paymentMethod },
    { label: "Branch", value: ["City Centre", "Westlands", "Industrial Area"][h % 3] },
    { label: "Reference", value: ref },
  ];
}

export const TRADES: Trade[] = TRADE_INPUTS.map((t) => ({
  ...t,
  paymentFields: buildPaymentFields(t),
  txSig: pseudoSignature(`settlement-${t.id}`),
  escrowSig: pseudoSignature(`escrow-${t.id}`),
}));

export function tradeById(id: string): Trade | undefined {
  return TRADES.find((t) => t.id === id);
}