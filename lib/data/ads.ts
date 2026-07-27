import type { Advertisement, PricingModel, StablecoinAsset } from "@/lib/types";
import { MERCHANTS } from "@/lib/data/merchants";

/**
 * Simulated advertisements. The curated Kenyan book is hardcoded; the global
 * book is generated deterministically at module load with a fixed-seed PRNG
 * (mulberry32 — never Math.random), using a static FX-vs-USD table for
 * realistic local prices. Floating prices derive from a static oracle mid
 * (± premium) so everything stays deterministic at render time.
 */

// ── Oracle mids ──────────────────────────────────────────────────────────────

/** Static oracle mid prices per asset/fiat pair (simulated Oracle Provider feed). */
export const ORACLE_MID: Partial<Record<string, number>> = {
  "USDT/KES": 131.4,
  "USDC/KES": 131.1,
  "USD1/KES": 131.2,
  "SOL/KES": 18940,
  "USDT/NGN": 1545,
  "USDC/NGN": 1542,
  "USDT/USD": 1.0,
  "USDC/USD": 1.0,
  "USD1/USD": 1.0,
  "SOL/USD": 144.2,
  "USDT/EUR": 0.92,
  "USDC/EUR": 0.92,
  "USDT/GBP": 0.79,
  "USDT/INR": 86.4,
  "USDT/BRL": 5.62,
};

// ── Curated payment methods ───────────────────────────────────────────────────

export const MPESA = "M-Pesa Kenya (Safaricom)";
export const POCHI = "Mpesa Pochi la Biashara";
export const IM_BANK = "I&M Bank";
export const EQUITY = "Equity Bank";
export const KCB = "KCB";
export const REVOLUT = "Revolut";
export const SKRILL = "Skrill";
export const WISE = "Wise";
export const UPI = "UPI";
export const SEPA = "SEPA";
export const PIX = "PIX";
export const BANK_TRANSFER = "Bank Transfer";

export const PAYMENT_METHODS: string[] = [
  MPESA, POCHI, IM_BANK, EQUITY, KCB,
  REVOLUT, SKRILL, WISE, UPI, SEPA, PIX, BANK_TRANSFER,
];

// ── Curated Kenyan book (+ a few majors) ──────────────────────────────────────

function fixed(price: number): PricingModel {
  return { type: "Fixed", price };
}

function floating(premiumPct: number): PricingModel {
  return { type: "Floating", premiumPct };
}

