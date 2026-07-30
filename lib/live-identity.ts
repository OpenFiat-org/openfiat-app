import { nodeUrl } from "@/lib/node-endpoint";
import { walletParam } from "@/lib/wallet-param";

/**
 * A wallet's identity claims, as the selected node's `IdentityRegistry`
 * holds them (OFS-5000).
 *
 * # What the registry actually stores, and what it does not
 *
 * A claim is a signed assertion about a key: a type, a string value, a
 * verification status, an optional expiry, a revocation flag, and the id of
 * the claim it replaced. That is the whole record — `crates/identity`'s
 * `Claim` has no other fields.
 *
 * There is, in particular, no identity *level* anywhere in it. OFS-5000 §8
 * describes levels 0 to 3, but as a description of what a wallet has chosen
 * to publish, not as state a node stores or a gate anything is checked
 * against: §8 says in as many words that "participation never requires
 * advancing beyond Level 0". So a level is something a reader concludes from
 * the claims below, not a value this module can return, and any page that
 * shows one as a fact about a wallet is showing something nobody recorded.
 *
 * The page this was written for previously rendered four hardcoded levels
 * against the same masked email, phone number, business name and dates for
 * every visitor, including a wallet that had published nothing — with a
 * Level 3 row demanding "99.9% uptime over 90 days" and a "50,000 OPEN
 * infrastructure bond", neither of which exists in the protocol at all.
 *
 * # Claims append, so "current" means newest
 *
 * §7/§11: a claim is immutable. Changing a value publishes a new claim with
 * `supersedes` pointing at the old one, and the old one stays in the record.
 * A wallet that has renamed itself twice therefore holds three MerchantName
 * claims, and only the most recent is in force. Every reader here has to
 * account for that, which is why superseded claims are marked rather than
 * filtered away: the history is public by design, and hiding it in the one
 * interface a merchant uses would misrepresent what counterparties can see.
 */

/** A claim exactly as `getIdentityClaimsByWallet` returns it. */
interface RawClaim {
  id: string;
  claim_type: string | Record<string, string>;
  value: string;
  verification_status?: "Verified" | "Unverified";
  supersedes: string | null;
  expires_at: number | null;
  revoked: boolean;
  created_at: number;
  updated_at?: number;
}

export interface IdentityClaimRecord {
  claimId: string;
  /** `"Email"`, `"MerchantName"`… or the inner string of a `Custom` claim. */
  type: string;
  /** True when the type arrived as `Custom(String)` rather than a known variant. */
  custom: boolean;
  value: string;
  /**
   * The publisher's own `verification_status`.
   *
   * Worth being precise about what this means, because the word invites more
   * than it carries: `crates/identity`'s own module doc records that OTP
   * delivery is not implemented, and that whether a contact claim is marked
   * verified at publish time is left to the caller. So this is an assertion
   * travelling with the claim, not a check any node performed — and the UI
   * has to say so rather than drawing a badge that implies one did.
   */
  verified: boolean;
  supersedes: string | null;
  expiresAt: number | null;
  revoked: boolean;
  createdAt: number;
}

/**
 * `ClaimType` is an externally-tagged enum. Unit variants arrive as a bare
 * string; `Custom(String)` arrives as a single-key object whose key is
 * `"Custom"` and whose value is the caller's own label.
 */
function readClaimType(raw: RawClaim["claim_type"]): { type: string; custom: boolean } {
  if (typeof raw === "string") return { type: raw, custom: false };
  const [key, value] = Object.entries(raw ?? {})[0] ?? [];
  if (key === "Custom" && typeof value === "string") return { type: value, custom: true };
  return { type: key ?? "Unknown", custom: false };
}

async function rpc<T>(method: string, params: unknown): Promise<T> {
  const res = await fetch(`${nodeUrl().replace(/\/$/, "")}/rpc`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await res.json()) as { result?: T; error?: { message: string } };
  if (body.error) throw new Error(body.error.message);
  return body.result as T;
}

/**
 * Every claim the selected node holds for this wallet, newest first.
 *
 * Revoked, expired and superseded claims are all included. They are part of
 * the record — a revoked claim is archived rather than deleted (§12) — and a
 * merchant looking at their own identity page should see exactly what a
 * counterparty inspecting them would.
 *
 * The wallet goes through `walletParam`: the node decodes this argument as
 * base64 PeerId bytes, and passing the base58 address instead yields an
 * empty array rather than an error, which is indistinguishable from a wallet
 * that has published nothing. See `lib/wallet-param.ts`.
 */
export async function fetchIdentityClaims(wallet: string): Promise<IdentityClaimRecord[]> {
  const claims = await rpc<RawClaim[]>("getIdentityClaimsByWallet", {
    wallet: walletParam(wallet),
  });
  return (claims ?? [])
    .map((raw) => {
      const { type, custom } = readClaimType(raw.claim_type);
      return {
        claimId: raw.id,
        type,
        custom,
        value: raw.value,
        verified: raw.verification_status === "Verified",
        supersedes: raw.supersedes ?? null,
        expiresAt: raw.expires_at ?? null,
        revoked: Boolean(raw.revoked),
        createdAt: raw.created_at ?? 0,
      } satisfies IdentityClaimRecord;
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * The claims still in force: not revoked, not expired, and not replaced by a
 * later one.
 *
 * "Replaced" is resolved through `supersedes` rather than by taking the
 * newest of each type, because the two are not the same and only the first
 * is what the record says. A wallet may legitimately hold several live Email
 * claims — §8 allows more than one verified contact — so treating the newest
 * of a type as the only current one would silently hide the others.
 */
export function currentClaims(
  claims: IdentityClaimRecord[],
  now: number = Date.now(),
): IdentityClaimRecord[] {
  const replaced = new Set(
    claims.map((claim) => claim.supersedes).filter((id): id is string => Boolean(id)),
  );
  return claims.filter(
    (claim) =>
      !claim.revoked &&
      !replaced.has(claim.claimId) &&
      (claim.expiresAt === null || claim.expiresAt > now),
  );
}

/** Why a claim is not in force, or null when it is. */
export function inactiveReason(
  claim: IdentityClaimRecord,
  replacedIds: ReadonlySet<string>,
  now: number = Date.now(),
): string | null {
  if (claim.revoked) return "Revoked";
  if (claim.expiresAt !== null && claim.expiresAt <= now) return "Expired";
  if (replacedIds.has(claim.claimId)) return "Superseded";
  return null;
}

/** The ids of claims a later claim names in `supersedes`. */
export function replacedClaimIds(claims: IdentityClaimRecord[]): Set<string> {
  return new Set(
    claims.map((claim) => claim.supersedes).filter((id): id is string => Boolean(id)),
  );
}

/**
 * The first claim of `type` that is currently in force, or null.
 *
 * Shared by the merchant-name and avatar readers so all three agree on what
 * "current" means. They previously each fetched the same list and applied
 * their own rule — newest non-revoked — which ignored expiry entirely and
 * would have shown an expired name as the live one.
 */
export function currentClaimOfType(
  claims: IdentityClaimRecord[],
  type: string,
  now: number = Date.now(),
): IdentityClaimRecord | null {
  return currentClaims(claims, now).find((claim) => !claim.custom && claim.type === type) ?? null;
}
