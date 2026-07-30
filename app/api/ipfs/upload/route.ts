import { NextResponse } from "next/server";

import { isCid } from "@/lib/ipfs/cid";
import {
  IPFS_GATEWAY,
  MAX_AVATAR_BYTES,
  MAX_UPLOAD_BYTES,
  isAcceptedMediaType,
} from "@/lib/ipfs/gateway";
import { pinProvider } from "@/lib/ipfs/providers";
import { looksLike } from "@/lib/ipfs/sniff";

/**
 * `POST /api/ipfs/upload` — pin a file and return its CID.
 *
 * # Why this route exists at all
 *
 * The browser could talk to a pinning provider directly, and that is what
 * most tutorials do. It would also mean shipping the provider credential
 * to every visitor: Next inlines `NEXT_PUBLIC_*` values into the client
 * bundle at build time, so a JWT there is not "exposed if someone digs" —
 * it is served, verbatim, to anyone who loads the page. Keeping the
 * credential on this side is the entire point of the hop.
 *
 * The route does not sign anything and does not publish anything. It
 * returns a CID; the client then builds the signed record with the user's
 * own wallet key, which this server never sees.
 *
 * # What it checks, and why the last check is not paranoia
 *
 * Size, declared type, and the file's own magic number are checked before
 * anything is pinned — a mislabelled file must not reach storage, because
 * once pinned it is public and permanent regardless of what happens next.
 *
 * Then the pinned CID is read back from the gateway and compared with the
 * bytes that were uploaded. That catches the failure mode that would
 * otherwise be invisible: a provider that accepts the upload, returns a
 * plausible CID, and has not actually stored the content. Without the
 * read-back, the user is told the upload succeeded, signs a record naming
 * that CID, publishes it to every node on the network — and the evidence
 * their trade depends on resolves to nothing. Verifying the digest
 * locally would be cheaper, but Filebase returns a dag-pb CID for
 * anything past its own chunk threshold (measured: `raw-leaves` and
 * `chunker` are both ignored), and a dag-pb root hash is taken over the
 * DAG node rather than the file. Reading it back works for either.
 */

export const runtime = "nodejs";

/** Guards the read-back against a gateway that accepts and never answers. */
const READBACK_TIMEOUT_MS = 20_000;

function bad(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  const provider = pinProvider();
  if (!provider) {
    // Explicitly not falling back to some public endpoint: a file pushed
    // to a service nobody chose is a file nobody will keep pinned.
    return bad(503, "This deployment has no IPFS provider configured, so uploads are unavailable.");
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return bad(400, "Expected a multipart form upload.");
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return bad(400, "No file was provided.");
  }

  // An avatar is rendered beside every advertisement its owner runs, so
  // it is capped far below an attachment an arbitrator opens once.
  const kind = form.get("kind");
  const limit = kind === "avatar" ? MAX_AVATAR_BYTES : MAX_UPLOAD_BYTES;
  if (file.size === 0) return bad(400, "The file is empty.");
  if (file.size > limit) {
    return bad(413, `That file is ${Math.round(file.size / 1024)} KB; the limit is ${Math.round(limit / 1024)} KB.`);
  }

  if (!isAcceptedMediaType(file.type)) {
    return bad(415, `${file.type || "That file type"} is not accepted. Use PNG, JPEG, WebP or PDF.`);
  }
  if (kind === "avatar" && file.type === "application/pdf") {
    return bad(415, "An avatar must be an image.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!looksLike(file.type, bytes)) {
    return bad(
      415,
      `The file's contents are not ${file.type}. The type a browser reports comes from the file name, so this usually means the file was renamed.`,
    );
  }

  let cid: string;
  try {
    const pinned = await provider.pin(new Blob([bytes], { type: file.type }), file.name);
    cid = pinned.cid;
  } catch (error) {
    // The provider's own message can name a bucket or an account, so only
    // the shape of the failure is returned; the detail goes to the log.
    console.error("[ipfs] pin failed", error);
    return bad(502, "The pinning provider rejected the upload.");
  }

  if (!isCid(cid)) {
    return bad(502, "The pinning provider returned an identifier this protocol cannot use.");
  }

  const verified = await servesTheSameBytes(cid, bytes);
  if (!verified) {
    return bad(
      502,
      "The file was pinned but could not be read back from the gateway, so publishing it now would produce a record pointing at nothing.",
    );
  }

  return NextResponse.json({ cid, mediaType: file.type, sizeBytes: bytes.byteLength });
}

/** Fetches `cid` from the gateway and compares it byte for byte. */
async function servesTheSameBytes(cid: string, expected: Uint8Array): Promise<boolean> {
  try {
    const response = await fetch(`${IPFS_GATEWAY}/${cid}`, {
      signal: AbortSignal.timeout(READBACK_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) return false;
    const served = new Uint8Array(await response.arrayBuffer());
    if (served.byteLength !== expected.byteLength) return false;
    return served.every((byte, i) => byte === expected[i]);
  } catch {
    return false;
  }
}