export const ADS: Advertisement[] = [
  // --- Merchant Sell ads (shown under the taker's "Buy" tab) ---
  { id: "AD-1001", merchantId: "m-kenyastar", asset: "USDT", direction: "Sell", fiatCurrency: "KES", pricing: fixed(132.45), minTrade: 5000, maxTrade: 500000, availableLiquidity: 25430.5, paymentMethods: [MPESA, EQUITY], status: "Online", updatedAt: "2026-07-27T13:58:00Z" },
  { id: "AD-1002", merchantId: "m-swiftkes", asset: "USDT", direction: "Sell", fiatCurrency: "KES", pricing: floating(0.8), minTrade: 2000, maxTrade: 250000, availableLiquidity: 12000, paymentMethods: [MPESA, POCHI, IM_BANK], status: "Online", updatedAt: "2026-07-27T13:55:00Z" },
  { id: "AD-1003", merchantId: "m-westlands", asset: "USDT", direction: "Sell", fiatCurrency: "KES", pricing: fixed(132.9), minTrade: 10000, maxTrade: 2000000, availableLiquidity: 85000, paymentMethods: [EQUITY, KCB, IM_BANK], status: "Online", updatedAt: "2026-07-27T13:51:00Z" },
  { id: "AD-1004", merchantId: "m-nairobihub", asset: "USDT", direction: "Sell", fiatCurrency: "KES", pricing: floating(1.1), minTrade: 1000, maxTrade: 100000, availableLiquidity: 4200.75, paymentMethods: [MPESA], status: "Online", updatedAt: "2026-07-27T13:47:00Z" },
  { id: "AD-1005", merchantId: "m-mombasapay", asset: "USDT", direction: "Sell", fiatCurrency: "KES", pricing: fixed(133.1), minTrade: 500, maxTrade: 60000, availableLiquidity: 1850.2, paymentMethods: [MPESA, POCHI], status: "Online", updatedAt: "2026-07-27T13:40:00Z" },
  { id: "AD-1006", merchantId: "m-thika", asset: "USDC", direction: "Sell", fiatCurrency: "KES", pricing: fixed(131.8), minTrade: 3000, maxTrade: 150000, availableLiquidity: 9600, paymentMethods: [MPESA, KCB], status: "Online", updatedAt: "2026-07-27T13:32:00Z" },
  { id: "AD-1007", merchantId: "m-kenyastar", asset: "USDC", direction: "Sell", fiatCurrency: "KES", pricing: floating(0.6), minTrade: 5000, maxTrade: 400000, availableLiquidity: 31200, paymentMethods: [MPESA, EQUITY, IM_BANK], status: "Online", updatedAt: "2026-07-27T13:29:00Z" },
  { id: "AD-1008", merchantId: "m-nairobihub", asset: "USD1", direction: "Sell", fiatCurrency: "KES", pricing: fixed(131.95), minTrade: 2000, maxTrade: 80000, availableLiquidity: 5400, paymentMethods: [MPESA], status: "Paused", updatedAt: "2026-07-26T18:12:00Z" },
  { id: "AD-1009", merchantId: "m-westlands", asset: "SOL", direction: "Sell", fiatCurrency: "KES", pricing: floating(1.5), minTrade: 20000, maxTrade: 900000, availableLiquidity: 240.5, paymentMethods: [EQUITY, KCB], status: "Online", updatedAt: "2026-07-27T13:21:00Z" },
  { id: "AD-1010", merchantId: "m-lagosnaira", asset: "USDT", direction: "Sell", fiatCurrency: "NGN", pricing: fixed(1552), minTrade: 50000, maxTrade: 8000000, availableLiquidity: 62000, paymentMethods: [BANK_TRANSFER], status: "Online", updatedAt: "2026-07-27T13:18:00Z" },
  { id: "AD-1011", merchantId: "m-londondesk", asset: "USDT", direction: "Sell", fiatCurrency: "USD", pricing: floating(0.4), minTrade: 500, maxTrade: 250000, availableLiquidity: 480000, paymentMethods: [WISE, REVOLUT, SKRILL], status: "Online", updatedAt: "2026-07-27T13:15:00Z" },
  { id: "AD-1012", merchantId: "m-eurovault", asset: "USDC", direction: "Sell", fiatCurrency: "EUR", pricing: fixed(0.93), minTrade: 100, maxTrade: 50000, availableLiquidity: 76000, paymentMethods: [SEPA, REVOLUT], status: "Online", updatedAt: "2026-07-27T13:11:00Z" },
  { id: "AD-1013", merchantId: "m-mumbaiupi", asset: "USDT", direction: "Sell", fiatCurrency: "INR", pricing: floating(0.9), minTrade: 5000, maxTrade: 500000, availableLiquidity: 22500, paymentMethods: [UPI], status: "Online", updatedAt: "2026-07-27T13:05:00Z" },
  { id: "AD-1014", merchantId: "m-saopix", asset: "USDT", direction: "Sell", fiatCurrency: "BRL", pricing: fixed(5.71), minTrade: 200, maxTrade: 60000, availableLiquidity: 18300, paymentMethods: [PIX], status: "Online", updatedAt: "2026-07-27T12:58:00Z" },

  // --- Merchant Buy ads (shown under the taker's "Sell" tab) ---
  { id: "AD-1015", merchantId: "m-kenyastar", asset: "USDT", direction: "Buy", fiatCurrency: "KES", pricing: fixed(129.8), minTrade: 5000, maxTrade: 600000, availableLiquidity: 40000, paymentMethods: [MPESA, EQUITY], status: "Online", updatedAt: "2026-07-27T13:56:00Z" },
  { id: "AD-1016", merchantId: "m-westlands", asset: "USDT", direction: "Buy", fiatCurrency: "KES", pricing: floating(-0.7), minTrade: 10000, maxTrade: 1500000, availableLiquidity: 90000, paymentMethods: [EQUITY, KCB, IM_BANK], status: "Online", updatedAt: "2026-07-27T13:49:00Z" },
  { id: "AD-1017", merchantId: "m-nairobihub", asset: "USDT", direction: "Buy", fiatCurrency: "KES", pricing: fixed(129.35), minTrade: 1000, maxTrade: 120000, availableLiquidity: 8800, paymentMethods: [MPESA, POCHI], status: "Online", updatedAt: "2026-07-27T13:43:00Z" },
  { id: "AD-1018", merchantId: "m-swiftkes", asset: "USDC", direction: "Buy", fiatCurrency: "KES", pricing: floating(-0.5), minTrade: 2000, maxTrade: 200000, availableLiquidity: 15000, paymentMethods: [MPESA, IM_BANK], status: "Online", updatedAt: "2026-07-27T13:36:00Z" },
  { id: "AD-1019", merchantId: "m-thika", asset: "USD1", direction: "Buy", fiatCurrency: "KES", pricing: fixed(129.1), minTrade: 1500, maxTrade: 50000, availableLiquidity: 3200, paymentMethods: [MPESA], status: "Online", updatedAt: "2026-07-27T13:27:00Z" },
  { id: "AD-1020", merchantId: "m-kilimanjaro", asset: "SOL", direction: "Buy", fiatCurrency: "KES", pricing: fixed(18620), minTrade: 10000, maxTrade: 300000, availableLiquidity: 95, paymentMethods: [MPESA], status: "Paused", updatedAt: "2026-07-25T09:44:00Z" },
  { id: "AD-1021", merchantId: "m-lagosnaira", asset: "USDT", direction: "Buy", fiatCurrency: "NGN", pricing: floating(-0.6), minTrade: 100000, maxTrade: 10000000, availableLiquidity: 75000, paymentMethods: [BANK_TRANSFER], status: "Online", updatedAt: "2026-07-27T13:22:00Z" },
  { id: "AD-1022", merchantId: "m-londondesk", asset: "USDC", direction: "Buy", fiatCurrency: "USD", pricing: fixed(0.998), minTrade: 1000, maxTrade: 500000, availableLiquidity: 950000, paymentMethods: [WISE, BANK_TRANSFER], status: "Online", updatedAt: "2026-07-27T13:12:00Z" },
  { id: "AD-1023", merchantId: "m-eurovault", asset: "USDT", direction: "Buy", fiatCurrency: "EUR", pricing: floating(-0.4), minTrade: 200, maxTrade: 80000, availableLiquidity: 54000, paymentMethods: [SEPA, WISE], status: "Online", updatedAt: "2026-07-27T13:08:00Z" },
  { id: "AD-1024", merchantId: "m-mumbaiupi", asset: "USDT", direction: "Buy", fiatCurrency: "INR", pricing: fixed(85.7), minTrade: 10000, maxTrade: 800000, availableLiquidity: 31000, paymentMethods: [UPI], status: "Online", updatedAt: "2026-07-27T13:01:00Z" },
  { id: "AD-1025", merchantId: "m-saopix", asset: "USDC", direction: "Buy", fiatCurrency: "BRL", pricing: floating(-0.8), minTrade: 300, maxTrade: 45000, availableLiquidity: 12700, paymentMethods: [PIX], status: "Online", updatedAt: "2026-07-27T12:52:00Z" },
  { id: "AD-1026", merchantId: "m-londondesk", asset: "SOL", direction: "Sell", fiatCurrency: "USD", pricing: fixed(146.1), minTrade: 100, maxTrade: 100000, availableLiquidity: 3200, paymentMethods: [WISE, REVOLUT], status: "Online", updatedAt: "2026-07-27T12:45:00Z" },
];

