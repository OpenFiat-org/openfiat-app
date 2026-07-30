/**
 * The browser's side of `POST /api/ipfs/upload`.
 *
 * Deliberately tiny and deliberately separate from `providers.ts`, which
 * is `server-only`. Importing that module from a component would be a
 * build error, and this is what a component imports instead: no
 * credential, no provider knowledge, just a file in and a CID out.
 */

import { asCid } from "@/lib/ipfs/cid";

export interface UploadedFile {
  cid: string;
  mediaType: string;
  sizeBytes: number;
}

/**
 * Uploads `file` and returns the CID the route verified.
 *
 * Throws with the server's own message, which is written for the person
 * who picked the file ("the file was renamed", "the limit is 1024 KB")
 * rather than for a log. The route never puts provider detail in it.
 */
export async function uploadToIpfs(file: File, kind: "avatar" | "attachment"): Promise<UploadedFile> {
  const form = new FormData();
  form.append("file", file);
  form.append("kind", kind);

  const response = await fetch("/api/ipfs/upload", { method: "POST", body: form });
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message = (body as { error?: string } | null)?.error;
    throw new Error(message ?? `Upload failed (${response.status}).`);
  }

  const result = body as Partial<UploadedFile> | null;
  // Checked again on this side even though the route already checked: the
  // value is about to be signed into a permanent record, and the cost of
  // one more parse is nothing against publishing a CID that is not one.
  const cid = asCid(result?.cid);
  if (!cid || typeof result?.mediaType !== "string" || typeof result?.sizeBytes !== "number") {
    throw new Error("The upload service returned an unusable response.");
  }
  return { cid, mediaType: result.mediaType, sizeBytes: result.sizeBytes };
}
