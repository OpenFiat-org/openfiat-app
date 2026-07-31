/**
 * Storing a file, from the browser.
 *
 * # The node first, a pinning service only if one is configured
 *
 * This used to be a thin wrapper around `POST /api/ipfs/upload`, which
 * needed a Filebase or Pinata account. A deployment without one answered
 * 503 and told the user "this deployment has no IPFS provider configured,
 * so uploads are unavailable" — while the OpenFiat node it was already
 * talking to was holding and serving blocks, earning a premium for
 * exactly that, and had no way to be handed any.
 *
 * It does now (`sendContentPut`), so that is the first path tried. It
 * needs no account, no credential, and no server hop: the node's ingress
 * is deliberately open, because a caller chooses *what* to store and
 * never *where* — the node recomputes the digest and refuses bytes that
 * are not what the CID names, so nothing can be stored under a CID it
 * does not hash to and no existing content can be displaced.
 *
 * The route is kept as a fallback for a deployment that genuinely does
 * want its content on public IPFS, since that is the one thing a node
 * cannot do for it any more — see `lib/ipfs/gateway.ts`.
 *
 * # Checked here and checked again there
 *
 * Size, declared type and magic bytes are checked before anything leaves
 * the browser, and `/api/ipfs/upload` checks them all over again. That is
 * not redundancy to be tidied away: this half runs on the user's machine
 * and can be skipped by anyone who wants to, so it exists to give a fast,
 * clear answer to an honest mistake — not to enforce anything.
 */

import { asCid } from "@/lib/ipfs/cid";
import { buildDag } from "@/lib/ipfs/dag";
import { MAX_AVATAR_BYTES, MAX_UPLOAD_BYTES, isAcceptedMediaType } from "@/lib/ipfs/gateway";
import { looksLike } from "@/lib/ipfs/sniff";
import { nodeUrl } from "@/lib/node-endpoint";

export interface UploadedFile {
  cid: string;
  mediaType: string;
  sizeBytes: number;
}

/**
 * Stores `file` and returns the CID naming it.
 *
 * Throws with a message written for the person who picked the file
 * ("the file was renamed", "the limit is 1024 KB") rather than for a log.
 */
export async function uploadToIpfs(file: File, kind: "avatar" | "attachment"): Promise<UploadedFile> {
  // An avatar is rendered beside every advertisement its owner runs, so
  // it is capped far below an attachment an arbitrator opens once.
  const limit = kind === "avatar" ? MAX_AVATAR_BYTES : MAX_UPLOAD_BYTES;
  if (file.size === 0) throw new Error("The file is empty.");
  if (file.size > limit) {
    throw new Error(
      `That file is ${Math.round(file.size / 1024)} KB; the limit is ${Math.round(limit / 1024)} KB.`,
    );
  }
  if (!isAcceptedMediaType(file.type)) {
    throw new Error(`${file.type || "That file type"} is not accepted. Use PNG, JPEG, WebP or PDF.`);
  }
  if (kind === "avatar" && file.type === "application/pdf") {
    throw new Error("An avatar must be an image.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!looksLike(file.type, bytes)) {
    throw new Error(
      "The file's contents are not " +
        file.type +
        ". The type a browser reports comes from the file name, so this usually means the file was renamed.",
    );
  }

  try {
    return await storeOnNode(bytes, file.type);
  } catch (nodeError) {
    const pinned = await storeViaProvider(file, kind);
    if (pinned) return pinned;
    // The node is the path that was meant to work, so its failure is the
    // one worth reporting. A deployment with no provider configured hits
    // this only when the node itself is unreachable or refused.
    throw new Error(`The node could not store the file: ${describe(nodeError)}`, {
      cause: nodeError,
    });
  }
}

/**
 * Chunks the file, hands every block to the selected node, and reads the
 * whole thing back before calling it stored.
 *
 * The read-back is not ceremony. Without it the user is told the upload
 * succeeded, signs a record naming that CID, publishes it to every node
 * on the network — and the evidence their trade depends on resolves to
 * nothing.
 */
async function storeOnNode(bytes: Uint8Array, mediaType: string): Promise<UploadedFile> {
  const base = nodeUrl().replace(/\/+$/, "");
  const { root, blocks } = await buildDag(bytes);

  // Leaves first, root last — `buildDag` orders them so, and a node
  // holding a root whose leaves have not arrived would serve a hole.
  for (const block of blocks) {
    const response = await fetch(`${base}/rpc`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "sendContentPut",
        params: { cid: block.cid, content: base64(block.bytes) },
      }),
    });
    if (!response.ok) throw new Error(`the node answered ${response.status}`);
    const body: unknown = await response.json().catch(() => null);
    const error = (body as { error?: { message?: string } } | null)?.error;
    if (error) throw new Error(error.message ?? "the node rejected a block");
  }

  const served = await fetch(`${base}/ipfs/${root}`, { cache: "no-store" });
  if (!served.ok) throw new Error(`stored, but reading it back answered ${served.status}`);
  const readBack = new Uint8Array(await served.arrayBuffer());
  if (readBack.byteLength !== bytes.byteLength || !readBack.every((b, i) => b === bytes[i])) {
    throw new Error("stored, but what came back is not what went in");
  }

  return { cid: root, mediaType, sizeBytes: bytes.byteLength };
}

/**
 * The pinning-service path, or `null` when this deployment has none.
 *
 * `null` rather than a throw: no provider configured is an ordinary
 * state, not a failure, and the caller has a real failure of its own to
 * report.
 */
async function storeViaProvider(file: File, kind: string): Promise<UploadedFile | null> {
  const form = new FormData();
  form.append("file", file);
  form.append("kind", kind);

  let response: Response;
  try {
    response = await fetch("/api/ipfs/upload", { method: "POST", body: form });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  const body: unknown = await response.json().catch(() => null);
  const result = body as Partial<UploadedFile> | null;
  // Checked again on this side even though the route already checked: the
  // value is about to be signed into a permanent record, and the cost of
  // one more parse is nothing against publishing a CID that is not one.
  const cid = asCid(result?.cid);
  if (!cid || typeof result?.mediaType !== "string" || typeof result?.sizeBytes !== "number") {
    return null;
  }
  return { cid, mediaType: result.mediaType, sizeBytes: result.sizeBytes };
}

/**
 * Base64, in slices.
 *
 * `String.fromCharCode(...block)` on a 256 KiB chunk passes 262,144
 * arguments and overflows the stack — a bug that only appears on files
 * large enough to be chunked, which is to say on dispute evidence rather
 * than on avatars.
 */
function base64(bytes: Uint8Array): string {
  const SLICE = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += SLICE) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + SLICE));
  }
  return btoa(binary);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