/** The current merchant's own ads (merchant console, /ads). */
export const MY_ADS: Advertisement[] = [
  { id: "AD-2001", merchantId: "m-you", asset: "USDT", direction: "Sell", fiatCurrency: "KES", pricing: fixed(132.2), minTrade: 3000, maxTrade: 300000, availableLiquidity: 12400, paymentMethods: [MPESA, EQUITY], status: "Online", updatedAt: "2026-07-27T12:30:00Z" },
  { id: "AD-2002", merchantId: "m-you", asset: "USDT", direction: "Buy", fiatCurrency: "KES", pricing: floating(-0.6), minTrade: 5000, maxTrade: 200000, availableLiquidity: 9000, paymentMethods: [MPESA, POCHI], status: "Online", updatedAt: "2026-07-27T11:15:00Z" },
  { id: "AD-2003", merchantId: "m-you", asset: "USDC", direction: "Sell", fiatCurrency: "KES", pricing: floating(0.9), minTrade: 2000, maxTrade: 100000, availableLiquidity: 4600, paymentMethods: [MPESA, IM_BANK], status: "Paused", updatedAt: "2026-07-26T16:40:00Z" },
  { id: "AD-2004", merchantId: "m-you", asset: "USDT", direction: "Sell", fiatCurrency: "NGN", pricing: fixed(1550), minTrade: 50000, maxTrade: 2000000, availableLiquidity: 8000, paymentMethods: [BANK_TRANSFER], status: "Online", updatedAt: "2026-07-25T10:05:00Z" },
];

