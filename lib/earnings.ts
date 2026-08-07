import {
  Client,
  providers,
  type Amount,
  type EarningsChallenge,
  type ProviderEarnings,
  type ServicePricing,
  type ServiceRecord,
  type ServiceType,
} from "@openfiat/sdk";
import type { SolanaProvider } from "@/lib/wallet-connection";

/**
 * Reading a service provider's own earnings statement (OFS-4100 §9.5).
 *
 * There is no provider account and no login. A provider proves control of a
 * Service ID by signing a challenge with the key that Service ID was
 * registered under — the same rule that governs health updates, withdrawals
 * and arbitration. The connected Solana wallet is that key: both are Ed25519,
 * and the node verifies a raw signature over the challenge's bytes.
 *
 * # Every statement reads zero
 *
 * Nothing credits the ledger yet, for any role. That is the single most
 * important thing this module's consumers must convey, because a bare
 * "0.00" is indistinguishable from a broken integration. The per-role
 * payment models below exist so the page can say *why* zero is the correct
 * answer for this particular service, rather than implying revenue is
 * imminent for every role equally.
 */

/** How a provider role gets paid, and how settled that is. */
export type PaymentStatus =
  /** Mechanism and amount are decided; the code to pay it is not written. */
  | "defined"
  /** The protocol will pay this role, but the formula is still being designed. */
  | "intended"
  /** Who pays is settled; the metering that would count the work is not built. */
  | "awaiting-meter"
  /** No provider payment has been specified either way. */
  | "unspecified"
  /** Not a paid provider role — compensated as infrastructure, if at all. */
  | "not-applicable";

/** Which provider role a registration falls under. Keys the payment-model copy. */
export type ProviderRole = "oracle" | "risk" | "snapshot" | "notification" | "infrastructure";

export interface PaymentModel {
  status: PaymentStatus;
  /** The role, keyed to the per-role payment copy resolved at the UI layer. */
  role: ProviderRole;
  /**
   * Whether this role has a prerequisite that does not exist in code yet.
   * Rendered as a warning, because a provider could otherwise register and
   * operate believing they are eligible. Only the risk role has one.
   */
  blocked: boolean;
}

/**
 * Per-role payment status.
 *
 * The prose that explains each role — what a *consumer* pays versus what a
 * *provider* receives, which are deliberately not the same question — lives in
 * the message catalogue under `earnings.model.<role>`, so it translates. This
 * only classifies; conflating consumer and provider is how you end up telling
 * an oracle provider they earn nothing because reads are free.
 */
const MODELS: Record<ProviderRole, PaymentModel> = {
  oracle: { status: "intended", role: "oracle", blocked: false },
  risk: { status: "defined", role: "risk", blocked: true },
  snapshot: { status: "unspecified", role: "snapshot", blocked: false },
  notification: { status: "awaiting-meter", role: "notification", blocked: false },
  infrastructure: { status: "not-applicable", role: "infrastructure", blocked: false },
};

/**
 * Classify a registration's service type. Falls back to the infrastructure
 * model rather than throwing: an unrecognised variant means the SDK's type
 * union has grown, and refusing to render is worse than saying "not billed
 * through this statement".
 */
export function paymentModelFor(type: ServiceType): PaymentModel {
  if ("MarketData" in type) return MODELS.oracle;
  if ("Security" in type) return MODELS.risk;
  if ("Notifications" in type) return MODELS.notification;
  if ("Infrastructure" in type && type.Infrastructure === "SnapshotProvider") return MODELS.snapshot;
  return MODELS.infrastructure;
}

/** Human label for a service type, e.g. `MarketData:FxOracle`. */
export function serviceTypeLabel(type: ServiceType): string {
  const entry = Object.entries(type)[0];
  return entry ? `${entry[0]}:${entry[1]}` : "Unknown";
}

/**
 * Render a base-units amount at its own precision. Never a float in transit —
 * the division happens only at the point of display.
 */
export function formatAmount(amount: Amount): string {
  const value = amount.base_units / 10 ** amount.decimals;
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: amount.decimals,
  });
}

/** A translator that resolves `billingUnit.<Request|Trade|Month>` in the
 *  caller's own namespace (providers or earnings both carry the sub-object). */
type BillingT = (key: string) => string;

/**
 * Format a declared price. Returns null for an absent price, which already
 * means free — there is no "free" sentinel in the protocol and inventing a
 * display one here would reintroduce the ambiguity the typed price removed.
 */
export function formatPricing(t: BillingT, pricing: ServicePricing | null): string | null {
  if (!pricing) return null;
  return `${formatAmount(pricing.amount)} ${shortMint(pricing.token_mint)} ${t(`billingUnit.${pricing.unit}`)}`;
}

/** Mints are 32-44 base58 characters; show enough to recognise one. */
export function shortMint(mint: string): string {
  return mint.length > 12 ? `${mint.slice(0, 4)}…${mint.slice(-4)}` : mint;
}

