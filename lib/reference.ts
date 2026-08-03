import { useCallback, useEffect, useState } from "react";
import { Client, reference, type ReferenceData } from "@openfiat/sdk";
import { nodeUrl } from "@/lib/node-endpoint";

/**
 * The countries, currencies, payment methods and token mints this app
 * offers, read from the node instead of compiled into the bundle.
 *
 * # What was wrong
 *
 * Every one of those lists was a constant here: 441 lines of countries in
 * `lib/data/countries.ts`, 84 payment methods in
 * `lib/data/payment-methods.ts`, a ticker list in `lib/pairs.ts`. Three
 * consequences, none hypothetical. A new payment method needed a release
 * of this app before anybody could advertise it. Two honest builds of two
 * interfaces could disagree about what the network supports, with no way
 * for a user to tell which was right. And the ticker list had drifted
 * far enough from the node's own mint table that `/sol/kes` could never
 * match an advertisement — the node calls that mint `wSOL`.
 *
 * The node now answers all of it in one call, so this app asks.
 *
 * # No fallback copy, on purpose
 *
 * There is deliberately no built-in list to fall back on when the node
 * cannot be reached. A fallback would put this app back in the business
 * of being the authority — quietly, at exactly the moment nobody could
 * check. {@link ReferenceState} therefore has a real `error` case, and a
 * control rendering it must say "could not load" rather than showing an
 * empty dropdown: an empty list reads as "the network supports nothing",
 * which is a claim about the network made out of a failure to reach one.
 *
 * # What this app still decides for itself
 *
 * Flags and default ordering. A flag emoji is derived from an ISO code
 * and is a rendering detail; which currencies float to the top of a
 * picker is this interface's opinion about its own users. Neither is a
 * fact about the network, so neither belongs in a protocol answer.
 */

export type { ReferenceData };

/**
 * Loading, failed, or loaded — and never a fourth state that looks like
 * loaded but is not. See the module comment on why "could not load" has
 * to be distinguishable from "loaded, and empty".
 */
export type ReferenceState =
  | { status: "loading" }
  | { status: "error"; message: string; retry: () => void }
  | { status: "ready"; data: ReferenceData };

/**
 * One in-flight or settled request per node URL.
 *
 * A single page can mount several controls that all need this — the ad
 * wizard has a currency combobox and a method picker on the same screen —
 * and each mounting its own fetch would ask the same node the same
 * question three times for one render.
 *
 * Keyed by endpoint so switching nodes in the picker genuinely re-asks
 * the new node rather than showing the previous one's answer.
 */
const inFlight = new Map<string, Promise<ReferenceData>>();

/**
 * The node's reference data for one endpoint, at most one request in
 * flight per endpoint.
 *
 * # Why the call is inside the promise
 *
 * Because not everything that can go wrong here is a rejection. The first
 * version built the request and attached `.catch` to it afterwards, which
 * handles a node that refuses the connection and nothing else: if
 * `reference.getReferenceData` throws *synchronously* — the SDK's
 * `import` condition resolving to a bundle that predates the export, so
 * `reference` is `undefined` — the TypeError is raised before the handler
 * exists. It escapes this function, escapes the effect that called it,
 * and never becomes the `error` state the module builds so carefully. The
 * pickers get an unhandled exception instead of "could not load".
 *
 * That is not a theoretical ordering nit; it is exactly how this failed.
 * Starting from `Promise.resolve()` puts the call itself inside the
 * chain, so a synchronous throw is a rejection like any other and reaches
 * the same place.
 */
export function fetchReferenceData(endpoint: string): Promise<ReferenceData> {
  const existing = inFlight.get(endpoint);
  if (existing) return existing;
  const request = Promise.resolve()
    .then(() => reference.getReferenceData(new Client({ endpoint, timeoutMs: 8_000 })))
    .catch((error: unknown) => {
      // Dropped so a retry is a real retry. Caching the rejection would
      // make every later mount fail instantly against a node that may
      // well have come back.
      inFlight.delete(endpoint);
      throw error;
    });
  inFlight.set(endpoint, request);
  return request;
}