// ── Global generated book ─────────────────────────────────────────────────────

interface Market {
  currency: string;
  /** Units per 1 USD (static FX table). */
  fx: number;
  /** Primary country — used to match merchants to the market. */
  country: string;
  methods: string[];
  assets: StablecoinAsset[];
}

const MAJORS: StablecoinAsset[] = ["USDT", "USDC", "USD1", "SOL"];
const MID: StablecoinAsset[] = ["USDT", "USDC"];
const SMALL: StablecoinAsset[] = ["USDT"];

export const MARKETS: Market[] = [
  { currency: "KES", fx: 131.4, country: "KE", methods: [MPESA, POCHI, EQUITY, KCB, IM_BANK], assets: MAJORS },
  { currency: "NGN", fx: 1545, country: "NG", methods: ["Bank Transfer", "Kuda Bank", "OPay"], assets: MAJORS },
  { currency: "ZAR", fx: 18.2, country: "ZA", methods: ["Bank Transfer (EFT)", "Capitec", "FNB"], assets: MID },
  { currency: "GHS", fx: 15.1, country: "GH", methods: ["MTN Mobile Money", "Vodafone Cash", "Bank Transfer"], assets: MID },
  { currency: "TZS", fx: 2650, country: "TZ", methods: ["M-Pesa Tanzania", "Tigo Pesa", "Airtel Money"], assets: SMALL },
  { currency: "UGX", fx: 3720, country: "UG", methods: ["MTN Mobile Money", "Airtel Money"], assets: SMALL },
  { currency: "EGP", fx: 48.5, country: "EG", methods: ["Vodafone Cash", "InstaPay", "Bank Transfer"], assets: MID },
  { currency: "MAD", fx: 10.1, country: "MA", methods: ["Bank Transfer", "Cash Plus", "Wise"], assets: SMALL },
  { currency: "XOF", fx: 605, country: "SN", methods: ["Wave", "Orange Money", "MTN Mobile Money"], assets: SMALL },
  { currency: "XAF", fx: 605, country: "CM", methods: ["MTN Mobile Money", "Orange Money"], assets: SMALL },
  { currency: "USD", fx: 1, country: "US", methods: ["ACH", "Zelle", "Wise", "Wire Transfer"], assets: MAJORS },
  { currency: "EUR", fx: 0.92, country: "DE", methods: ["SEPA", "Revolut", "Wise"], assets: MAJORS },
  { currency: "GBP", fx: 0.79, country: "GB", methods: ["Faster Payments (UK)", "Revolut", "Wise"], assets: MAJORS },
  { currency: "INR", fx: 86.4, country: "IN", methods: ["UPI", "IMPS", "Bank Transfer"], assets: MAJORS },
  { currency: "PKR", fx: 278, country: "PK", methods: ["EasyPaisa", "JazzCash", "Bank Transfer"], assets: MID },
  { currency: "BDT", fx: 117, country: "BD", methods: ["bKash", "Nagad", "Bank Transfer"], assets: MID },
  { currency: "PHP", fx: 58.5, country: "PH", methods: ["GCash", "Maya", "Bank Transfer"], assets: MID },
  { currency: "IDR", fx: 16200, country: "ID", methods: ["GoPay", "OVO", "Bank Transfer"], assets: MID },
  { currency: "VND", fx: 25400, country: "VN", methods: ["VietQR", "MoMo", "Bank Transfer"], assets: MID },
  { currency: "THB", fx: 36.5, country: "TH", methods: ["PromptPay", "Bank Transfer"], assets: MID },
  { currency: "MYR", fx: 4.7, country: "MY", methods: ["DuitNow", "Bank Transfer"], assets: MID },
  { currency: "BRL", fx: 5.62, country: "BR", methods: ["PIX", "TED", "Wise"], assets: MAJORS },
  { currency: "ARS", fx: 980, country: "AR", methods: ["Mercado Pago", "Bank Transfer", "Lemon Cash"], assets: MID },
  { currency: "MXN", fx: 18.6, country: "MX", methods: ["SPEI", "Bank Transfer", "Mercado Pago"], assets: MID },
  { currency: "COP", fx: 4200, country: "CO", methods: ["Nequi", "Daviplata", "Bank Transfer"], assets: MID },
  { currency: "CLP", fx: 950, country: "CL", methods: ["Bank Transfer", "MACH"], assets: MID },
  { currency: "PEN", fx: 3.75, country: "PE", methods: ["Yape", "Plin", "Bank Transfer"], assets: MID },
  { currency: "TRY", fx: 34.2, country: "TR", methods: ["Papara", "Bank Transfer (FAST)"], assets: MAJORS },
  { currency: "AED", fx: 3.67, country: "AE", methods: ["Bank Transfer", "Wise"], assets: MAJORS },
  { currency: "SAR", fx: 3.75, country: "SA", methods: ["STC Pay", "Bank Transfer"], assets: MID },
  { currency: "ILS", fx: 3.7, country: "PS", methods: ["Bank of Palestine", "Jawwal Pay", "Bank Transfer"], assets: SMALL },
  { currency: "RUB", fx: 92, country: "RU", methods: ["SBP", "Bank Transfer", "Tinkoff"], assets: MID },
  { currency: "UAH", fx: 41.3, country: "UA", methods: ["PrivatBank", "Monobank"], assets: MID },
  { currency: "JPY", fx: 156, country: "JP", methods: ["Bank Transfer", "PayPay"], assets: MAJORS },
  { currency: "CNY", fx: 7.25, country: "CN", methods: ["Alipay", "WeChat Pay"], assets: MAJORS },
  {
    currency: "HKD",
    fx: 7.8,
    country: "HK",
    methods: ["FPS (Faster Payment System)", "PayMe", "AlipayHK", "WeChat Pay HK", "Octopus (O! ePay)", "Bank Transfer"],
    assets: MAJORS,
  },
  // MOP is pegged to HKD at roughly 1.03, hence the fx sitting just above it.
  { currency: "MOP", fx: 8.03, country: "MO", methods: ["MPay", "BOC Pay", "Bank Transfer"], assets: MID },
  { currency: "TWD", fx: 32.5, country: "TW", methods: ["JKOPay", "LINE Pay", "Taiwan Pay", "Bank Transfer"], assets: MAJORS },
  { currency: "SGD", fx: 1.35, country: "SG", methods: ["PayNow", "Bank Transfer"], assets: MAJORS },
  { currency: "AUD", fx: 1.52, country: "AU", methods: ["PayID", "Bank Transfer (OSKO)"], assets: MAJORS },
  { currency: "CAD", fx: 1.36, country: "CA", methods: ["Interac e-Transfer", "Bank Transfer"], assets: MAJORS },
  { currency: "ETB", fx: 120, country: "ET", methods: ["Telebirr", "CBE Birr"], assets: SMALL },
  { currency: "VES", fx: 36.5, country: "VE", methods: ["Pago Móvil", "Bank Transfer"], assets: SMALL },
  { currency: "MMK", fx: 2100, country: "MM", methods: ["KBZPay", "Wave Money"], assets: SMALL },
  { currency: "AFN", fx: 71, country: "AF", methods: ["Bank Transfer", "Hawala"], assets: SMALL },
  { currency: "IRR", fx: 580000, country: "IR", methods: ["Shetab Bank Transfer"], assets: SMALL },
];

