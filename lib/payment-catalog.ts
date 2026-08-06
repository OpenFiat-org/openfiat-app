import bs58 from "bs58";
import type { PaymentMethodCategory, ReferenceData } from "@openfiat/sdk";

import { peerIdForPublicKey, sendSignedEvent, signPayload } from "@/lib/arbitration";
import type { RefusalTranslator } from "@/lib/node-refusal";
import { nodeRpc } from "@/lib/node-rpc";
import { peerIdParam } from "@/lib/wallet-param";
import type { SolanaProvider } from "@/lib/wallet-connection";

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
 * - `merchant` — the rails this merchant has **defined for themselves**,
 *   when a merchant id is supplied. Signed records the node holds and
 *   gossips, not a guess about the ads they happen to have posted. Empty
 *   for a merchant who has defined none, and must not be dressed up as
 *   anything else.
 * - `others` — everything else the node knows. Still offerable: a merchant
 *   in Kenya who genuinely settles in PIX is not doing anything wrong.
 *
 * # The catalogue is a gate, and there is a door beside it
 *
 * `getReferenceData`'s doc comment says an interface "should let them type
 * one in rather than restricting them to what came back". Taken literally
 * that is wrong for advertisements — a made-up id is refused, and this app
 * once shipped a control that produced exactly that failure two screens
 * later. Deleting the control was right; leaving it deleted was not, because
 * the fix was never "no custom rails", it was the id format.
 *
 * {@link defineMerchantMethod} is the door. A merchant signs a definition,
 * the node stores and gossips it, and it comes back under `merchant` with an
 * id in the `<peer id>:<digest>` form an advertisement accepts. So a
 * merchant in a country this build has nothing listed for is not stuck: they
 * write the rail down once and it is a real, replicated record afterwards.
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
 * # An id has exactly two namespaces, and `custom:` is not one of them
 *
 * `"custom:whatever"` and `"custom:My Own Rail"` are both refused, which is
 * what the agent who removed this app's "add your own rail" control found.
 * The conclusion drawn — that the node allows no custom rails — was one
 * namespace too broad. The node takes:
 *
 * - `builtin:<slug>` — a rail compiled into it, `builtin:pix`;
 * - `<merchant peer id>:<16 lowercase hex>` — a definition that merchant
 *   published and signed, e.g. `12D3KooW…:9f3c1a20b4d7e6f8`.
 *
 * `custom:` is neither, so it parses as "a peer id called custom", fails the
 * base58 shape, and is rejected. See {@link defineMerchantMethod} for how
 * the second namespace is actually reached.
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

/**
 * The picker read.
 *
 * `merchant` is a base58 PeerId and goes out as `wallet`, base64 of that
 * id's bytes. Both halves of that were wrong here: the node's parameter is
 * named `wallet` and it decodes base64, so a `merchant` key was dropped on
 * the floor by `serde`'s `#[serde(default)]` and every answer came back with
 * an empty `merchant` array. That failure is invisible — an empty list of
 * your own rails is exactly what a merchant who has defined none sees — and
 * it is the same trap `lib/wallet-param.ts` was written for, one parameter
 * over.
 */
export function fetchCountryMethods(
  endpoint: string,
  country: string | null,
  merchant: string | null,
): Promise<CountryMethods> {
  return nodeRpc<CountryMethods>(endpoint, "getPaymentMethods", {
    // Omitted rather than sent as null: an absent country asks for the whole
    // catalogue, which is the honest request when nobody has chosen one.
    ...(country ? { country } : {}),
    ...(merchant ? { wallet: peerIdParam(merchant) } : {}),
  });
}

// ── Defining a rail the node has never heard of ───────────────────────

/**
 * Publishes a merchant's own payment method and returns its id.
 *
 * # What comes back, and why it cannot be edited
 *
 * The id is `<peer id>:<digest>`, and the digest is of the definition
 * itself. So the same definition published twice is the same id and a
 * no-op, and a definition with one word changed is a *different* id that no
 * existing advertisement references. There is no update call and no delete
 * call anywhere on this surface, because there is nothing an edit could land
 * on — an interface offering an edit button would be silently forking the
 * rail and leaving every ad that chose it pointing at the old one.
 *
 * Callers must say that in the UI rather than discovering it. See
 * `components/ads/method-picker.tsx`.
 *
 * # Scope
 *
 * Selectable only by the wallet that signed it; readable by everyone,
 * because it replicates by gossip and a counterparty on another node has to
 * be able to resolve what an advertisement means. Putting somebody else's
 * definition on your own ad is refused by the node.
 *
 * # The signed bytes
 *
 * A raw Ed25519 signature over the canonical JSON of `method`, whose key
 * order is the Rust struct's field order — `merchant`, then
 * `merchant_public_key`, then `name`, then `category`. Reordering the object
 * literal below changes the bytes and the signature stops verifying.
 */
