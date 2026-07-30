import { isCid } from "@/lib/ipfs/cid";

/**
 * Turning a CID into something a browser can fetch.
 *
 * # Why the gateway is configurable but the CID is not trusted
 *
 * A gateway is an ordinary HTTP server that claims to serve IPFS content.
 * It can serve the wrong bytes, no bytes, or log who asked for what. What
 * it cannot do is change which content a CID names, because the CID is a
 * hash — so the honest position is that the gateway is untrusted
 * transport, and swapping it changes performance and privacy, never
 * meaning.
 *
 * That is also why `ipfsUrl` refuses a value that is not a CID rather than
 * building a URL and hoping. The whole risk of this module is that an
 * attacker-supplied string reaches the path position and turns a fetch of
 * our gateway into a fetch of theirs.
 */

/**
 * Where this build reads IPFS content from.
 *
 * Public by design and safe to inline into the client bundle: it is a URL
 * anyone can already see in the network tab. Nothing secret is ever a
 * `NEXT_PUBLIC_*` value — a pinning credential in one would be handed to
 * every visitor, which is why uploads go through `/api/ipfs/upload` and
 * this module only reads.
 */
export const IPFS_GATEWAY =
  process.env.NEXT_PUBLIC_IPFS_GATEWAY?.replace(/\/+$/, "") ?? "https://ipfs.filebase.io/ipfs";

/**
 * A fetchable URL for `cid`, or `null` if it is not a CID.
 *
 * Returning `null` rather than throwing because the caller is usually
 * rendering someone else's record: one malformed value should leave a
 * broken thumbnail, not an exception that takes out the page around it.
 */
export function ipfsUrl(cid: unknown): string | null {
  return isCid(cid) ? `${IPFS_GATEWAY}/${cid}` : null;
}

/** The formats the protocol accepts, mirroring `openfiat_content::MediaType`. */
export const ACCEPTED_MEDIA_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
] as const;

export type AcceptedMediaType = (typeof ACCEPTED_MEDIA_TYPES)[number];

/** Images only, for the avatar picker — a PDF is not a profile picture. */
export const ACCEPTED_IMAGE_TYPES = ACCEPTED_MEDIA_TYPES.filter((t) =>
  t.startsWith("image/"),
) as readonly AcceptedMediaType[];

export function isAcceptedMediaType(value: string): value is AcceptedMediaType {
  return (ACCEPTED_MEDIA_TYPES as readonly string[]).includes(value);
}

/** Matches `openfiat_content::MAX_ATTACHMENT_BYTES`. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Avatars are capped far below attachments deliberately. An avatar is
 * displayed beside every advertisement a merchant runs, so its cost is
 * paid by every visitor to a listing page, over and over — unlike an
 * attachment, which one arbitrator opens once.
 */
export const MAX_AVATAR_BYTES = 1024 * 1024;