/**
 * The node's reference data, for a client component.
 *
 * Starts in `loading` on both server and first client render, so there is
 * no hydration mismatch: `nodeUrl()` reads localStorage and cannot be
 * consulted until after mount.
 */
export function useReferenceData(): ReferenceState {
  const [state, setState] = useState<ReferenceState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    // Everything that can throw is inside the `try`, `nodeUrl()`
    // included — it parses a value out of localStorage that a previous
    // build wrote. A control that cannot reach its data has a state for
    // saying so; there is no failure here worth escaping the effect and
    // taking the page down with it.
    void (async () => {
      try {
        const data = await fetchReferenceData(nodeUrl());
        if (live) setState({ status: "ready", data });
      } catch (error: unknown) {
        if (live) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : "the node did not answer",
            retry,
          });
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [attempt, retry]);

  return state;
}

// ── Currencies ────────────────────────────────────────────────────────

export interface CurrencyOption {
  code: string;
  name: string;
  symbol: string;
  flag: string;
  /** Up to three countries that trade in it, for recognition in a list. */
  countries: string[];
}

/**
 * Currencies this deployment has picked out as the ones most of its users
 * want first.
 *
 * This app's opinion about its own audience, not a claim about where
 * liquidity is — a picker sorted purely alphabetically opens on AED for
 * everybody, which serves nobody. `CurrencyCombobox` takes an explicit
 * `priorityCodes` for callers that know something better, such as the
 * exchange, which floats the currencies the live book actually quotes.
 */
export const PREFERRED_CURRENCY_CODES = [
  "KES", "NGN", "USD", "EUR", "GBP", "INR", "BRL", "ZAR", "PHP", "IDR",
] as const;

/*
 * `flagEmoji`, `FLAG_SUBSTITUTE` and `flagForCountry` moved to
 * `lib/countries.ts`.
 *
 * Not a tidy-up: this module calls `useState` and `useEffect`, so anything
 * importing it is a client module, and the country pages — server
 * components that prerender — need a flag. Next refuses the import outright.
 * A flag is a pure function of a country code with no React in it, so it
 * belongs beside the other country rendering rather than behind a hook.
 */
import { flagEmoji, flagForCountry } from "@/lib/countries";

/**
 * Flags for currencies no single country owns. Without these the euro
 * would be drawn with whichever euro-using country happened to sort
 * first, which looks like a mistake because it is one.
 */
const SUPRANATIONAL_FLAG: Record<string, string> = {
  EUR: flagEmoji("EU"),
  USD: flagEmoji("US"),
  GBP: flagEmoji("GB"),
  XOF: flagEmoji("SN"),
  XAF: flagEmoji("CM"),
  XCD: flagEmoji("AG"),
  XPF: flagEmoji("PF"),
  AUD: flagEmoji("AU"),
  NZD: flagEmoji("NZ"),
};

/**
 * The currency picker's rows, built from the node's own two lists.
 *
 * A country contributes every currency it trades in, not only its
 * primary one. Otherwise a dollarised economy's USD book — frequently
 * the larger of its two — never appears under that country's name when
 * somebody searches for the country.
 */
