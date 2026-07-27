import type { IdentityLevel, Merchant, MerchantAvailability, MerchantTier, ReputationDimension } from "@/lib/types";
import { pseudoAddress, shortAddress } from "@/lib/format";

/**
 * Simulated global merchant pool. Deterministic demo data — replaced by live
 * order-book data once the app is connected to an OpenFiat node.
 */

type MerchantBase = Omit<
  Merchant,
  "wallet" | "stake" | "identityLevel" | "merchantAge" | "volume30d" | "avgTicket" | "settlementSpeed"
>;

function m(
  id: string,
  name: string,
  countryCode: string,
  tier: MerchantTier,
  orders: number,
  completionRate: number,
  availability: MerchantAvailability,
  avgResponseTime: string,
): MerchantBase {
  return { id, name, countryCode, tier, orders, completionRate, availability, avgResponseTime };
}

/** International merchant (borderless OTC desk). */
function im(
  id: string,
  name: string,
  countryCode: string,
  tier: MerchantTier,
  orders: number,
  completionRate: number,
  availability: MerchantAvailability,
  avgResponseTime: string,
): MerchantBase {
  return { ...m(id, name, countryCode, tier, orders, completionRate, availability, avgResponseTime), international: true };
}

const BASE_MERCHANTS: MerchantBase[] = [
  // Kenya (curated)
  m("m-kenyastar", "KenyaStarTrades", "KE", "Elite", 4821, 99.2, "Online", "<1 min"),
  m("m-nairobihub", "NairobiLiquidityHub", "KE", "Professional", 2310, 98.7, "Online", "2 min"),
  m("m-mombasapay", "MombasaPay", "KE", "Verified", 1204, 97.9, "Busy", "5 min"),
  m("m-swiftkes", "SwiftKES", "KE", "Professional", 3050, 99.0, "Online", "1 min"),
  m("m-westlands", "WestlandsOTC", "KE", "Elite", 5030, 99.3, "Online", "<1 min"),
  m("m-nakuru", "NakuruPayPoint", "KE", "Explorer", 132, 94.8, "Vacation", "2 h"),
  m("m-thika", "ThikaRoadTraders", "KE", "Verified", 760, 97.6, "Online", "7 min"),
  // Rest of Africa
  m("m-lagosnaira", "LagosNairaPro", "NG", "Elite", 6112, 99.5, "Online", "<1 min"),
  m("m-abujadelta", "AbujaDeltaFX", "NG", "Professional", 2140, 98.5, "Online", "3 min"),
  m("m-accracedi", "AccraCediExchange", "GH", "Verified", 890, 96.8, "Away", "12 min"),
  m("m-capetown", "CapeTownStableCo", "ZA", "Professional", 1890, 98.3, "Away", "10 min"),
  m("m-joburgrand", "JoburgRandDesk", "ZA", "Elite", 3410, 99.1, "Online", "2 min"),
  m("m-kampalapearl", "KampalaPearlPay", "UG", "Verified", 640, 97.4, "Online", "9 min"),
  m("m-darpay", "DarEsSalaamPay", "TZ", "Verified", 715, 97.1, "Online", "8 min"),
  m("m-kilimanjaro", "KilimanjaroCrypto", "TZ", "Explorer", 210, 95.4, "Offline", "1 h"),
  m("m-caironile", "CairoNileExchange", "EG", "Professional", 1620, 98.0, "Online", "6 min"),
  m("m-casablanca", "CasablancaAtlasFX", "MA", "Verified", 480, 96.9, "Busy", "15 min"),
  m("m-dakarwave", "DakarWavePay", "SN", "Verified", 530, 97.3, "Online", "11 min"),
  m("m-douala", "DoualaCamPay", "CM", "Explorer", 260, 95.8, "Away", "20 min"),
  m("m-addisbirr", "AddisAbabaBirr", "ET", "Explorer", 175, 94.9, "Busy", "25 min"),
  // Middle East
  m("m-dubaigulf", "DubaiGulfCrypto", "AE", "Elite", 4480, 99.4, "Online", "<1 min"),
  m("m-riyadh", "RiyadhGulfDesk", "SA", "Professional", 1980, 98.6, "Online", "4 min"),
  m("m-ramallah", "RamallahExchange", "PS", "Verified", 410, 97.0, "Online", "14 min"),
  m("m-tehranrial", "TehranRialDesk", "IR", "Verified", 690, 96.5, "Away", "18 min"),
  m("m-kabul", "KabulExchange", "AF", "Explorer", 95, 94.2, "Offline", "3 h"),
  // Europe
  m("m-londondesk", "LondonStableDesk", "GB", "Institutional", 12450, 99.9, "Online", "<1 min"),
  m("m-eurovault", "EuroVaultTrading", "DE", "Professional", 2980, 98.4, "Online", "3 min"),
  m("m-berlinstable", "BerlinStableEU", "DE", "Verified", 1120, 97.8, "Online", "5 min"),
  m("m-moscowvolga", "MoscowVolgaTrade", "RU", "Professional", 2340, 98.2, "Busy", "7 min"),
  m("m-kyivdnipro", "KyivDniproPay", "UA", "Verified", 870, 97.5, "Online", "10 min"),
  m("m-pristina", "PristinaBalkanPay", "XK", "Explorer", 145, 95.1, "Online", "22 min"),
  m("m-istanbulfx", "IstanbulFX", "TR", "Professional", 2760, 98.8, "Online", "2 min"),
  // Asia
  m("m-mumbaiupi", "MumbaiUPIExchange", "IN", "Verified", 1755, 98.1, "Online", "4 min"),
  m("m-delhirupee", "DelhiRupeeDesk", "IN", "Professional", 2230, 98.6, "Online", "3 min"),
  m("m-karachi", "KarachiTraders", "PK", "Verified", 980, 97.7, "Online", "6 min"),
  m("m-dhaka", "DhakaExchange", "BD", "Verified", 1040, 97.9, "Online", "5 min"),
  m("m-manila", "ManilaGCashPro", "PH", "Professional", 1890, 98.5, "Online", "3 min"),
  m("m-jakarta", "JakartaRupiahDesk", "ID", "Verified", 1310, 98.0, "Online", "6 min"),
  m("m-bangkoksiam", "BangkokSiamTrade", "TH", "Professional", 1670, 98.4, "Online", "4 min"),
  m("m-hanoi", "HanoiDongDesk", "VN", "Verified", 920, 97.6, "Busy", "9 min"),
  m("m-kualalumpur", "KualaLumpurRinggit", "MY", "Verified", 840, 97.8, "Online", "7 min"),
  m("m-tokyo", "TokyoSakuraFX", "JP", "Professional", 2050, 99.0, "Online", "2 min"),
  m("m-shenzhen", "ShenzhenPearlRiver", "CN", "Professional", 3120, 98.9, "Busy", "3 min"),
  m("m-hongkong", "HongKongHarbourDesk", "HK", "Elite", 4210, 99.3, "Online", "1 min"),
  m("m-singapore", "SingaporeLionCity", "SG", "Elite", 3980, 99.4, "Online", "1 min"),
  m("m-yangon", "YangonGoldenPay", "MM", "Explorer", 180, 95.0, "Offline", "2 h"),
  // Americas
  m("m-newyork", "NewYorkStable", "US", "Institutional", 9870, 99.8, "Online", "<1 min"),
  m("m-toronto", "TorontoMapleCrypto", "CA", "Professional", 1540, 98.7, "Online", "4 min"),
  m("m-mexicocity", "MexicoCitySPEI", "MX", "Professional", 1780, 98.3, "Online", "5 min"),
  m("m-saopix", "SaoPauloPIX", "BR", "Professional", 2140, 98.9, "Busy", "6 min"),
  m("m-rio", "RioRealExchange", "BR", "Verified", 990, 97.8, "Online", "8 min"),
  m("m-buenosaires", "BuenosAiresCripto", "AR", "Professional", 2460, 98.6, "Online", "3 min"),
  m("m-bogota", "BogotaAndesPay", "CO", "Verified", 1130, 97.9, "Online", "7 min"),
  m("m-santiago", "SantiagoAndesCL", "CL", "Verified", 720, 97.6, "Away", "12 min"),
  m("m-lima", "LimaAndesPay", "PE", "Verified", 560, 97.2, "Online", "10 min"),
  m("m-caracas", "CaracasBolivarDesk", "VE", "Explorer", 340, 96.1, "Busy", "16 min"),
  // Oceania
  m("m-sydney", "SydneyHarbourFX", "AU", "Professional", 1690, 98.5, "Online", "4 min"),
  // Diaspora / remittance specialists
  m("m-diaspora", "DiasporaRemit", "US", "Verified", 640, 97.2, "Online", "8 min"),
  // International OTC desks — borderless merchants (any currency, any payment method)
  im("m-globalotc", "GlobalOTCDesk", "GB", "Institutional", 15230, 99.8, "Online", "<1 min"),
  im("m-worldliq", "WorldLiquidity", "SG", "Institutional", 11840, 99.7, "Online", "<1 min"),
  im("m-atlasp2p", "AtlasP2P", "AE", "Elite", 8420, 99.5, "Online", "1 min"),
  im("m-meridian", "MeridianExchange", "HK", "Elite", 7910, 99.4, "Online", "1 min"),
  im("m-horizon", "HorizonStableDesk", "US", "Elite", 6850, 99.3, "Online", "2 min"),
  im("m-zenith", "ZenithOTC", "CH", "Professional", 4320, 99.1, "Online", "2 min"),
  im("m-polaris", "PolarisLiquidity", "DE", "Professional", 3980, 99.0, "Busy", "4 min"),
  im("m-orbit", "OrbitFiatGateway", "GB", "Professional", 3540, 98.9, "Online", "3 min"),
  im("m-summit", "SummitGlobalPay", "AE", "Professional", 2870, 98.8, "Online", "5 min"),
];