export async function defineMerchantMethod(
  endpoint: string,
  signer: SolanaProvider,
  publicKey: Uint8Array,
  name: string,
  category: PaymentMethodCategory,
): Promise<string> {
  const method = {
    merchant: peerIdForPublicKey(publicKey),
    merchant_public_key: bs58.encode(publicKey),
    name,
    category,
  };
  const signature = await signPayload(signer, method);
  const id = await sendSignedEvent(endpoint, "sendPaymentMethodDefine", { method, signature });
  return String(id);
}

/** Longest name the node will store — `openfiat_taxonomy::MAX_NAME_CHARS`. */
export const MAX_METHOD_NAME_CHARS = 64;

/**
 * Why a name cannot be published, checked here before the wallet is asked
 * to sign, or `null` if nothing local objects.
 *
 * # What this does and pointedly does not duplicate
 *
 * Only the *renderability* rules, which `docs/payment-methods.md` states
 * verbatim as the client contract: a bounded length, no stray or doubled
 * spaces, no whitespace that is not `U+0020`, and nothing invisible or
 * bidirectional. They are worth checking twice because the alternative is a
 * wallet signature prompt that ends in a refusal — the merchant pays for the
 * round trip with a hardware confirmation.
 *
 * It does **not** reimplement the look-alike check. That folds a name
 * through a confusable table against every catalogue name and alias, and a
 * second copy here would drift from the node's the first time a rail is
 * added — leaving this app confidently telling a merchant their name is fine
 * while the node refuses it, or worse, the reverse. The node owns that
 * question; {@link explainDefineRefusal} translates its answer.
 */
export function nameProblem(name: string): string | null {
  const length = [...name].length;
  if (length === 0) return "Give the rail a name.";
  if (length > MAX_METHOD_NAME_CHARS) {
    return `Names are at most ${MAX_METHOD_NAME_CHARS} characters — this is ${length}.`;
  }
  if (name !== name.trim() || name.includes("  ")) {
    return "No leading, trailing or doubled spaces — the node refuses them rather than trimming, so the name it stores is the name you signed.";
  }
  // Any whitespace other than a plain space: a no-break space and an
  // ideographic space are the same picture and a different string.
  if (/[\s]/.test(name.replace(/ /g, ""))) {
    return "Only ordinary spaces — a no-break or ideographic space looks identical and is not the same name.";
  }
  // `Cc` is the control characters, `Cf` the format ones — which is every
  // zero-width space and joiner, the soft hyphen, the bidi overrides and
  // isolates, the BOM and the Unicode tag block, in one class. The braille
  // blank is the one hazard outside both, so it is named.
  if (/[\p{Cc}\p{Cf}⠀]/u.test(name)) {
    return "That name carries characters that render as nothing, which is how one name is made to look like another.";
  }
  if (!/[\p{L}\p{N}]/u.test(name)) return "A name needs at least one letter or digit.";
  return null;
}

/**
 * What the node's refusal of a definition means, in the merchant's terms.
 *
 * # One code covers two refusals, and the message says so
 *
 * `MALFORMED_DEFINITION` and `IMPERSONATES_KNOWN_METHOD` both map to
 * `UNSUPPORTED_PAYMENT_METHOD` (3005) on the wire, so this cannot tell them
 * apart and does not pretend to. {@link nameProblem} has already refused the
 * unrenderable ones locally, which makes the look-alike case overwhelmingly
 * the likely one — but "overwhelmingly likely" is not "known", so both are
 * named.
 *
 * The look-alike half is worth spelling out rather than reporting as a
 * spelling complaint. The node folds a name to the shape an eye sees — case,
 * accents, Cyrillic and Greek look-alikes, fullwidth forms, `1` for `i`, `0`
 * for `o`, separators dropped — so a merchant told only "rejected" retypes
 * the same name with a hyphen in it and is refused again.
 *
 * Anything unrecognised is passed through rather than replaced with a
 * generic apology, the same rule `explainRefusal` follows for ads.
 */
