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

/** Regional-indicator pair for an ISO 3166-1 alpha-2 code. */
function flagEmoji(iso2: string): string {
  return String.fromCodePoint(
    ...iso2
      .toUpperCase()
      .split("")
      .map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65),
  );
}

/**
 * Territories with no flag of their own in Unicode, or none that renders.
 *
 * Presentation, and it stays in this app: the node's table carries codes
 * and names, and "which flag to draw for Somaliland" is not a protocol
 * question. The choices here are the ones a person would recognise —
 * Somaliland shows Somalia's, Northern Cyprus Türkiye's, Transnistria
 * Moldova's — rather than a blank square that reads as a broken font.
 */
const FLAG_SUBSTITUTE: Record<string, string> = { XS: "SO", XNC: "TR", XTR: "MD" };

/** Flag for a country code, or a neutral flag when none can be derived. */
export function flagForCountry(code: string): string {
  const iso = FLAG_SUBSTITUTE[code.toUpperCase()] ?? code.toUpperCase();
  return /^[A-Z]{2}$/.test(iso) ? flagEmoji(iso) : "🏳️";
}

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

/** A payment method the node suggested, as the picker needs it. */
export type SuggestedMethod = ReferenceData["payment_methods"][number];

/**
 * Substring match over name and aliases, case-insensitive, with
 * locally-added methods appended after the node's own.
 *
 * `custom` exists because the node's list is a suggestion and not a
 * permission — a merchant who trades a rail no build has heard of has to
 * be able to name it, so the picker lets them type one and this keeps it
 * findable afterwards.
 */
export function searchPaymentMethods(
  methods: readonly SuggestedMethod[],
  query: string,
  custom: readonly string[] = [],
  cap = 8,
): string[] {
  const suggested = methods.map((m) => m.name);
  const all = [...suggested, ...custom.filter((c) => !suggested.includes(c))];
  const q = query.trim().toLowerCase();
  if (!q) return all.slice(0, cap);
  const aliasHit = new Set(
    methods
      .filter(
        (m) => m.name.toLowerCase().includes(q) || m.aliases.some((a) => a.toLowerCase().includes(q)),
      )
      .map((m) => m.name),
  );
  return all.filter((name) => aliasHit.has(name) || name.toLowerCase().includes(q)).slice(0, cap);
}

/** Whether the node named this method, as opposed to a user having added it. */
export function isSuggestedMethod(
  methods: readonly SuggestedMethod[],
  name: string,
): boolean {
  return methods.some((m) => m.name === name);
}

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
