/**
 * Canonical payment-method registry: names, categories, and aliases used for
 * type-ahead suggestions. Community-added methods (localStorage
 * "openfiat:custom-methods") merge with this registry in the picker.
 */

export type PaymentMethodCategory = "Mobile Money" | "Bank Transfer" | "Fintech";

export interface PaymentMethodInfo {
  name: string;
  category: PaymentMethodCategory;
  aliases: string[];
}

export const PAYMENT_METHOD_REGISTRY: PaymentMethodInfo[] = [
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
  { name: "Faster Payments", category: "Bank Transfer", aliases: ["fps", "faster payments uk"] },
  { name: "ACH", category: "Bank Transfer", aliases: ["ach transfer"] },
  { name: "Wire Transfer", category: "Bank Transfer", aliases: ["swift", "wire"] },
  { name: "PromptPay", category: "Bank Transfer", aliases: ["promptpay thailand"] },
  { name: "Interac e-Transfer", category: "Bank Transfer", aliases: ["interac", "e-transfer"] },
  { name: "PayID", category: "Bank Transfer", aliases: ["payid australia", "osko"] },
  { name: "SPEI", category: "Bank Transfer", aliases: ["spei mexico"] },
  { name: "Taiwan Pay", category: "Bank Transfer", aliases: ["taiwan pay", "twqr"] },
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
