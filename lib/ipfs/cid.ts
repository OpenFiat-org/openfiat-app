/**
 * A validated IPFS content identifier.
 *
 * This is a deliberate second implementation of `openfiat_crypto::cid` in
 * openfiat-core, and the two must agree exactly. They are tested against
 * the same real identifiers for that reason: a CID this app accepts but a
 * node rejects produces a signed record the network throws away *after*
 * the user was told their upload succeeded, and a CID a node accepts but
 * this app rejects renders a counterparty's genuine evidence as broken.
 *
 * # Why parse instead of matching a pattern
 *
 * Every CID here comes from somewhere untrusted — a counterparty's
 * attachment, a stranger's avatar, a node's JSON response — and ends up
 * concatenated into `https://<gateway>/ipfs/<cid>` that the browser
 * fetches. An unchecked string in that position is a redirect primitive:
 * `../../evil`, or an absolute `https://` that replaces the gateway
 * entirely, or `javascript:` if it ever reaches an href.
 *
 * `/^b[a-z2-7]{58}$/` would accept 58 legal base32 characters that decode
 * to nothing, and that string would sail through into a URL. Decoding the
 * multibase, version, codec, hash function and digest length, and
 * requiring them to agree with the bytes actually present, rejects it —
 * a CID is self-describing, so a forgery has to be self-consistent.
 *
 * # Why only CIDv1 base32 sha2-256
 *
 * One canonical spelling per piece of content. The same file as `Qm…`
 * (CIDv0, base58) and `bafy…` (CIDv1, base32) would be two unequal
 * strings in a signed record and in every comparison the app makes, so
 * accepting both would mean `a === b` no longer means "the same content".
 */

/** Multicodec for raw binary — a single-block upload. */
const CODEC_RAW = 0x55;
/** Multicodec for dag-pb — what a provider returns once a file is
 *  chunked into a DAG. Both are ordinary outcomes of uploading a file. */
const CODEC_DAG_PB = 0x70;
/** Multihash code for sha2-256. */
const HASH_SHA2_256 = 0x12;
const SHA2_256_LEN = 32;

/** RFC 4648 base32 lowercase, no padding. */
function base32LowerDecode(input: string): Uint8Array | null {
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (const c of input) {
    let value: number;
    if (c >= "a" && c <= "z") value = c.charCodeAt(0) - 97;
    else if (c >= "2" && c <= "7") value = c.charCodeAt(0) - 50 + 26;
    else return null;

    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }

  // Leftover bits must be zero padding. A non-zero remainder means two
  // different strings could decode to the same bytes, and since a CID is
  // compared as a string that would reintroduce the multiple-spellings
  // problem this parser exists to prevent.
  if (bits >= 5 || (buffer & ((1 << bits) - 1)) !== 0) return null;
  return Uint8Array.from(out);
}

/** Unsigned LEB128. Bounded so a run of continuation bits cannot loop. */
function readVarint(bytes: Uint8Array, offset: number): [number, number] | null {
  let value = 0;
  for (let i = 0; i < 9; i += 1) {
    const byte = bytes[offset + i];
    if (byte === undefined) return null;
    value |= (byte & 0x7f) << (i * 7);
    if ((byte & 0x80) === 0) return [value, offset + i + 1];
  }
  return null;
}

/**
 * Whether `value` is a CID this protocol accepts.
 *
 * Call this on anything before putting it in a URL. It is the only thing
 * standing between a hostile string in a gossiped record and a fetch.
 */
export function isCid(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 2 || !value.startsWith("b")) {
    return false;
  }
  const bytes = base32LowerDecode(value.slice(1));
  if (bytes === null) return false;

  let cursor = 0;
  for (const expected of [1, null, HASH_SHA2_256, SHA2_256_LEN]) {
    const read = readVarint(bytes, cursor);
    if (read === null) return false;
    const [got, next] = read;
    cursor = next;
    if (expected === null) {
      if (got !== CODEC_RAW && got !== CODEC_DAG_PB) return false;
    } else if (got !== expected) {
      return false;
    }
  }
  // The declared digest length must match the bytes actually present.
  return bytes.length - cursor === SHA2_256_LEN;
}

/**
 * Narrows a value to a CID, or returns `null`.
 *
 * Prefer this over `isCid` at the point where an untrusted value first
 * enters the app, so the rest of the code is working with a string that
 * has already been checked rather than re-checking at each use.
 */
export function asCid(value: unknown): string | null {
  return isCid(value) ? value : null;
}
