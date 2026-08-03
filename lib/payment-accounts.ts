import type { PaymentMethodCategory } from "@openfiat/sdk";

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
  /**
   * The catalogue **id** of the rail — `builtin:mpesa-kenya`.
   *
   * An id and not a name, because this is matched against an
   * advertisement's `payment_methods`, and those are ids: the node refuses
   * `"M-Pesa"` and accepts `"builtin:mpesa-kenya"`. An account saved by an
   * earlier build holds a name here and will therefore match nothing —
   * which shows up as "none of your saved accounts uses a method this
   * advertiser accepts", and is fixed by saving it again. That is a real
   * cost, and the alternative was an account that silently never matched.
   */
  method: string;
  /**
   * The node's name for that id at the time it was saved.
   *
   * Kept so a saved account still reads as "M-Pesa Kenya (Safaricom)" when
   * no node can be reached. It is a cached label and never a key: matching
   * always goes through `method`.
   */
  methodName?: string;
  /** ISO country code this account is held in. */
  countryCode: string;
  /** Currency it receives. */
  currencyCode: string;
  /** Filled per the method's shape. */
  fields: PaymentField[];
}

/**
 * Which fields a rail needs, so the form asks for the right things.
 *
 * # The split comes from the node's category, not from a word list
 *
 * This used to be four regexes over the method's *name* — some eighty
 * alternations covering `m-?pesa|pochi|airtel|…` — which had to be extended
 * by hand every time the network gained a rail, and quietly produced a bank
 * form for anything it had not heard of. `getReferenceData` labels every
 * method `MobileMoney`, `BankTransfer`, `Fintech` or `Cash`, which is
 * exactly this question already answered, so that is what decides it.
 *
 * One split the category does not make is local versus international bank —
 * both are `BankTransfer`, and the fields differ (IBAN and SWIFT against
 * account number and branch). That is decided on the id, which is stable and
 * the node's, rather than on a display name that is neither.
 */
export function shapeFor(category: PaymentMethodCategory | null, id = ""): AccountShape {
  switch (category) {
    case "Cash":
      return "cash";
    case "MobileMoney":
      return "mobile";
    case "Fintech":
      return "handle";
    case "BankTransfer":
      return /sepa|swift|wire|iban/.test(id.toLowerCase()) ? "international-bank" : "local-bank";
    default:
      // No category yet — the form has not been given a rail, or the node
      // could not be asked. A bank shape asks for the most fields, so
      // nothing a merchant types into it is thrown away when the real shape
      // arrives.
      return "local-bank";
  }
}

const LABELS: Record<AccountShape, string[]> = {
  mobile: ["Registered name", "Phone number"],
  "local-bank": ["Account name", "Account number", "Bank name", "Branch"],
  "international-bank": ["Account name", "IBAN / Account number", "SWIFT / BIC", "Bank name"],
  handle: ["Account name", "Email / Handle"],
  cash: ["Your name", "City or meeting area"],
};

/** Empty field set for a rail, in the order the form should ask. */
export function blankFields(
  category: PaymentMethodCategory | null,
  id = "",
): PaymentField[] {
  return LABELS[shapeFor(category, id)].map((label) => ({ label, value: "" }));
}

/*
 * `selectableMethods()` used to live here, returning every name in
 * `lib/data/payment-methods.ts` — a stale snapshot of the node's own table,
 * kept alive by this one caller. The settings screen reads
 * `getReferenceData` directly now (`components/settings/payment-accounts.tsx`),
 * so the table is gone and this module no longer knows what methods exist.
 *
 * `shapeFor` above stays, and it is a different kind of thing: it asks which
 * *fields* a rail needs, which is a fact about how you are paid rather than
 * about what the network supports. It matches on the name and falls through
 * to a bank shape, so a rail no build has heard of still gets a usable form.
 */

/**
 * Accounts usable for a given advertisement.
 *
 * `adMethods` are catalogue ids, and so is `account.method`; comparing a
 * name against an id here would match nothing and read as "you have no
 * account for this rail".
 *
 * An international ad accepts any method, so everything qualifies. Otherwise
 * the account's rail has to be one the merchant actually accepts —
 * nominating an account they cannot pay into wastes the payment window.
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
