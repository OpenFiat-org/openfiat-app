import type { ReferenceData } from "@openfiat/sdk";

import { nodeRpc } from "@/lib/node-rpc";

/**
 * Which payment rails are worth offering *here*, asked of the node.
 *
 * # Why a second call when `getReferenceData` already lists 84 methods
 *
 * Because a flat list of 84 is not an answer to "how do people get paid in
 * Kenya". It is the same information with the local knowledge removed:
 * M-Pesa and Pochi la Biashara sit between Alipay and Zelle, and a merchant
 * in Nairobi scrolls past both. `getPaymentMethods { country }` is the node
 * answering the question a merchant actually has — these first, the rest
 * after — and the ordering is the node's, not a heuristic invented here.
 *
 * The three lists mean three different things and are kept apart:
 *
 * - `suggested` — rails the node associates with this country. Kenya's are
 *   M-Pesa, Pochi la Biashara, Airtel Money, I&M Bank, Equity Bank, KCB;
 *   Brazil's are PIX and Mercado Pago; the UK's are SEPA and Faster
 *   Payments. Real per-country knowledge, and the reason this call exists.
 * - `merchant` — rails this merchant already advertises, when a merchant id
 *   is supplied. Read off their own live advertisements, so it is empty for
 *   somebody posting their first ad and must not be dressed up as anything
 *   else.
 * - `others` — everything else the node knows. Still offerable: a merchant
 *   in Kenya who genuinely settles in PIX is not doing anything wrong.
 *
 * # This one *is* a gate, and the SDK's note says otherwise
 *
 * `getReferenceData`'s doc comment says an interface "should let them type
 * one in rather than restricting them to what came back". For advertisements
 * that is not true of this node — see {@link CatalogMethod}, which records
 * what it actually accepts and how that was established. Nothing here may be
 * presented to a merchant as optional guidance when publishing depends on it.
 */

/**
 * One rail as the node describes it.
 *
 * # `id` is the identity and `name` is the label, and only one of them goes
 * on an advertisement
 *
 * This is the mint-versus-ticker distinction again, one field over, and this
 * app had it wrong: `AdvertisementCreate.payment_methods` carries the
 * catalogue **id** — `builtin:mpesa-kenya`, `builtin:pix` — and the node
 * refuses anything else. Verified against a running node: `"M-Pesa"`,
 * `"M-Pesa Kenya (Safaricom)"`, `"PIX"` and `"Bank Transfer"` are every one
 * of them rejected with `UNSUPPORTED_PAYMENT_METHOD`, and `"builtin:pix"` is
 * accepted. So an advertisement published by a build that sent display
 * names could not be published at all.
 *
 * The consequence for an interface: select ids, show names, and never store
 * a name anywhere a record expects an id.
 *
 * # And the node's list *is* a validation gate, whatever the SDK says
 *
 * `getReferenceData`'s own doc comment says an interface "should let them
 * type one in rather than restricting them to what came back". That is not
 * true of this node for advertisements: `"custom:whatever"` and
 * `"custom:My Own Rail"` are both refused. A free-text rail therefore
 * produces an advertisement the node will not accept, which is why the
 * picker no longer offers one.
 *
 * `id` and `countries` are absent from the SDK's `ReferencePaymentMethod`
 * even though the node sends both. They are declared here rather than
 * restated wholesale, so the shared fields still come from the SDK.
 */
export type CatalogMethod = ReferenceData["payment_methods"][number] & {
  /** The node's own key for this rail, and what an advertisement carries. */
  id: string;
  /** Country codes the node associates it with; absent for a global rail. */
  countries?: string[] | null;
};

export interface CountryMethods {
  /** The country code the node answered for; `null` when none was asked about. */
  country: string | null;
  suggested: CatalogMethod[];
  merchant: CatalogMethod[];
  others: CatalogMethod[];
}

/**
 * Loading, failed, or loaded — the same three-state contract as
 * {@link import("@/lib/reference").ReferenceState}, and for the same reason:
 * an empty picker rendered out of a failed request is a claim that the
 * network carries no payment methods.
 */
