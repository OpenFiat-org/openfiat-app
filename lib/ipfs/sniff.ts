import type { AcceptedMediaType } from "@/lib/ipfs/gateway";

/**
 * What a file actually is, as opposed to what it was labelled.
 *
 * A browser's `File.type` is a string the client chose. Anyone posting to
 * the upload route directly chooses it outright, and even an honest
 * browser derives it from the file extension. So the declared type
 * establishes nothing, and the bytes have to be asked instead.
 *
 * This matters because the type ends up in a signed record that decides
 * how a viewer renders the content. A file labelled `image/png` that is
 * really an HTML document would be pinned, published, and then served by
 * a gateway that sniffs it as HTML — attacker-authored script on whatever
 * origin that gateway occupies. Checking the leading bytes is what makes
 * the closed set in `openfiat_content::MediaType` mean something.
 */

const MAGIC: Record<AcceptedMediaType, readonly number[]> = {
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  "image/jpeg": [0xff, 0xd8, 0xff],
  // RIFF, then a four-byte size, then the WEBP form type — checked below.
  "image/webp": [0x52, 0x49, 0x46, 0x46],
  "application/pdf": [0x25, 0x50, 0x44, 0x46, 0x2d],
};

const WEBP_FORM_TYPE = [0x57, 0x45, 0x42, 0x50]; // "WEBP" at offset 8

function startsWith(bytes: Uint8Array, magic: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + magic.length) return false;
  return magic.every((byte, i) => bytes[offset + i] === byte);
}

/**
 * Whether `bytes` really begin like `declared`.
 *
 * Deliberately not "detect the type from the bytes and use that": the
 * accepted set is small and closed, so confirming a claim is enough, and
 * a detector that returns a type nobody asked for is a way to end up
 * accepting a format the protocol never agreed to render.
 */
export function looksLike(declared: AcceptedMediaType, bytes: Uint8Array): boolean {
  if (!startsWith(bytes, MAGIC[declared])) return false;
  // RIFF is shared with WAV and AVI, so the leading tag alone would
  // accept audio a caller mislabelled as an image.
  if (declared === "image/webp") return startsWith(bytes, WEBP_FORM_TYPE, 8);
  return true;
}