/** Payment methods typical for a currency's primary market (SEO + filters). */
export function paymentMethodsForCurrency(currency: string): string[] {
  return MARKETS.find((mk) => mk.currency === currency)?.methods ?? ["Bank Transfer"];
}

/** Fixed-seed PRNG (mulberry32) — deterministic across builds and renders. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(0x0f1a7);

/** Round a fiat price to sensible precision for the currency's magnitude. */
function roundPrice(value: number, fx: number): number {
  const decimals = fx >= 10000 ? 0 : fx >= 1 ? 2 : 3;
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/** Round to `sig` significant figures (keeps limits readable in any currency). */
function roundSig(value: number, sig: number): number {
  if (value <= 0) return value;
  const d = Math.ceil(Math.log10(value));
  const f = 10 ** (d - sig);
  return Math.round(value / f) * f;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(rand() * list.length)];
}

function pickMethods(methods: string[]): string[] {
  const count = 1 + Math.floor(rand() * Math.min(3, methods.length));
  const shuffled = [...methods].sort(() => rand() - 0.5);
  return shuffled.slice(0, count);
}

function generatedTimestamp(): string {
  const day = 21 + Math.floor(rand() * 7);
  const hh = String(6 + Math.floor(rand() * 14)).padStart(2, "0");
  const mm = String(Math.floor(rand() * 60)).padStart(2, "0");
  return `2026-07-${day}T${hh}:${mm}:00Z`;
}

