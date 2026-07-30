import { peerIdForPublicKey, sendSignedEvent, signPayload } from "@/lib/arbitration";
import { asCid } from "@/lib/ipfs/cid";
import { MAX_AVATAR_BYTES, ipfsUrl } from "@/lib/ipfs/gateway";
import { nodeUrl } from "@/lib/node-endpoint";
import { uploadToIpfs } from "@/lib/ipfs/upload-client";
import { walletParam } from "@/lib/wallet-param";
import type { SolanaProvider } from "@/lib/wallet-connection";

/**
 * A merchant's profile picture, published as an identity claim (OFS-5000).
 *
 * # Why an avatar is a claim and not a file
 *
 * There is no profile table anywhere in this protocol; there are signed
 * assertions about a key. A merchant name already works this way, and an
 * avatar is the same kind of statement — "this key looks like this" — so
 * it reuses `sendClaimPublish` rather than introducing a parallel notion
 * of a profile that would then need its own replication and its own
 * conflict rules.
 *
 * The claim's value is a CID, not image bytes and not a URL. Bytes would
 * put every avatar into every node's permanent gossip log. A URL would
 * let the owner change what a published claim points at, silently, for
 * everyone — an immutable record pointing at mutable content is not
 * immutable — and would make an avatar a tracking beacon that reports
 * every viewer to a server the merchant controls. `openfiat_content`
 * rejects an Avatar claim whose value is not a CID, so this is enforced
 * by the network and not merely by this form.
 *
 * # Changing an avatar leaves a trail, on purpose
 *
 * Claims are immutable (§7/§11). A new avatar is a new claim naming the
 * old one in `supersedes`, and the old one stays archived. A merchant
 * cannot quietly re-skin away from a bad history, and the UI says so
 * rather than presenting something that looks like an overwrite.
 */

const AVATAR = "Avatar";

interface RawClaim {
  id: string;
  claim_type: string | Record<string, string>;
  value: string;
  supersedes: string | null;
  revoked: boolean;
  created_at: number;
}

export interface AvatarClaim {
  claimId: string;
  cid: string;
  /** Ready to put in an `<img src>`; never null, since `cid` was checked. */
  url: string;
  createdAt: number;
  supersedes: string | null;
}

/** `ClaimType` is externally tagged: unit variants arrive as bare strings. */
function isAvatar(claimType: RawClaim["claim_type"]): boolean {
  return typeof claimType === "string"
    ? claimType === AVATAR
    : Object.keys(claimType ?? {})[0] === AVATAR;
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
 * The wallet's current avatar, or `null` if it has none.
 *
 * The value is re-validated here even though a node should already have
 * rejected a non-CID: this app talks to whichever node the user selected,
 * including one they typed in themselves, and a value that reaches an
 * `<img src>` must have been checked by the code that renders it.
 */
export async function fetchAvatar(wallet: string): Promise<AvatarClaim | null> {
  const claims = await rpc<RawClaim[]>("getIdentityClaimsByWallet", {
    wallet: walletParam(wallet),
  });
  const current = (claims ?? [])
    .filter((c) => isAvatar(c.claim_type) && !c.revoked)
    .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))
    .find((c) => asCid(c.value) !== null);
  if (!current) return null;

  const url = ipfsUrl(current.value);
  if (!url) return null;
  return {
    claimId: current.id,
    cid: current.value,
    url,
    createdAt: current.created_at,
    supersedes: current.supersedes ?? null,
  };
}

/**
 * Uploads `file` and publishes it as this wallet's avatar.
 *
 * Two steps that must stay in this order and cannot be collapsed: the
 * file is pinned first, and only a CID that came back verified is signed
 * over. Publishing before the pin is confirmed would put a record on
 * every node pointing at content that may not exist.
 */
export async function publishAvatar(
  provider: SolanaProvider,
  publicKey: Uint8Array,
  file: File,
  supersedes: string | null,
): Promise<{ claimId: string; cid: string }> {
  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error(`Keep the image under ${Math.round(MAX_AVATAR_BYTES / 1024)} KB.`);
  }
  const { cid } = await uploadToIpfs(file, "avatar");

  // Key order must match the Rust `ClaimPublish` struct exactly: the node
  // verifies the signature over `JSON.stringify` of this object, so a
  // reordered field produces a payload that fails to verify.
  const publish = {
    id: crypto.randomUUID(),
    wallet: peerIdForPublicKey(publicKey),
    wallet_public_key: Array.from(publicKey),
    claim_type: AVATAR,
    value: cid,
    // Self-published: nothing verifies that a picture is of anyone. See
    // `merchant-name.ts` for why a fabricated `true` here would put a
    // verified badge on something anyone can upload.
    verified: false,
    supersedes,
    expires_at: null,
    timestamp: Date.now(),
  };

  const signature = await signPayload(provider, publish);
  const claimId = await sendSignedEvent(nodeUrl(), "sendClaimPublish", { publish, signature });
  return { claimId: String(claimId), cid };
}
