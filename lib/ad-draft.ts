import type { AssetOption } from "@/lib/reference";

/**
 * Binance and Bybit both cap an advertisement at five payment methods, and
 * the cap is not arbitrary: a row listing twelve rails tells a buyer nothing
 * about which one the merchant will actually answer on, and the order-book
 * column has to stay readable at a glance.
 *
 * The protocol does not enforce it — `payment_methods` is an unbounded
 * `Vec<String>` — so this is this interface's limit, stated as one.
 */
export const MAX_PAYMENT_METHODS = 5;

/**
 * The advertisement a merchant is composing, and the rules for whether each
 * step of it is finished.
 *
 * # Separate from the wizard because it is the part worth testing
 *
 * The wizard's own validation used to be two record literals inline in a
 * 759-line component, which meant the only way to check that a premium of
 * -6% is refused was to render a React tree. Here it is a function of a
 * plain object, so `tests/ad-draft.test.ts` asserts the rules directly and
 * the component is left with layout.
 *
 * # The step order is Binance's, and that is the point
 *
 * Ad type and asset, then price, then amount and limits, then payment
 * methods, then review and confirm. Anybody who has posted a P2P
 * advertisement anywhere has done it in that order, and an interface that
 * invents its own order for the same five decisions is asking a merchant to
 * learn something that carries no information.
 *
 * What was there before was "Market, Pricing, Limits, Payment methods,
 * Review" — close, but with the total trading amount buried in the limits
 * step under the name "Liquidity", and with the asset entered as a typed
 * base58 mint address on the first screen.
 *
 * # Two of Binance's fields have nowhere to go, and are not collected
 *
 * A payment time limit and free-text terms/remarks are both real Binance
 * fields, and `AdvertisementCreate` (OFS-2100) carries neither: it has an
 * id, a merchant, a mint, a direction, a currency, min/max, liquidity, a
 * pricing model, payment methods and a timestamp, and that is the whole
 * record. A reservation's `expires_at` is set by the node, not chosen per
 * advertisement by the merchant.
 *
 * Collecting them anyway would produce a control that changes nothing —
 * which is exactly what the "Minimum counterparty reputation" dropdown on
 * the old step 3 was. It offered five thresholds, claimed "this client will
 * not let anyone below your floor open an order", was written into the local
 * draft, and was never sent to the node or read by anything. It is gone
 * rather than wired up, because there is nothing to wire it to.
 */

export interface AdDraft {
  step: number;
  /** The MERCHANT's side, as the record carries it. */
  direction: "Buy" | "Sell";
  /** The asset's mint address — an identity, never a ticker. */
  mint: string;
  fiat: string;
  pricingType: "Fixed" | "Floating";
  /** Fixed price in fiat per unit of asset, as typed. */
  price: string;
  /** Floating premium over the oracle mid, in percent, as typed. */
  premium: string;
  /**
   * The precision a *floating* price is quoted to.
   *
   * Asked only for floating, because a fixed price carries its own: if a
   * merchant types `132.50`, the record's decimals are the two they typed,
   * exactly. A floating advertisement has no typed price to take it from and
   * the limits are denominated in the asset, so nothing else on the record
   * implies it. Inferring it from the currency code would mean shipping a
   * currency-to-decimals table that silently mis-rounds every currency
   * missing from it.
   */
  priceDecimals: string;
  /** Total trading amount, in the asset. Binance's step 3, and its name. */
  totalAmount: string;
  /** Per-order limits, in the asset — like the total above, not in fiat. */
  minOrder: string;
  maxOrder: string;
  /** ISO country code whose payment rails to suggest. Not on the record. */
  country: string;
  methods: string[];
}

export const AD_DRAFT_KEY = "openfiat:ad-draft";

export const AD_STEPS = [
  "Ad type & asset",
  "Price",
  "Amount & limits",
  "Payment",
  "Review",
] as const;

/**
 * An empty draft.
 *
 * Nothing is pre-chosen that this app has no standing to choose. The old
 * default filled in a mint, `KES`, a 0.8% premium, limits of 10–5,000, a
 * liquidity of 10,000 and the payment method "M-Pesa Kenya (Safaricom)" —
 * a complete, plausible Kenyan advertisement that no merchant had written,
 * one Continue away from being signed. Every one of those is a decision that
 * belongs to the merchant.
 *
 * The two defaults that remain are about form rather than content: `Sell` is
 * the side almost every first advertisement is on, and it is one click to
 * change; `Floating` is the pricing model that does not go stale unattended.
 */
export const EMPTY_AD_DRAFT: AdDraft = {
  step: 1,
  direction: "Sell",
  mint: "",
  fiat: "",
  pricingType: "Floating",
  price: "",
  premium: "",
  priceDecimals: "2",
  totalAmount: "",
  minOrder: "",
  maxOrder: "",
  country: "",
  methods: [],
};

/** Premium bounds the node itself enforces on a floating advertisement. */
export const PREMIUM_LIMIT_PCT = 5;