function generateBook(): Advertisement[] {
  const ads: Advertisement[] = [];
  let gid = 5000;
  for (const mk of MARKETS) {
    const local = MERCHANTS.filter((mr) => mr.countryCode === mk.country);
    const pool = local.length > 0 ? local : MERCHANTS;
    const nSell = 4 + Math.floor(rand() * 7); // 4–10
    const nBuy = 2 + Math.floor(rand() * 5); // 2–6
    for (let i = 0; i < nSell + nBuy; i++) {
      const direction = i < nSell ? "Sell" : "Buy";
      const asset = pick(mk.assets);
      const base = asset === "SOL" ? mk.fx * 144.2 : mk.fx;
      const premium = direction === "Sell" ? 0.3 + rand() * 2.2 : -(0.2 + rand() * 1.3);
      gid += 1;
      ads.push({
        id: `AD-G${gid}`,
        merchantId: pick(pool).id,
        asset,
        direction,
        fiatCurrency: mk.currency,
        pricing:
          rand() < 0.5
            ? { type: "Fixed", price: roundPrice(base * (1 + premium / 100), mk.fx) }
            : { type: "Floating", premiumPct: Math.round(premium * 10) / 10 },
        minTrade: roundSig(mk.fx * (10 + rand() * 40), 2),
        maxTrade: roundSig(mk.fx * (500 + rand() * 4500), 3),
        availableLiquidity:
          asset === "SOL" ? round2(5 + rand() * 500) : round2(500 + rand() * 99500),
        paymentMethods: pickMethods(mk.methods),
        status: rand() < 0.08 ? "Paused" : "Online",
        updatedAt: generatedTimestamp(),
      });
    }
  }
  return ads;
}

export const GENERATED_ADS: Advertisement[] = generateBook();

// ── International ads (borderless OTC desks, USD-priced, any payment method) ──

const INTL_ASSETS: StablecoinAsset[] = ["USDT", "USDC", "USD1", "SOL"];

