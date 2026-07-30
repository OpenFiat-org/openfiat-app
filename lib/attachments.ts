import { peerIdForPublicKey, sendSignedEvent, signPayload } from "@/lib/arbitration";
import { asCid } from "@/lib/ipfs/cid";
import { MAX_UPLOAD_BYTES, ipfsUrl, isAcceptedMediaType } from "@/lib/ipfs/gateway";
import { uploadToIpfs } from "@/lib/ipfs/upload-client";
import { nodeUrl } from "@/lib/node-endpoint";
import type { SolanaProvider } from "@/lib/wallet-connection";

/**
 * Files attached to a trade: receipts, screenshots, statements.
 *
 * # Everyone can read these
 *
 * An attachment is public. Not "public if the CID leaks" — public,
 * because a CID is a capability anyone holding it can exercise against
 * any gateway, and CIDs travel in signed gossip that every node stores.
 * This was verified rather than assumed: a file pinned with this
 * project's credentials was fetched from ipfs.io with no token at all.
 *
 * That is the correct property for evidence. A dispute is decided by
 * arbitrators drawn by sortition — people neither party chose and whose
 * identities are unknown when the file is uploaded — so evidence only the
 * author can decrypt would be no evidence at all. The upload form says so
 * plainly, because the person choosing a bank statement needs to know
 * before they choose it, not afterwards.
 *
 * Payment details are the opposite case and go through the separate
 * sealed exchange between counterparties, never through here.
 *
 * # Only the buyer and the seller are shown
 *
 * Anyone can sign a record naming any settlement, so a stranger can
 * publish forged "evidence" and every node will store it — that is what
 * gossip does. The node filters on read, using the settlement's real
 * parties, and `getSettlementAttachments` has no variant that skips it.
 * Nothing here needs to re-filter, and nothing here should try: the
 * authority on who the parties are is the settlement record, not this
 * app.
 */

export interface Attachment {
  id: string;
  cid: string;
  /** A gateway URL; the CID was validated before this was built. */
  url: string;
  mediaType: string;
  sizeBytes: number;
  caption: string;
  author: string;
  createdAt: number;
  /** Whether a viewer may render it inline. A PDF gets a link instead. */
  isImage: boolean;
}

/** The wire shape: snake_case, `PeerId` as bytes, enums externally tagged. */
interface RawAttachment {
  id: string;
  author: number[] | string;
  cid: string;
  media_type: string;
  size_bytes: number;
  caption: string;
  created_at: number;
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

/** `MediaType` is a unit-variant enum, so it arrives as a bare string. */
const MEDIA_TYPE_BY_VARIANT: Record<string, string> = {
  Png: "image/png",
  Jpeg: "image/jpeg",
  Webp: "image/webp",
  Pdf: "application/pdf",
};

function toIana(variant: string): string | null {
  return MEDIA_TYPE_BY_VARIANT[variant] ?? null;
}

function peerToString(author: RawAttachment["author"]): string {
  return typeof author === "string" ? author : btoa(String.fromCharCode(...author));
}

/**
 * Every attachment on a settlement that the node is willing to show.
 *
 * A record whose CID or media type this app cannot make sense of is
 * dropped rather than rendered as a broken tile. That is a display
 * decision, not a security one — the node already refused anything a
 * stranger published — and it keeps one malformed record from being
 * mistaken for a counterparty failing to provide evidence.
 */
export async function fetchAttachments(settlementId: string): Promise<Attachment[]> {
  const raw = await rpc<RawAttachment[]>("getSettlementAttachments", { id: settlementId });
  return (raw ?? []).flatMap((item) => {
    const cid = asCid(item.cid);
    const url = ipfsUrl(cid);
    const mediaType = toIana(item.media_type);
    if (!cid || !url || !mediaType) return [];
    return [
      {
        id: item.id,
        cid,
        url,
        mediaType,
        sizeBytes: item.size_bytes,
        caption: item.caption ?? "",
        author: peerToString(item.author),
        createdAt: item.created_at,
        isImage: mediaType.startsWith("image/"),
      },
    ];
  });
}

/** Mirrors `openfiat_content::MAX_CAPTION_CHARS`. */
export const MAX_CAPTION = 200;

const VARIANT_BY_MEDIA_TYPE: Record<string, string> = Object.fromEntries(
  Object.entries(MEDIA_TYPE_BY_VARIANT).map(([variant, iana]) => [iana, variant]),
);

/**
 * Uploads `file` and publishes it as evidence on `settlementId`.
 *
 * The pin happens first and the record is signed only over a CID the
 * upload route verified is retrievable. Publishing first would put a
 * record on every node in the network pointing at content that may never
 * have been stored.
 */
export async function publishAttachment(
  provider: SolanaProvider,
  publicKey: Uint8Array,
  settlementId: string,
  file: File,
  caption: string,
): Promise<{ attachmentId: string; cid: string }> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`Keep the file under ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`);
  }
  if (!isAcceptedMediaType(file.type)) {
    throw new Error("Attach a PNG, JPEG, WebP or PDF.");
  }
  const trimmed = caption.trim();
  if (trimmed.length > MAX_CAPTION) {
    throw new Error(`Keep the caption to ${MAX_CAPTION} characters or fewer.`);
  }

  const uploaded = await uploadToIpfs(file, "attachment");
  const variant = VARIANT_BY_MEDIA_TYPE[uploaded.mediaType];
  if (!variant) throw new Error("That file type is not accepted.");

  // Key order must match the Rust `Attachment` struct exactly: the node
  // verifies the signature over `JSON.stringify` of this object, so a
  // reordered field produces a payload that fails to verify.
  const attachment = {
    id: crypto.randomUUID(),
    subject: { Settlement: settlementId },
    author: peerIdForPublicKey(publicKey),
    author_public_key: Array.from(publicKey),
    cid: uploaded.cid,
    media_type: variant,
    size_bytes: uploaded.sizeBytes,
    caption: trimmed,
    created_at: Date.now(),
  };

  const signature = await signPayload(provider, attachment);
  const attachmentId = await sendSignedEvent(nodeUrl(), "sendAttachmentPublish", {
    attachment,
    signature,
  });
  return { attachmentId: String(attachmentId), cid: uploaded.cid };
}
