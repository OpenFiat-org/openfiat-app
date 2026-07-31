import { isCid } from "@/lib/ipfs/cid";
import { nodeUrl } from "@/lib/node-endpoint";

/**
 * Turning a CID into something a browser can fetch.
 *
 * # Content comes from the node now, not from a public gateway
 *
 * It used to come from `ipfs.filebase.io`, which worked because every
 * OpenFiat node published provider records to the public IPFS DHT. That
 * is no longer true and was never right: it disclosed to the whole IPFS
 * network which peer holds which trade attachment. The DHT is private —
 * `/openfiat/kad/1.0.0`, no public bootstrappers — so a public gateway
 * cannot resolve an OpenFiat CID at all any more, and every avatar and
 * attachment in this app would be a broken image.
 *
 * A node serves them itself, at `GET /ipfs/{cid}` on the same host this
 * app already calls for JSON-RPC. Same path shape a gateway uses, so the
 * only thing that changes here is which host.
 *
 * # What is and is not trusted
 *
 * A gateway — ours or anyone's — is an ordinary HTTP server that claims
 * to serve IPFS content. It can serve the wrong bytes, no bytes, or log
 * who asked for what. What it cannot do is change which content a CID
 * names, because the CID is a hash. A browser checks none of that; it
 * never did, through any gateway. What changed is that the party who
 * gets to see and answer the request is the node the user selected
 * rather than a stranger who also learns what they are looking at.
 *
 * That is also why `ipfsUrl` refuses a value that is not a CID rather
 * than building a URL and hoping. The whole risk of this module is that
 * an attacker-supplied string reaches the path position and turns a
 * fetch of our node into a fetch of theirs.
 */

/**
 * A gateway host to read content from instead of the selected node.
 *
 * Unset by default, and a deployment should usually leave it unset:
 * content published by this network is only resolvable by this network.
 * It exists for a deployment that genuinely does mirror its content to
 * public IPFS and would rather serve the images from there.
 *
 * The host only — `https://ipfs.example.com`, not `.../ipfs`. The
 * `/ipfs/{cid}` suffix is appended below, exactly as it is for a node,
 * because one rule for both is one rule to get wrong. (The old default
 * carried the suffix while `.env.example` documented it without: a
 * deployment that followed the documentation produced `/{cid}` and
 * fetched nothing.)
 *
 * Public by design and safe to inline into the client bundle: it is a
 * URL anyone can already see in the network tab. Nothing secret is ever
 * a `NEXT_PUBLIC_*` value — a pinning credential in one would be handed
 * to every visitor.
 */
export const IPFS_GATEWAY: string | null =
  process.env.NEXT_PUBLIC_IPFS_GATEWAY?.replace(/\/+$/, "") ?? null;

/**
 * A fetchable URL for `cid`, or `null` if it is not a CID.
 *
 * Resolved per call rather than once at module load, because the node
 * the user has selected can change while the app is running and their
 * images should follow it.
 *
 * Returning `null` rather than throwing because the caller is usually
 * rendering someone else's record: one malformed value should leave a
 * broken thumbnail, not an exception that takes out the page around it.
 */
export function ipfsUrl(cid: unknown): string | null {
  if (!isCid(cid)) return null;
  const host = IPFS_GATEWAY ?? nodeUrl().replace(/\/+$/, "");
  return `${host}/ipfs/${cid}`;
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
