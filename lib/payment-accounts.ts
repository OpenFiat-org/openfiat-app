import { PAYMENT_METHOD_REGISTRY } from "@/lib/data/payment-methods";
import type { PaymentField } from "@/lib/types";

/**
 * The accounts you own and receive fiat into.
 *
 * Selling requires these and there was nowhere to keep them: the app modelled
 * the *counterparty's* payment details on a trade, but not your own, so a seller
 * had nothing to nominate and a buyer had nothing to pay into.
 *
 * Shapes differ per rail — a mobile-money account is a phone number, a local
 * bank needs an account number and branch, an international one needs IBAN and
 * SWIFT — so the fields are derived from the method rather than being one
 * free-text blob. That is also what makes them individually copyable for the
 * counterparty: a blob forces them to select text out of a paragraph and get it
 * wrong.
 */

export const ACCOUNTS_STORAGE_KEY = "openfiat:payment-accounts";

export type AccountShape = "mobile" | "local-bank" | "international-bank" | "handle" | "cash";

export interface SavedPaymentAccount {
  id: string;
  /** A method name from the registry. */
  method: string;
  /** ISO country code this account is held in. */
  countryCode: string;
  /** Currency it receives. */
  currencyCode: string;
  /** Filled per the method's shape. */
  fields: PaymentField[];
}

/** Which fields a method needs, so the form asks for the right things. */
export function shapeFor(method: string): AccountShape {
  const m = method.toLowerCase();
  if (/cash/.test(m)) return "cash";
  if (
    /m-?pesa|pochi|airtel|tigo|vodafone|mtn|telebirr|gcash|maya|easypaisa|jazzcash|bkash|nagad|gopay|ovo|momo|wave|orange money|ecocash|zain|esewa|khalti|wing|mobile money/.test(
      m,
    )
  ) {
    return "mobile";
  }
  if (/sepa|wire|swift|ach/.test(m)) return "international-bank";
  if (
    /wise|revolut|skrill|paypal|zelle|alipay|wechat|line pay|jkopay|payme|kaspi|idram|payme|click|qpay|yappy|lynk|wipay|tpago|mercado|benefitpay|thawani|d17|baridimob|tigo money/.test(
      m,
    )
  ) {
    return "handle";
  }
  return "local-bank";
}

const LABELS: Record<AccountShape, string[]> = {
  mobile: ["Registered name", "Phone number"],
  "local-bank": ["Account name", "Account number", "Bank name", "Branch"],
  "international-bank": ["Account name", "IBAN / Account number", "SWIFT / BIC", "Bank name"],
  handle: ["Account name", "Email / Handle"],
  cash: ["Your name", "City or meeting area"],
};

/** Empty field set for a method, in the order the form should ask. */
export function blankFields(method: string): PaymentField[] {
  return LABELS[shapeFor(method)].map((label) => ({ label, value: "" }));
}

/** Methods a user can plausibly hold an account on, for the picker. */
export function selectableMethods(): string[] {
  return PAYMENT_METHOD_REGISTRY.map((m) => m.name).sort((a, b) => a.localeCompare(b));
}

/**
 * Accounts usable for a given advertisement.
 *
 * An international ad accepts any method, so everything qualifies. Otherwise the
 * account's method has to be one the merchant actually accepts — nominating an
 * account they cannot pay into wastes the payment window.
 */
export function accountsFor(
  accounts: SavedPaymentAccount[],
  adMethods: string[],
  international: boolean | undefined,
): SavedPaymentAccount[] {
  if (international) return accounts;
  return accounts.filter((a) => adMethods.includes(a.method));
}

/** True once every field carries a value. A half-filled account is unusable. */
export function isComplete(account: SavedPaymentAccount): boolean {
  return account.fields.every((f) => f.value.trim().length > 0);
}

export function readAccounts(): SavedPaymentAccount[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedPaymentAccount[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeAccounts(accounts: SavedPaymentAccount[]): void {
  try {
    localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
  } catch {
    /* localStorage unavailable */
  }
}
