/**
 * Canonical payment-method registry: names, categories, and aliases used for
 * type-ahead suggestions. Community-added methods (localStorage
 * "openfiat:custom-methods") merge with this registry in the picker.
 */

/** OFS-2100 §13 lists Cash Deposit alongside the electronic rails. */
export type PaymentMethodCategory =
  | "Mobile Money"
  | "Bank Transfer"
  | "Fintech"
  | "Cash";

export interface PaymentMethodInfo {
  name: string;
  category: PaymentMethodCategory;
  aliases: string[];
}

export const PAYMENT_METHOD_REGISTRY: PaymentMethodInfo[] = [
  /*
   * Cash. OFS-2100 §13 names Cash Deposit as a first-class method, and cash is
   * the only rail that exists in every country — which is the point: a market
   * with no local electronic system is still tradeable.
   *
   * Two forms, because they carry very different risk. A deposit at the
   * counterparty's bank leaves a paper trail an arbitrator can read; handing
   * over notes in person leaves none, so the trade rests entirely on the escrow
   * and on meeting somewhere sensible.
   */
  { name: "Cash Deposit", category: "Cash", aliases: ["cash deposit", "bank deposit", "cash at bank", "deposit cash"] },
  { name: "Cash in Person", category: "Cash", aliases: ["cash", "cash in person", "face to face", "f2f", "meet in person"] },
  { name: "M-Pesa Kenya (Safaricom)", category: "Mobile Money", aliases: ["mpesa", "m-pesa", "safaricom"] },
  { name: "Mpesa Pochi la Biashara", category: "Mobile Money", aliases: ["pochi", "pochi la biashara"] },
  { name: "MTN Mobile Money", category: "Mobile Money", aliases: ["mtn", "momo", "mtn momo"] },
  { name: "Airtel Money", category: "Mobile Money", aliases: ["airtel"] },
  { name: "Tigo Pesa", category: "Mobile Money", aliases: ["tigo"] },
  { name: "Vodafone Cash", category: "Mobile Money", aliases: ["vodafone"] },
  { name: "Telebirr", category: "Mobile Money", aliases: ["telebirr ethiopia"] },
  { name: "GCash", category: "Mobile Money", aliases: ["gcash philippines"] },
  { name: "Maya", category: "Mobile Money", aliases: ["paymaya"] },
  { name: "bKash", category: "Mobile Money", aliases: ["bkash"] },
  { name: "Nagad", category: "Mobile Money", aliases: [] },
  { name: "EasyPaisa", category: "Mobile Money", aliases: [] },
  { name: "JazzCash", category: "Mobile Money", aliases: ["jazz"] },
  { name: "I&M Bank", category: "Bank Transfer", aliases: ["i&m", "im bank", "imb"] },
  { name: "Equity Bank", category: "Bank Transfer", aliases: ["equity"] },
  { name: "KCB", category: "Bank Transfer", aliases: ["kcb bank", "kenya commercial bank"] },
  { name: "Bank Transfer", category: "Bank Transfer", aliases: ["wire", "bank"] },
  { name: "SEPA", category: "Bank Transfer", aliases: ["sepa transfer", "iban"] },
  /*
   * "FPS" is deliberately not an alias here. Hong Kong's Faster Payment
   * System is a different rail run by a different central bank, and a
   * merchant in either place typing "fps" should not be handed the other
   * country's system.
   */
  { name: "Faster Payments (UK)", category: "Bank Transfer", aliases: ["faster payments uk"] },
  { name: "FPS (Faster Payment System)", category: "Bank Transfer", aliases: ["fps", "fps hong kong", "轉數快"] },
  { name: "ACH", category: "Bank Transfer", aliases: ["ach transfer"] },
  { name: "Wire Transfer", category: "Bank Transfer", aliases: ["swift", "wire"] },
  { name: "PromptPay", category: "Bank Transfer", aliases: ["promptpay thailand"] },
  { name: "Interac e-Transfer", category: "Bank Transfer", aliases: ["interac", "e-transfer"] },
  { name: "PayID", category: "Bank Transfer", aliases: ["payid australia", "osko"] },
  { name: "SPEI", category: "Bank Transfer", aliases: ["spei mexico"] },
  { name: "Taiwan Pay", category: "Bank Transfer", aliases: ["taiwan pay", "twqr"] },
  { name: "Toss", category: "Fintech", aliases: ["toss korea"] },
  { name: "KakaoPay", category: "Fintech", aliases: ["kakao pay", "kakao"] },
  { name: "BLIK", category: "Bank Transfer", aliases: ["blik poland"] },
  { name: "Swish", category: "Bank Transfer", aliases: ["swish sweden"] },
  { name: "Vipps", category: "Bank Transfer", aliases: ["vipps norway"] },
  { name: "MobilePay", category: "Bank Transfer", aliases: ["mobilepay denmark"] },
  { name: "TWINT", category: "Bank Transfer", aliases: ["twint switzerland"] },
  { name: "Kaspi.kz", category: "Fintech", aliases: ["kaspi", "kaspi gold"] },
  { name: "Idram", category: "Fintech", aliases: ["idram armenia"] },
  { name: "Payme", category: "Fintech", aliases: ["payme uzbekistan"] },
  { name: "Click", category: "Fintech", aliases: ["click uzbekistan"] },
  { name: "eSewa", category: "Mobile Money", aliases: ["esewa nepal"] },
  { name: "Khalti", category: "Mobile Money", aliases: ["khalti nepal"] },
  { name: "Wing", category: "Mobile Money", aliases: ["wing cambodia"] },
  { name: "ABA Pay", category: "Bank Transfer", aliases: ["aba", "aba bank"] },
  { name: "QPay", category: "Fintech", aliases: ["qpay mongolia"] },
  { name: "CliQ", category: "Bank Transfer", aliases: ["cliq jordan"] },
  { name: "Zain Cash", category: "Mobile Money", aliases: ["zaincash"] },
  { name: "Fawran", category: "Bank Transfer", aliases: ["fawran qatar"] },
  { name: "KNET", category: "Bank Transfer", aliases: ["knet kuwait"] },
  { name: "BenefitPay", category: "Fintech", aliases: ["benefit pay bahrain"] },
  { name: "Thawani", category: "Fintech", aliases: ["thawani oman"] },
  { name: "D17", category: "Fintech", aliases: ["d17 tunisia"] },
  { name: "BaridiMob", category: "Fintech", aliases: ["baridimob algeria", "baridi"] },
  { name: "EcoCash", category: "Mobile Money", aliases: ["ecocash zimbabwe"] },
  { name: "M-Pesa Mozambique", category: "Mobile Money", aliases: ["mpesa mozambique"] },
  { name: "Orange Money", category: "Mobile Money", aliases: ["orange"] },
  { name: "Juice by MCB", category: "Bank Transfer", aliases: ["juice mauritius", "mcb juice"] },
  { name: "SINPE Movil", category: "Bank Transfer", aliases: ["sinpe", "sinpe movil"] },
  { name: "Yappy", category: "Fintech", aliases: ["yappy panama"] },
  { name: "Tigo Money", category: "Mobile Money", aliases: ["tigo"] },
  { name: "Lynk", category: "Fintech", aliases: ["lynk jamaica"] },
  { name: "WiPay", category: "Fintech", aliases: ["wipay"] },
  { name: "tPago", category: "Fintech", aliases: ["tpago dominican"] },
  { name: "LankaPay", category: "Bank Transfer", aliases: ["lankapay", "ceft"] },
  { name: "BCEL One", category: "Bank Transfer", aliases: ["bcel", "bcel one laos"] },
  { name: "Revolut", category: "Fintech", aliases: ["rev"] },
  { name: "Wise", category: "Fintech", aliases: ["transferwise"] },
  { name: "Skrill", category: "Fintech", aliases: [] },
  { name: "PayPal", category: "Fintech", aliases: ["pp"] },
  { name: "Zelle", category: "Fintech", aliases: [] },
  { name: "UPI", category: "Fintech", aliases: ["upi india", "bhim", "gpay", "phonepe"] },
  { name: "PIX", category: "Fintech", aliases: ["pix brazil"] },
  { name: "Alipay", category: "Fintech", aliases: ["alipay china"] },
  { name: "WeChat Pay", category: "Fintech", aliases: ["wechat"] },
  { name: "JKOPay", category: "Fintech", aliases: ["jko", "jkopay", "街口支付"] },
  { name: "LINE Pay", category: "Fintech", aliases: ["linepay", "line"] },
  /*
   * AlipayHK and WeChat Pay HK are separate products from the mainland
   * Alipay and WeChat Pay above, on separate accounts — a Hong Kong wallet
   * cannot receive from a mainland one. Listing them apart is what lets a
   * merchant state which they actually hold.
   */
  { name: "PayMe", category: "Fintech", aliases: ["payme", "payme hsbc"] },
  { name: "AlipayHK", category: "Fintech", aliases: ["alipay hk", "alipayhk", "支付寶香港"] },
  { name: "WeChat Pay HK", category: "Fintech", aliases: ["wechat hk", "weixin hk"] },
  { name: "Octopus (O! ePay)", category: "Fintech", aliases: ["octopus", "oepay", "o! epay", "八達通"] },
  { name: "MPay", category: "Fintech", aliases: ["mpay", "macau pass", "澳門通"] },
  { name: "BOC Pay", category: "Fintech", aliases: ["boc pay", "bank of china pay"] },
  { name: "Mercado Pago", category: "Fintech", aliases: ["mercadopago"] },
  { name: "Papara", category: "Fintech", aliases: [] },
];

/**
 * Substring match over name + aliases (case-insensitive), merging
 * community-added methods. Returns method names, registry-first, capped.
 */
export function searchPaymentMethods(query: string, custom: string[] = [], cap = 8): string[] {
  const registryNames = PAYMENT_METHOD_REGISTRY.map((m) => m.name);
  const all = [...registryNames, ...custom.filter((c) => !registryNames.includes(c))];
  const q = query.trim().toLowerCase();
  if (!q) return all.slice(0, cap);
  const aliasHit = new Set(
    PAYMENT_METHOD_REGISTRY.filter(
      (m) => m.name.toLowerCase().includes(q) || m.aliases.some((a) => a.toLowerCase().includes(q)),
    ).map((m) => m.name),
  );
  return all.filter((name) => aliasHit.has(name) || name.toLowerCase().includes(q)).slice(0, cap);
}

export function isRegistryMethod(name: string): boolean {
  return PAYMENT_METHOD_REGISTRY.some((m) => m.name === name);
}