export function explainDefineRefusal(t: RefusalTranslator, message: string): string {
  if (message.includes("UNSUPPORTED_PAYMENT_METHOD")) return t("define.unsupported");
  if (message.includes("PAYMENT_METHOD_LIMIT_REACHED")) return t("define.limitReached");
  if (message.includes("INVALID_SIGNATURE") || message.includes("INVALID_IDENTITY_CLAIM")) {
    return t("define.signature");
  }
  return message;
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
 *
 * **This covers `builtin:` rails only.** `getReferenceData.payment_methods`
 * is `openfiat_taxonomy::catalog()` relayed — the rails compiled into the
 * node — and a merchant-defined `<peer id>:<digest>` is not in it. See
 * {@link methodNamesFor}, which is what a caller holding real
 * advertisement ids should use.
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
 * One id resolved by asking the node about that id alone, or `null`.
 *
 * Cached per endpoint and id, and only when it succeeds. A merchant's
 * definition is immutable by construction — the id is a digest *of* the
 * definition, so the same id can never name a different rail — which makes
 * a hit cacheable for the life of the page with no staleness to reason
 * about. A miss is not cached: `null` means this node has not received the
 * definition yet, and gossip may well deliver it a moment later.
 */
const singleNameCache = new Map<string, Promise<string | null>>();

function resolveMethodName(endpoint: string, id: string): Promise<string | null> {
  const key = `${endpoint} ${id}`;
  const existing = singleNameCache.get(key);
  if (existing) return existing;
  const request = nodeRpc<{ name: string } | null>(endpoint, "getPaymentMethod", { id })
    .then((method) => {
      if (!method) singleNameCache.delete(key);
      return method?.name ?? null;
    })
    .catch(() => {
      singleNameCache.delete(key);
      // A name is decoration. Losing one must not cost a reader the row it
      // sits on, so this resolves rather than rejects and the id shows
      // through — see `methodLabel`.
      return null;
    });
  singleNameCache.set(key, request);
  return request;
}

/**
 * Names for exactly the ids a caller is holding, merchant-defined ones
 * included.
 *
 * # The gap this closes
 *
 * A merchant may define their own rail — {@link defineMerchantMethod} — and
 * put it on a public advertisement. Every taker in the book then sees it.
 * But {@link fetchMethodNames} builds its phrasebook from
 * `getReferenceData`, which relays only the rails compiled into the node, so
 * a merchant-defined id had no entry and {@link methodLabel} fell through to
 * printing the id: `12D3KooWK9hQ7…:9f3c1a20b4d7e6f8` where "Sacco Standing
 * Order" belonged. Truthful, and unreadable — and it appeared the day
 * merchant-defined rails shipped, on somebody else's screen rather than the
 * merchant's own, which is why nothing caught it.
 *
 * `getPaymentMethod { id }` is the node's answer for exactly this. It is
 * asked once per unresolved id, in parallel, and never for a `builtin:` one
 * the bulk phrasebook already covers.
 *
 * # Nothing here fails loudly, on purpose
 *
 * Every figure on an advertisement — price, limits, liquidity — comes from
 * `getAdvertisements` and is already in hand by the time this runs. A rail
 * that cannot be named is a cosmetic loss, so an unreachable node leaves the
 * ids showing rather than emptying the book. That is the record's own value,
 * not a guess about it.
 */
export async function methodNamesFor(
  endpoint: string,
  ids: Iterable<string>,
): Promise<ReadonlyMap<string, string>> {
  const wanted = new Set(ids);
  const names = new Map<string, string>();

  try {
    for (const [id, name] of await fetchMethodNames(endpoint)) {
      if (wanted.has(id)) names.set(id, name);
    }
  } catch {
    // The bulk read is a shortcut, not a prerequisite: every id below can
    // still be resolved one at a time.
  }

  const unresolved = [...wanted].filter((id) => !names.has(id));
  const resolved = await Promise.all(
    unresolved.map(async (id) => [id, await resolveMethodName(endpoint, id)] as const),
  );
  for (const [id, name] of resolved) {
    if (name !== null) names.set(id, name);
  }
  return names;
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