/** Deterministic international book: 2–4 USD-priced ads per international merchant. */
function generateInternationalAds(): Advertisement[] {
  const intl = MERCHANTS.filter((mr) => mr.international);
  const ads: Advertisement[] = [];
  let n = 0;
  intl.forEach((merchant, mi) => {
    const count = 2 + (mi % 3); // 2–4 ads
    for (let i = 0; i < count; i++) {
      n += 1;
      const asset = INTL_ASSETS[(mi + i) % INTL_ASSETS.length];
      const direction = (mi + i) % 2 === 0 ? "Sell" : "Buy";
      const base = asset === "SOL" ? 144.2 : 1;
      const premium =
        direction === "Sell"
          ? 0.2 + ((mi * 7 + i * 13) % 15) / 10
          : -(0.2 + ((mi * 5 + i * 11) % 12) / 10);
      ads.push({
        id: `AD-I${100 + n}`,
        merchantId: merchant.id,
        asset,
        direction,
        fiatCurrency: "USD",
        pricing:
          i % 2 === 0
            ? { type: "Fixed", price: roundPrice(base * (1 + premium / 100), 1) }
            : { type: "Floating", premiumPct: Math.round(premium * 10) / 10 },
        minTrade: 100 * (1 + ((mi + i) % 5)),
        maxTrade: 250000 * (1 + (mi % 4)),
        availableLiquidity:
          asset === "SOL"
            ? 1000 + ((mi * 137 + i * 61) % 9000)
            : 100000 + ((mi * 7919 + i * 104729) % 900000),
        paymentMethods: [], // international ads accept any payment method
        international: true,
        status: "Online",
        updatedAt: `2026-07-27T${String(8 + ((mi + i) % 12)).padStart(2, "0")}:${String(
          (mi * 17 + i * 29) % 60,
        ).padStart(2, "0")}:00Z`,
      });
    }
  });
  return ads;
}

export const INTERNATIONAL_ADS: Advertisement[] = generateInternationalAds();

// Oracle mids for every generated pair (USDT/USD1 ≈ fx, USDC ≈ fx, SOL ≈ fx × $144.2).
for (const mk of MARKETS) {
  for (const asset of ["USDT", "USDC", "USD1", "SOL"] as const) {
    const key = `${asset}/${mk.currency}`;
    if (ORACLE_MID[key] === undefined) {
      ORACLE_MID[key] = asset === "SOL" ? roundPrice(mk.fx * 144.2, mk.fx) : mk.fx;
    }
  }
}

/** Effective unit price for an ad (fixed price, or oracle mid ± premium). */
export function adPrice(ad: Advertisement): number {
  if (ad.pricing.type === "Fixed") return ad.pricing.price;
  const mid = ORACLE_MID[`${ad.asset}/${ad.fiatCurrency}`];
  if (!mid) throw new Error(`No oracle mid for ${ad.asset}/${ad.fiatCurrency}`);
  return roundPrice(mid * (1 + ad.pricing.premiumPct / 100), 1);
}

/** Static FX rate: fiat units per 1 USD, from the oracle mid table. */
export function fxPerUsd(currency: string): number | undefined {
  if (currency === "USD") return 1;
  return ORACLE_MID[`USDT/${currency}`];
}

/**
 * Effective unit price for an ad in any currency. Local ads only price in
 * their own currency; international (USD-priced) ads convert via the FX table.
 * Returns undefined when conversion is impossible.
 */
export function adPriceIn(ad: Advertisement, currency: string): number | undefined {
  if (ad.fiatCurrency === currency) return adPrice(ad);
  if (!ad.international) return undefined;
  const fx = fxPerUsd(currency);
  if (!fx) return undefined;
  return roundPrice(adPrice(ad) * fx, fx);
}

/** Public order book: curated + generated + international ads (excludes the current user's own ads). */
export const PUBLIC_ADS: Advertisement[] = [...ADS, ...GENERATED_ADS, ...INTERNATIONAL_ADS];

export const ALL_ADS: Advertisement[] = [...PUBLIC_ADS, ...MY_ADS];

export function adById(id: string): Advertisement | undefined {
  return ALL_ADS.find((a) => a.id === id);
}

/** Online public ads for a merchant (profile page). */
export function adsForMerchant(merchantId: string): Advertisement[] {
  return PUBLIC_ADS.filter((a) => a.merchantId === merchantId && a.status === "Online");
}

/** Union of payment methods across a merchant's ads ("Any" for international desks). */
export function paymentMethodsForMerchant(merchantId: string): string[] {
  const ads = ALL_ADS.filter((a) => a.merchantId === merchantId);
  if (ads.some((a) => a.international)) return ["Any payment method"];
  return [...new Set(ads.flatMap((a) => a.paymentMethods))];
}