// ── Deterministic profile enrichment ──────────────────────────────────────────

const TIER_STAKE: Record<MerchantTier, number> = {
  Explorer: 5000,
  Verified: 10000,
  Professional: 20000,
  Elite: 35000,
  Institutional: 50000,
};

const TIER_IDENTITY: Record<MerchantTier, IdentityLevel> = {
  Explorer: "L1",
  Verified: "L2",
  Professional: "L2",
  Elite: "L3",
  Institutional: "L3",
};

/** Fill profile fields (wallet, stake, identity, age, stats) deterministically. */
function enrich(b: MerchantBase, i: number): Merchant {
  const months = 3 + ((i * 7) % 40);
  const avgTicket = 100 + ((i * 37) % 1900);
  return {
    ...b,
    wallet: pseudoAddress(`openfiat-merchant-${b.id}`),
    stake: TIER_STAKE[b.tier] + (i % 5) * 1000,
    identityLevel: TIER_IDENTITY[b.tier],
    merchantAge: months >= 24 ? `${Math.floor(months / 12)}y ${months % 12}m` : `${months} months`,
    volume30d: Math.round((b.orders * avgTicket) / 12),
    avgTicket,
    settlementSpeed: `${2 + (i % 11)} min median`,
  };
}

export const MERCHANTS: Merchant[] = BASE_MERCHANTS.map((b, i) => enrich(b, i));