/** Why an earnings read failed, in terms a provider can act on. */
export type EarningsFailure =
  | "no-such-service"
  | "challenge-expired"
  | "challenge-spent"
  | "wrong-key"
  | "unreachable"
  | "wallet-cannot-sign";

export class EarningsError extends Error {
  readonly kind: EarningsFailure;
  constructor(kind: EarningsFailure, message: string) {
    super(message);
    this.kind = kind;
    this.name = "EarningsError";
  }
}

/**
 * Map a node error onto a failure a provider can do something about.
 *
 * `step` matters: the registry maps both `ServiceNotFound` and
 * `UnknownChallenge` to RESOURCE_NOT_FOUND, so the code alone is ambiguous.
 * By the time we present a signature the challenge step has already proved
 * the service exists, which makes RESOURCE_NOT_FOUND at that point a spent
 * or superseded nonce.
 */
export function classifyFailure(message: string, step: "challenge" | "read"): EarningsFailure {
  if (message.includes("RESOURCE_NOT_FOUND")) {
    return step === "challenge" ? "no-such-service" : "challenge-spent";
  }
  if (message.includes("INVALID_REQUEST")) return "challenge-expired";
  if (message.includes("INVALID_SIGNATURE")) return "wrong-key";
  return "unreachable";
}

export const FAILURE_MESSAGE: Record<EarningsFailure, string> = {
  "no-such-service":
    "This node has no service registered under that id. Check the Service ID, or point at a node that has seen your registration.",
  "challenge-expired":
    "The challenge expired before it was signed — it is only valid for five minutes. Nothing is wrong with your key; try again and approve the wallet prompt promptly.",
  "challenge-spent":
    "That challenge was already used or replaced. Each one is single-use, and opening this page twice invalidates the older challenge. Try again.",
  "wrong-key":
    "The connected wallet is not the key this service was registered with. Statements are readable only by the registrant.",
  unreachable: "Could not reach the selected node.",
  "wallet-cannot-sign":
    "This wallet does not support message signing, which is how you prove you control the service.",
};

/** A statement plus the registration it was read against. */
export interface EarningsResult {
  record: ServiceRecord;
  earnings: ProviderEarnings;
}

function client(endpoint: string): Client {
  return new Client({ endpoint, timeoutMs: 8_000 });
}

/** Look up a registration without proving anything — used to show the form's context. */
export async function fetchServiceRecord(
  endpoint: string,
  serviceId: string,
): Promise<ServiceRecord | null> {
  try {
    return await providers.getProvider(client(endpoint), serviceId);
  } catch {
    throw new EarningsError("unreachable", FAILURE_MESSAGE.unreachable);
  }
}

/**
 * The full two-step read: ask for a challenge, sign its bytes with the
 * connected wallet, present the signature.
 *
 * The SDK's own `getProviderEarnings` does both steps too, but signs with a
 * `Keypair` the SDK holds. A browser wallet never exposes its key, so this
 * uses the SDK's separately-exported challenge and byte-derivation helpers
 * and does the signing through the wallet — the same split
 * `lib/arbitration.ts` uses.
 */
export async function readEarnings(
  endpoint: string,
  serviceId: string,
  wallet: SolanaProvider,
): Promise<EarningsResult> {
  if (!wallet.signMessage) {
    throw new EarningsError("wallet-cannot-sign", FAILURE_MESSAGE["wallet-cannot-sign"]);
  }
  const rpc = client(endpoint);

  const record = await providers.getProvider(rpc, serviceId).catch((err: unknown) => {
    const kind = classifyFailure(err instanceof Error ? err.message : "", "challenge");
    throw new EarningsError(kind, FAILURE_MESSAGE[kind]);
  });
  if (!record) {
    throw new EarningsError("no-such-service", FAILURE_MESSAGE["no-such-service"]);
  }

  let challenge: EarningsChallenge;
  try {
    challenge = await providers.getProviderEarningsChallenge(rpc, serviceId);
  } catch (err) {
    const kind = classifyFailure(err instanceof Error ? err.message : "", "challenge");
    throw new EarningsError(kind, FAILURE_MESSAGE[kind]);
  }

  const { signature } = await wallet.signMessage(providers.earningsChallengeBytes(challenge));

  try {
    const earnings = await rpc.call<
      { id: string; nonce: string; signature: string },
      ProviderEarnings
    >("getProviderEarnings", {
      id: serviceId,
      nonce: challenge.nonce,
      signature: base64(signature),
    });
    return { record, earnings };
  } catch (err) {
    const kind = classifyFailure(err instanceof Error ? err.message : "", "read");
    throw new EarningsError(kind, FAILURE_MESSAGE[kind]);
  }
}

/**
 * Base64 for the browser. The SDK's own helper uses Node's `Buffer`, which
 * is not available here.
 */
export function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