export function currencyOptions(data: ReferenceData): CurrencyOption[] {
  const described = new Map(data.currencies.map((c) => [c.code, c]));

  /**
   * Whose flag to draw, and it has to be a country the currency belongs
   * to rather than merely one that spends it. Zimbabwe trades in rand
   * alongside its own currency, so taking whichever country mentioned
   * ZAR first would risk drawing the rand under a Zimbabwean flag. A
   * country where the currency is primary wins; one that only ever
   * appears as somebody's alternate falls back to that somebody.
   */
  const issuer = new Map<string, string>();
  for (const country of data.countries) {
    for (const alt of country.alt_currencies) {
      if (!issuer.has(alt)) issuer.set(alt, country.code);
    }
  }
  for (const country of data.countries) issuer.set(country.currency, country.code);

  const byCode = new Map<string, CurrencyOption>();
  const add = (code: string, countryName: string) => {
    const option = byCode.get(code);
    if (option) {
      // Capped at three: the row exists to make a currency recognisable
      // at a glance, and twenty country names recognise nothing.
      if (option.countries.length < 3 && !option.countries.includes(countryName)) {
        option.countries.push(countryName);
      }
      return;
    }
    const currency = described.get(code);
    byCode.set(code, {
      code,
      // A code the node listed against a country but did not describe
      // stands for itself rather than being dropped — a currency with no
      // name is still one somebody trades in.
      name: currency?.name ?? code,
      symbol: currency?.symbol ?? code,
      flag: SUPRANATIONAL_FLAG[code] ?? flagForCountry(issuer.get(code) ?? ""),
      countries: [countryName],
    });
  };

  for (const country of data.countries) {
    add(country.currency, country.name);
    for (const alt of country.alt_currencies) add(alt, country.name);
  }

  const preferred = PREFERRED_CURRENCY_CODES as readonly string[];
  return [...byCode.values()].sort((a, b) => {
    const pa = preferred.indexOf(a.code);
    const pb = preferred.indexOf(b.code);
    if (pa !== -1 || pb !== -1) return (pa === -1 ? 999 : pa) - (pb === -1 ? 999 : pb);
    return a.code.localeCompare(b.code);
  });
}

// ── Payment methods ───────────────────────────────────────────────────

/*
 * `searchPaymentMethods` and `isSuggestedMethod` used to live here, over
 * `getReferenceData`'s flat 84-entry list.
 *
 * They have moved to `lib/payment-catalog.ts` and become `searchGrouped`,
 * because the flat list turned out to be the wrong input. It is the node's
 * whole catalogue in no particular order, so a merchant in Nairobi scrolled
 * past Alipay and Zelle to reach M-Pesa. `getPaymentMethods { country }`
 * answers with that country's own rails first, and the group a rail came
 * from is part of what the picker shows — which a function returning bare
 * strings cannot carry.
 */

// ── Mints ─────────────────────────────────────────────────────────────

/**
 * What this node calls a mint, by its base58 address.
 *
 * Address in, name out, never the reverse. A ticker is a nickname: it is
 * cluster-dependent, it is not unique, and no record on this protocol
 * carries one — an advertisement carries a mint address and the node
 * resolves the name at the edge. Matching on a ticker this app chose is
 * exactly how `/sol/kes` came to be a page that could never show an
 * advertisement.
 *
 * `undefined` means this node has no name for the address, which is an
 * ordinary answer and not an error. Show the address.
 */
export function mintFor(data: ReferenceData, address: string) {
  return data.mints.find((m) => m.mint === address);
}

/**
 * A token as a picker offers it.
 *
 * The node's own row, not a shape this app builds — deliberately. A record
 * pairing a mint address with a name is exactly what
 * `tests/exchange-assets.test.tsx` forbids, and it is right to: a name this
 * app attached to an address is how a merchant deposits into the wrong
 * token. Aliasing the node's row means the pairing is the node's assertion
 * and this app is only passing it along, with nothing of its own to drift.
 *
 * `decimals` is load-bearing rather than decoration. Every amount the
 * protocol carries is base units plus decimals, so a screen that assumed six
 * for a mint that uses nine would publish limits a thousand times smaller
 * than the ones typed, and nothing downstream would notice. It used to be
 * read off the merchant's own liquidity vault, which meant a merchant could
 * not post an advertisement until they had opened one.
 */
export type AssetOption = ReferenceData["mints"][number];

/**
 * The tokens a picker may offer, from the node's mint table.
 *
 * A mint with no symbol is dropped. It is a real answer on the node's side —
 * an address with no nickname — but this list exists so that a person can
 * choose a token by name, and a row with no name is a row that can only be
 * chosen by its address, which is the thing being removed.
 *
 * Not a permission list. What can actually be escrowed is decided by the
 * escrow program's on-chain allowlist, which governance can change, and the
 * two sets are not guaranteed equal in either direction.
 */
export function assetOptions(data: Pick<ReferenceData, "mints">): AssetOption[] {
  return data.mints.filter((mint) => !!mint.symbol);
}