/**
 * How many decimal places a typed price carries.
 *
 * `"132.50"` is two, `"132"` is none. This is the merchant's own input read
 * back, not a table: a fixed price is signed at exactly the precision it was
 * written at, so nothing is rounded away and nothing is invented.
 */
export function typedDecimals(value: string): number {
  const [, fraction = ""] = value.trim().split(".");
  return fraction.length;
}

/** The precision a draft's price is carried at, whichever model it uses. */
export function priceDecimalsFor(draft: AdDraft): number {
  return draft.pricingType === "Fixed"
    ? typedDecimals(draft.price)
    : Number(draft.priceDecimals) || 0;
}

/**
 * What is stopping each step from being finished, in the merchant's words.
 *
 * One list per step rather than a boolean, because "Continue is greyed out"
 * with no reason is the most common way a form wastes somebody's afternoon.
 * An empty list means the step is done.
 *
 * `asset` is the node's row for `draft.mint`, or `null` when the node has
 * not answered or does not name it — which is itself a reason the step
 * cannot be finished, since the record's amounts need its precision.
 */
export function stepProblems(
  draft: AdDraft,
  asset: AssetOption | null,
  max = MAX_PAYMENT_METHODS,
): Record<number, string[]> {
  const premium = Number(draft.premium);
  const price = Number(draft.price);
  const total = Number(draft.totalAmount);
  const min = Number(draft.minOrder);
  const max_ = Number(draft.maxOrder);
  const decimals = Number(draft.priceDecimals);

  return {
    1: [
      ...(draft.mint ? [] : ["Choose the token you will be paid in."]),
      ...(draft.mint && !asset
        ? ["Your node does not name this token, so its precision is unknown. Choose another."]
        : []),
      ...(draft.fiat ? [] : ["Choose the fiat currency you will trade against."]),
    ],
    2:
      draft.pricingType === "Fixed"
        ? [
            ...(price > 0 ? [] : ["Enter a fixed price greater than 0."]),
            ...(typedDecimals(draft.price) > 12
              ? ["A price cannot carry more than 12 decimal places."]
              : []),
          ]
        : [
            ...(draft.premium.trim() === "" || Number.isNaN(premium)
              ? ["Enter a premium — 0 tracks the oracle mid exactly."]
              : []),
            ...(Math.abs(premium) > PREMIUM_LIMIT_PCT
              ? [`A premium must be between -${PREMIUM_LIMIT_PCT}% and +${PREMIUM_LIMIT_PCT}%.`]
              : []),
            ...(Number.isInteger(decimals) && decimals >= 0 && decimals <= 12
              ? []
              : ["Price decimals must be a whole number between 0 and 12."]),
          ],
    3: [
      ...(total > 0 ? [] : ["Enter the total amount you are putting on offer."]),
      ...(min > 0 ? [] : ["Enter a minimum order amount."]),
      ...(max_ >= min ? [] : ["The maximum order must be at least the minimum."]),
      // An order nobody can place is worse than no advertisement: it sits in
      // the book, quotes a price, and refuses every reservation.
      ...(min > 0 && total > 0 && min > total
        ? ["The minimum order is larger than the total on offer, so no order could be filled."]
        : []),
      ...(max_ > 0 && total > 0 && max_ > total
        ? ["The maximum order is larger than the total on offer."]
        : []),
    ],
    4: [
      ...(draft.methods.length >= 1 ? [] : ["Select at least one payment method."]),
      ...(draft.methods.length > max ? [`An advertisement can list at most ${max}.`] : []),
    ],
    5: [],
  };
}

/** Whether every step up to and including `step` is finished. */
export function completeThrough(problems: Record<number, string[]>, step: number): boolean {
  for (let n = 1; n <= step; n++) if ((problems[n] ?? []).length > 0) return false;
  return true;
}

/**
 * A draft read back from localStorage, with anything unrecognised dropped.
 *
 * Merged over {@link EMPTY_AD_DRAFT} so a draft written by an older build —
 * which carried `liquidity`, `minRep` and a typed `mint` — restores the
 * fields that still exist and silently forgets the ones that do not.
 */
export function parseDraft(raw: string): AdDraft {
  const saved = JSON.parse(raw) as Partial<AdDraft>;
  // Projected onto the current shape's keys rather than spread over it. A
  // spread carries an older build's fields through — `liquidity`, `minRep` —
  // and they are then written back to localStorage on the next keystroke,
  // so a control that was removed for doing nothing outlives its own
  // deletion in every merchant's browser.
  const draft = {} as AdDraft;
  for (const key of Object.keys(EMPTY_AD_DRAFT) as (keyof AdDraft)[]) {
    // @ts-expect-error — one assignment per key, each of which type-checks
    // on its own; TypeScript cannot see that through a `keyof` loop.
    draft[key] = saved[key] ?? EMPTY_AD_DRAFT[key];
  }
  return {
    ...draft,
    step: Math.min(Math.max(Math.trunc(Number(draft.step) || 1), 1), AD_STEPS.length),
    methods: Array.isArray(draft.methods) ? draft.methods.filter((m) => typeof m === "string") : [],
  };
}
