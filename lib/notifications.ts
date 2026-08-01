import { peerIdForPublicKey, sendSignedEvent, signPayload } from "@/lib/arbitration";
import { nodeUrl } from "@/lib/node-endpoint";
import { walletParam } from "@/lib/wallet-param";
import type { SolanaProvider } from "@/lib/wallet-connection";

/**
 * A wallet's notification subscription (OFS-6000), as the protocol records it.
 *
 * # What this replaced, and why the old shape was wrong twice
 *
 * The settings screen showed four toggles — Email, SMS, Telegram, Push —
 * held in `useState`, persisting nowhere, under a footer admitting
 * "Preferences are simulated and reset on reload". Each row's hint used to
 * end "· via PingRelay", "· via NotifyHive", "· via TgramBridge", "· via
 * PushSignal": four notification providers that do not exist in any spec or
 * registry, named as though they were the partners carrying a merchant's
 * dispute alerts. Those strings had already been removed; the toggles had
 * not.
 *
 * The deeper problem is that channels are the wrong axis. A subscription is
 * expressed against **categories** — Trading, Marketplace, Disputes,
 * Governance, Infrastructure — and that is the whole of what a wallet signs.
 * Which channel a message arrives on is a property of a `destination`, and a
 * destination is sealed to one registered notification gateway. So a screen
 * offering four channel switches was offering control over something the
 * record does not carry, while offering none over what it does.
 *
 * # Destinations are not writable from here, and the screen says so
 *
 * Adding one means picking a registered `ServiceType::Notifications`
 * provider out of the registry and sealing an address to that gateway's key,
 * so only it can read where to deliver. This app builds no sealed box yet.
 * The consequence is concrete and stated on screen rather than hidden: a
 * subscription with no destinations enables categories that have nowhere to
 * be delivered. Publishing it is still meaningful — it is the wallet's
 * signed statement of what it wants — but nothing is sent anywhere, and a
 * reader is told that rather than left to assume an email is coming.
 */

/** OFS-6000 §9. The five categories a subscription is expressed against. */
export const NOTIFICATION_CATEGORIES = [
  "Trading",
  "Marketplace",
  "Disputes",
  "Governance",
  "Infrastructure",
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/**
 * What each category actually covers, from OFS-6000 §10's triggers.
 *
 * Written from the trigger list in `crates/notifications`, not invented: a
 * category whose description does not match what fires it is a setting that
 * silences the wrong thing.
 */
export const CATEGORY_NOTE: Record<NotificationCategory, string> = {
  Trading:
    "Reservation created or expiring, payment submitted, settlement approved, escrow released, trade completed.",
  Marketplace: "Your advertisement disabled, and reputation updates.",
  Disputes: "Evidence requested, and a resolution issued.",
  Governance: "A proposal published, voting started, a proposal activated.",
  Infrastructure: "Snapshot available, node maintenance, a provider going offline.",
};

export interface LiveSubscription {
  enabled: NotificationCategory[];
  /**
   * Categories the node reported that this build cannot name.
   *
   * Kept, not discarded, because an update replaces the whole list: writing
   * back only the categories this build understands would unsubscribe the
   * wallet from something another client had turned on — a silent change to
   * a person's alerts, made by a build that merely did not recognise a word.
   * They are not drawn as switches, because a switch with no label is worse
   * than none.
   */
  unknown: string[];
  /**
   * Sealed delivery destinations. Always empty as read by this app today —
   * see the module comment. Carried rather than dropped so the screen can
   * say "enabled, but nowhere to deliver" instead of implying delivery.
   */
  destinations: number;
  updatedAt: number;
}

interface RawSubscription {
  enabled_categories: string[];
  destinations?: unknown[];
  updated_at: number;
}

function isCategory(value: string): value is NotificationCategory {
  return (NOTIFICATION_CATEGORIES as readonly string[]).includes(value);
}

/** Exported for tests: the wire carries strings, and this splits them. */
export function toLiveSubscription(raw: RawSubscription): LiveSubscription {
  return {
    // Split rather than filtered: unrecognised categories are not drawn,
    // but they are carried back on write. See `unknown` above.
    enabled: (raw.enabled_categories ?? []).filter(isCategory),
    unknown: (raw.enabled_categories ?? []).filter((value) => !isCategory(value)),
    destinations: (raw.destinations ?? []).length,
    updatedAt: raw.updated_at ?? 0,
  };
}

/**
 * This wallet's subscription, or `null` if it has never published one.
 *
 * `null` is an ordinary answer and distinct from "every category off": a
 * wallet that has published nothing has made no statement at all, and the
 * screen says so rather than drawing five switches in the off position.
 */
export async function fetchSubscription(wallet: string): Promise<LiveSubscription | null> {
  const res = await fetch(`${nodeUrl().replace(/\/$/, "")}/rpc`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getSubscription",
      params: { wallet: walletParam(wallet) },
    }),
  });
  const body = (await res.json()) as {
    result?: RawSubscription | null;
    error?: { message: string };
  };
  if (body.error) throw new Error(body.error.message);
  return body.result ? toLiveSubscription(body.result) : null;
}

/**
 * Publishes this wallet's category selection, signed by the wallet.
 *
 * `unknownCategories` carries through any category the node reported that
 * this build cannot name. A subscription update replaces the whole list, so
 * dropping them would unsubscribe the wallet from something another client
 * had turned on — a silent change to a person's alerts made by a build that
 * merely did not recognise the word.
 *
 * Key order must match the Rust `SubscriptionUpdate` struct exactly: the
 * node verifies the signature over `JSON.stringify` of this object, so a
 * reordered field produces a plausible payload that fails to verify.
 */
export async function publishSubscription(
  provider: SolanaProvider,
  publicKey: Uint8Array,
  enabled: NotificationCategory[],
  unknownCategories: string[] = [],
): Promise<void> {
  const update = {
    wallet: peerIdForPublicKey(publicKey),
    wallet_public_key: Array.from(publicKey),
    enabled_categories: [...enabled, ...unknownCategories],
    // Left empty, and not omitted: the field is `#[serde(default)]` on the
    // Rust side, but an update that dropped it would still be replacing a
    // wallet's destinations with nothing. Empty is what this app can
    // honestly assert, because it can build no sealed destination.
    destinations: [],
    timestamp: Date.now(),
  };

  const signature = await signPayload(provider, update);
  await sendSignedEvent(nodeUrl(), "sendSubscriptionUpdate", { update, signature });
}
