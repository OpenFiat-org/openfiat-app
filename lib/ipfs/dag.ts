/**
 * Turning a file into the blocks a node can be handed, and the CID that
 * names it.
 *
 * # Why this is here rather than at a pinning service
 *
 * A node accepts one block at a time (`sendContentPut`) and refuses bytes
 * that do not hash to the CID they are offered under — that refusal is
 * the entire security of an open ingress, and it means the uploader has
 * to compute the CIDs. A pinning service used to do this, which is why
 * uploads needed a third-party account and a deployment without one told
 * the user uploads were unavailable while a node perfectly capable of
 * holding the bytes sat behind it.
 *
 * # The layout is Kubo's, deliberately
 *
 * 256 KiB chunks, raw leaves, one balanced dag-pb root, canonical field
 * order (links before data, which is what go-merkledag emits and what
 * every CID in the wild was computed from). The result is that the same
 * file has the same CID whether it went through a node or through
 * Filebase — so a deployment can switch between them, or run both, and
 * the CIDs in its records stay comparable. Getting this subtly wrong
 * would not fail loudly: it would produce a valid, self-consistent CID
 * that simply is not the one anybody else computes.
 *
 * A file at or under one chunk is a single raw block and has no root at
 * all — `bafkrei…` rather than `bafybei…`. That is not a special case
 * bolted on; it is what a one-block file *is*, and it is why most avatars
 * never involve a DAG.
 */

import { isCid } from "@/lib/ipfs/cid";

/** IPFS's chunk size, and `openfiat_content::MAX_BLOCK_BYTES`. */
export const CHUNK_BYTES = 262_144;

/**
 * The most children one dag-pb node may have before a second level is
 * needed. Kubo's default balanced-layout fan-out.
 *
 * At 256 KiB per chunk this covers 43.5 MB, and the app refuses uploads
 * past 10 MB (`MAX_UPLOAD_BYTES`), so a single root always suffices.
 * [`buildDag`] throws rather than silently emitting an over-wide node if
 * that ever stops being true — an unbalanced DAG would still be valid and
 * would still not be the CID anyone else computes.
 */
export const MAX_LINKS_PER_NODE = 174;

/** Multicodec identifiers, matching `lib/ipfs/cid.ts`. */
const CODEC_RAW = 0x55;
const CODEC_DAG_PB = 0x70;

export interface Block {
  cid: string;
  bytes: Uint8Array;
}

export interface Dag {
  /** The CID naming the whole file — what goes in the signed record. */
  root: string;
  /**
   * Every block, leaves first and the root last.
   *
   * That order matters on upload: a node that has the root but not its
   * leaves would serve a hole to anyone who asked, and a fetch that races
   * an upload should find either nothing or everything.
   */
  blocks: Block[];
}

/** RFC 4648 base32 lowercase, no padding — `lib/ipfs/cid.ts` decodes it. */
function base32LowerEncode(bytes: Uint8Array): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += alphabet[(buffer >> bits) & 0x1f];
    }
  }
  if (bits > 0) out += alphabet[(buffer << (5 - bits)) & 0x1f];
  return out;
}

/** Unsigned LEB128, protobuf's and multiformats' shared integer encoding. */
function varint(value: number): number[] {
  const out: number[] = [];
  let rest = value;
  while (rest >= 0x80) {
    out.push((rest & 0x7f) | 0x80);
    rest = Math.floor(rest / 128);
  }
  out.push(rest);
  return out;
}

function tag(field: number, wire: number): number[] {
  return varint(field * 8 + wire);
}

function bytesField(field: number, value: Uint8Array | number[]): number[] {
  return [...tag(field, 2), ...varint(value.length), ...value];
}

function varintField(field: number, value: number): number[] {
  return [...tag(field, 0), ...varint(value)];
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const buffer = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  return new Uint8Array(buffer);
}