export type CountryMethodsState =
  | { status: "loading" }
  | { status: "error"; message: string; retry: () => void }
  | { status: "ready"; data: CountryMethods };

export function fetchCountryMethods(
  endpoint: string,
  country: string | null,
  merchant: string | null,
): Promise<CountryMethods> {
  return nodeRpc<CountryMethods>(endpoint, "getPaymentMethods", {
    // Omitted rather than sent as null: an absent country asks for the whole
    // catalogue, which is the honest request when nobody has chosen one.
    ...(country ? { country } : {}),
    ...(merchant ? { merchant } : {}),
  });
}

/*
 * `useCountryPaymentMethods` lives in
 * `components/use-country-methods.ts`, not here.
 *
 * Not a tidy-up: a module that calls `useState` can only be imported by
 * client components, and this one is reached from `lib/live-advertisements.ts`
 * — which server components use — to resolve rail ids into names. Next
 * refuses the import outright. So the hook is a client module and the data
 * layer beneath it is plain.
 */

/**
 * The catalogue flattened into the order a picker should show it, with the
 * group each rail came from kept alongside.
 *
 * The group survives because it is what a merchant is reading: "suggested
 * here" is the node's local knowledge and "everything else" is not, and a
 * single undifferentiated list throws that away — which is exactly what the
 * flat 84-entry list did.
 */
export interface GroupedMethod {
  method: CatalogMethod;
  group: "merchant" | "suggested" | "others";
}

export function groupedMethods(data: CountryMethods): GroupedMethod[] {
  const seen = new Set<string>();
  const out: GroupedMethod[] = [];
  const push = (methods: CatalogMethod[], group: GroupedMethod["group"]) => {
    for (const method of methods) {
      // By id, because the id is what identifies a rail — the same reason an
      // advertisement carries one. Two entries could in principle share a
      // display name; two entries sharing an id are the same rail.
      if (seen.has(method.id)) continue;
      seen.add(method.id);
      out.push({ method, group });
    }
  };
  push(data.merchant, "merchant");
  push(data.suggested, "suggested");
  push(data.others, "others");
  return out;
}

/**
 * Substring match over name and aliases, case-insensitive.
 *
 * Aliases are what makes this usable: "mpesa", "momo" and "f2f" are what
 * people type, and none of them is a method's name. The node ships them, so
 * searching them is free and searching only names would hide the rails it
 * went to the trouble of describing.
 */
export function searchGrouped(
  methods: readonly GroupedMethod[],
  query: string,
): GroupedMethod[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...methods];
  return methods.filter(
    ({ method }) =>
      method.name.toLowerCase().includes(q) ||
      method.aliases.some((alias) => alias.toLowerCase().includes(q)),
  );
}

// ── Resolving an id back to a name ────────────────────────────────────

/**
 * `id -> name`, per endpoint, fetched at most once.
 *
 * An advertisement carries ids, and a row that printed `builtin:pix` at a
 * taker would be showing them the node's internal key. This is the phrasebook
 * that turns it back into "PIX", and it is exactly parallel to
 * `nameForMint` — address in, name out, never the reverse.
 */
const nameCache = new Map<string, Promise<ReadonlyMap<string, string>>>();

export function fetchMethodNames(endpoint: string): Promise<ReadonlyMap<string, string>> {
  const existing = nameCache.get(endpoint);
  if (existing) return existing;
  const request = nodeRpc<{ payment_methods: CatalogMethod[] }>(endpoint, "getReferenceData")
    .then((data) => new Map(data.payment_methods.map((m) => [m.id, m.name])))
    .catch((error: unknown) => {
      // Dropped so a retry is a real retry, like `lib/reference.ts`.
      nameCache.delete(endpoint);
      throw error;
    });
  nameCache.set(endpoint, request);
  return request;
}

/**
 * What to show for a payment-method id.
 *
 * Falls back to the id itself, which is unhelpful and true: it is the value
 * the record actually carries, so a reader seeing `builtin:something` is
 * seeing the advertisement rather than a guess. Nothing here invents a name
 * for a rail the node did not describe.
 */
export function methodLabel(id: string, names: ReadonlyMap<string, string> | null): string {
  return names?.get(id) ?? id;
}
