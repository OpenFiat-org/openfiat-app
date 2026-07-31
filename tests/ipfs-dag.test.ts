import { describe, expect, it } from "vitest";

import { isCid } from "@/lib/ipfs/cid";
import { CHUNK_BYTES, MAX_LINKS_PER_NODE, buildDag } from "@/lib/ipfs/dag";

/**
 * The bytes and the CID a real IPFS provider returned for them.
 *
 * This is the only test here that checks the encoder against something
 * outside this repository, and it is the one that matters most: sha2-256,
 * the multihash framing, the multicodec, the CIDv1 prefix and the base32
 * alphabet all have to be right simultaneously for it to pass, and a
 * fixture this project computed itself would agree with its own mistakes.
 */
const PROBE_CONTENT = "openfiat ipfs probe 1785426891\n";
const PROBE_CID = "bafkreibdmq27skp3wnycoyoqcei47etyaulerpsegivlkfvyhjkw7ufjva";

const bytes = (length: number, fill = 7) => new Uint8Array(length).fill(fill);

describe("buildDag", () => {
  it("names a small file exactly as a real IPFS provider did", async () => {
    const dag = await buildDag(new TextEncoder().encode(PROBE_CONTENT));
    expect(dag.root).toBe(PROBE_CID);
    expect(dag.blocks).toHaveLength(1);
  });

  it("keeps a one-block file a raw block, with no DAG around it", async () => {
    // A raw CID's digest covers the file itself, so a one-block upload is
    // verifiable by anyone who fetches it. Wrapping it in a DAG for
    // consistency's sake would throw that away for nothing.
    const dag = await buildDag(bytes(CHUNK_BYTES));
    expect(dag.blocks).toHaveLength(1);
    expect(dag.root.startsWith("bafkrei")).toBe(true);
  });

  it("chunks one byte past the limit into leaves under a dag-pb root", async () => {
    const dag = await buildDag(bytes(CHUNK_BYTES + 1));
    expect(dag.blocks).toHaveLength(3); // two leaves and the root
    expect(dag.root.startsWith("bafybei")).toBe(true);
    expect(isCid(dag.root)).toBe(true);
    expect(dag.blocks[0].bytes.byteLength).toBe(CHUNK_BYTES);
    expect(dag.blocks[1].bytes.byteLength).toBe(1);
  });

  it("puts the root last, after every leaf it links to", async () => {
    // Upload order. A node holding a root whose leaves have not arrived
    // serves a hole to anyone who asks for the file.
    const dag = await buildDag(bytes(CHUNK_BYTES * 3));
    expect(dag.blocks.at(-1)?.cid).toBe(dag.root);
    expect(dag.blocks.slice(0, -1).map((b) => b.cid)).not.toContain(dag.root);
  });

  it("links every leaf from the root, in order", async () => {
    // Decoded out of the root block itself rather than trusted from the
    // builder: the order of these links is the order of the file, and
    // reading them back the wrong way round produces bytes that are not
    // the attachment anybody uploaded with nothing to catch it.
    const dag = await buildDag(bytes(CHUNK_BYTES * 2 + 5));
    const root = dag.blocks.at(-1);
    const leaves = dag.blocks.slice(0, -1);
    expect(root).toBeDefined();

    const linked = linkHashes(root!.bytes);
    expect(linked).toHaveLength(leaves.length);
    for (const [index, leaf] of leaves.entries()) {
      // The binary CID, not just the digest: the codec and version bytes
      // are part of what a link names, and a root that got those wrong
      // would point at content nothing can address.
      expect(linked[index]).toBe(hex(binaryOfCid(leaf.cid)));
    }
  });

  it("every block it produces is addressed by a CID this app accepts", async () => {
    const dag = await buildDag(bytes(CHUNK_BYTES * 2));
    for (const block of dag.blocks) expect(isCid(block.cid)).toBe(true);
  });

  it("refuses a file too large to lay out under one root", async () => {
    // Unreachable through the interface, which caps uploads well below
    // this. It throws rather than emitting an over-wide node because such
    // a node would still be valid, still self-consistent, and still not
    // the CID any other implementation computes for the same file.
    await expect(buildDag(bytes(CHUNK_BYTES * (MAX_LINKS_PER_NODE + 1)))).rejects.toThrow(
      /past this layout/,
    );
  });
});

/** The `Hash` field of each PBLink in a dag-pb node, as hex. */
function linkHashes(block: Uint8Array): string[] {
  const out: string[] = [];
  let cursor = 0;
  while (cursor < block.length) {
    const [key, afterKey] = varint(block, cursor);
    cursor = afterKey;
    if ((key & 0x7) !== 2) throw new Error("this fixture only contains length-delimited fields");
    const [length, afterLength] = varint(block, cursor);
    const value = block.subarray(afterLength, afterLength + length);
    cursor = afterLength + length;
    // Field 2 is Links; field 1 is Data, which is unixfs framing.
    if (key >> 3 === 2) out.push(hex(pbLinkHash(value)));
  }
  return out;
}

function pbLinkHash(link: Uint8Array): Uint8Array {
  let cursor = 0;
  while (cursor < link.length) {
    const [key, afterKey] = varint(link, cursor);
    cursor = afterKey;
    if ((key & 0x7) === 0) {
      cursor = varint(link, cursor)[1];
      continue;
    }
    const [length, afterLength] = varint(link, cursor);
    if (key >> 3 === 1) return link.subarray(afterLength, afterLength + length);
    cursor = afterLength + length;
  }
  throw new Error("a PBLink with no Hash");
}

function varint(bytes: Uint8Array, offset: number): [number, number] {
  let value = 0;
  for (let i = 0; ; i += 1) {
    const byte = bytes[offset + i];
    if (byte === undefined) throw new Error("truncated varint");
    value += (byte & 0x7f) * 128 ** i;
    if ((byte & 0x80) === 0) return [value, offset + i + 1];
  }
}

function binaryOfCid(cid: string): Uint8Array {
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const c of cid.slice(1)) {
    buffer = (buffer << 5) | alphabet.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