/** The simulated current user: both a buyer and a merchant (L2 verified). */
export const CURRENT_USER: Merchant = {
  ...enrich(
    {
      id: "m-you",
      name: "OpenWalletKe",
      countryCode: "KE",
      tier: "Professional",
      orders: 1180,
      completionRate: 98.6,
      availability: "Online",
      avgResponseTime: "2 min",
    },
    999,
  ),
  // Fixed well-known address so the truncated form is always "7xKm…9fQ2".
  wallet: "7xKmVd8hN3pQrS4tUvWxYz2AbCdEfGhJkLmNoPqR9fQ2",
};

/** Truncated display of the current user's wallet ("7xKm…9fQ2"). */
export const CURRENT_USER_WALLET = shortAddress(CURRENT_USER.wallet);

/** Ad slots a merchant's bond entitles them to (1 slot per 5,000 OPEN staked). */
export function adCapacityFor(merchant: Merchant): number {
  return Math.max(1, Math.floor(merchant.stake / 5000));
}

const AVAILABILITY_SCORE: Record<MerchantAvailability, number> = {
  Online: 90,
  Busy: 70,
  Away: 50,
  Offline: 10,
  Vacation: 30,
};

/** Deterministic 8-dimension reputation profile derived from merchant stats. */
export function reputationFor(merchant: Merchant): ReputationDimension[] {
  const minutes = parseInt(merchant.settlementSpeed, 10);
  const disputeRate = Math.max(0.1, (100 - merchant.completionRate) / 2);
  return [
    { label: "Settlement Speed", score: Math.max(20, 100 - minutes * 6), display: merchant.settlementSpeed },
    { label: "Trade Success Rate", score: Math.round(merchant.completionRate), display: `${merchant.completionRate}%` },
    { label: "Dispute Rate", score: Math.max(20, Math.round(100 - disputeRate * 10)), display: `${disputeRate.toFixed(1)}% (lower is better)` },
    { label: "Trade Volume", score: Math.min(100, Math.round(merchant.volume30d / 4000)), display: `${merchant.volume30d.toLocaleString("en-US")} USDT / 30d` },
    { label: "Average Ticket Size", score: Math.min(100, Math.round(merchant.avgTicket / 20)), display: `${merchant.avgTicket.toLocaleString("en-US")} USDT` },
    { label: "Merchant Age", score: Math.min(100, Math.round(parseInt(merchant.merchantAge, 10) * 4)), display: merchant.merchantAge },
    { label: "Availability", score: AVAILABILITY_SCORE[merchant.availability], display: `${merchant.availability.toLowerCase()}, responds ${merchant.avgResponseTime}` },
    { label: "Payment Accuracy", score: Math.min(100, Math.round(merchant.completionRate + 1)), display: `${Math.min(99.9, merchant.completionRate + 0.4).toFixed(1)}%` },
  ];
}

export function merchantById(id: string): Merchant {
  if (id === CURRENT_USER.id) return CURRENT_USER;
  const found = MERCHANTS.find((m) => m.id === id);
  if (!found) throw new Error(`Unknown merchant: ${id}`);
  return found;
}

export function merchantByName(name: string): Merchant | undefined {
  return MERCHANTS.find((m) => m.name === name);
}