/** The binary form of a CID: version, codec, then the sha2-256 multihash. */
function cidBinary(codec: number, digest: Uint8Array): Uint8Array {
  return Uint8Array.from([0x01, codec, 0x12, 0x20, ...digest]);
}

async function cidFor(codec: number, block: Uint8Array): Promise<string> {
  const cid = `b${base32LowerEncode(cidBinary(codec, await sha256(block)))}`;
  // The app's own parser, run over the app's own output. Cheap, and it is
  // the one check that would catch an encoder bug before a user signs a
  // record naming an identifier no node will accept.
  if (!isCid(cid)) throw new Error("built an identifier that is not a CID");
  return cid;
}

/**
 * The unixfs `Data` message for a file assembled from `sizes` chunks.
 *
 * `Type = File`, the total size, and the size each child contributes, in
 * order. A reader that wants byte ranges without fetching the whole file
 * needs the third; our own node ignores all of it and concatenates the
 * raw leaves, but the block is public and other implementations do read
 * it.
 */
function unixfsFile(sizes: number[]): number[] {
  const total = sizes.reduce((sum, size) => sum + size, 0);
  return [
    ...varintField(1, 2), // Type = File
    ...varintField(3, total), // filesize
    ...sizes.flatMap((size) => varintField(4, size)), // blocksizes
  ];
}

/**
 * A dag-pb node linking to `children`.
 *
 * Links before data. Protobuf itself does not care about field order, but
 * every dag-pb CID in existence was computed over go-merkledag's output,
 * which writes links first — so emitting the fields in numeric order
 * would produce a different hash for identical content.
 */
function dagNode(children: { cidBytes: Uint8Array; size: number }[], sizes: number[]): Uint8Array {
  const out: number[] = [];
  for (const child of children) {
    const link = [
      ...bytesField(1, child.cidBytes), // Hash
      ...bytesField(2, []), // Name: "" — present, and empty, as Kubo writes it
      ...varintField(3, child.size), // Tsize
    ];
    out.push(...bytesField(2, link));
  }
  out.push(...bytesField(1, unixfsFile(sizes)));
  return Uint8Array.from(out);
}

/**
 * Every block of `bytes`, and the CID naming the whole thing.
 *
 * Throws only for a file too large to lay out in one root — see
 * [`MAX_LINKS_PER_NODE`]. An empty file is a legitimate one-block DAG and
 * is not rejected here; the upload path refuses it earlier, where the
 * message can say something useful.
 */
export async function buildDag(bytes: Uint8Array): Promise<Dag> {
  if (bytes.byteLength <= CHUNK_BYTES) {
    const root = await cidFor(CODEC_RAW, bytes);
    return { root, blocks: [{ cid: root, bytes }] };
  }

  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.byteLength; offset += CHUNK_BYTES) {
    chunks.push(bytes.subarray(offset, Math.min(offset + CHUNK_BYTES, bytes.byteLength)));
  }
  if (chunks.length > MAX_LINKS_PER_NODE) {
    throw new Error(
      `a ${bytes.byteLength}-byte file needs ${chunks.length} chunks, past this layout's ${MAX_LINKS_PER_NODE}`,
    );
  }

  const leaves: Block[] = [];
  const links: { cidBytes: Uint8Array; size: number }[] = [];
  for (const chunk of chunks) {
    const digest = await sha256(chunk);
    const cidBytes = cidBinary(CODEC_RAW, digest);
    const cid = `b${base32LowerEncode(cidBytes)}`;
    if (!isCid(cid)) throw new Error("built an identifier that is not a CID");
    leaves.push({ cid, bytes: chunk });
    // Tsize of a raw leaf is the leaf itself: there is no framing around
    // the bytes, which is the whole point of a raw leaf.
    links.push({ cidBytes, size: chunk.byteLength });
  }

  const rootBytes = dagNode(
    links,
    chunks.map((chunk) => chunk.byteLength),
  );
  const root = await cidFor(CODEC_DAG_PB, rootBytes);
  return { root, blocks: [...leaves, { cid: root, bytes: rootBytes }] };
}
