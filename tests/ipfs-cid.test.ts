import { describe, expect, it } from "vitest";

import { asCid, isCid } from "@/lib/ipfs/cid";
import { ipfsUrl } from "@/lib/ipfs/gateway";
import { looksLike } from "@/lib/ipfs/sniff";

/**
 * These identifiers are not invented. `RAW_CID` is what Filebase's IPFS
 * RPC returned for a 31-byte file this project uploaded, and `DAG_PB_CID`
 * is what it returned for a 900 KB one — the two shapes a real upload
 * produces. Both were fetched back successfully from a public gateway.
 *
 * The same two values appear in openfiat-core's `openfiat_crypto::cid`
 * tests. That is the point of duplicating them: this parser and the Rust
 * one must agree, because a CID the app accepts and a node rejects
 * produces a signed record thrown away after the user was told their
 * upload worked.
 */
const RAW_CID = "bafkreibdmq27skp3wnycoyoqcei47etyaulerpsegivlkfvyhjkw7ufjva";
const DAG_PB_CID = "bafybeig3ci7io2duyknu34co3zw42oodnfyamwazsus42vpgnvq2hpzodm";

describe("isCid", () => {
  it("accepts both CID shapes a real upload produces", () => {
    expect(isCid(RAW_CID)).toBe(true);
    expect(isCid(DAG_PB_CID)).toBe(true);
  });

  it("rejects a string of legal base32 that is not a CID", () => {
    // The exact case a regex over the alphabet would have let through.
    const plausible = `b${"z".repeat(RAW_CID.length - 1)}`;
    expect(plausible).toHaveLength(RAW_CID.length);
    expect(isCid(plausible)).toBe(false);
  });

  it("never accepts something that would redirect a fetch", () => {
    for (const hostile of [
      "../../../etc/passwd",
      "https://evil.example/payload",
      "//evil.example/payload",
      "javascript:alert(1)",
      "bafkrei../../../etc/passwd",
      "b../..",
      "",
      "b",
      "?query=1",
      "cid#fragment",
    ]) {
      expect(isCid(hostile), `${hostile} must not pass`).toBe(false);
    }
  });

  it("rejects CIDv0 and uppercase, so one file has one spelling", () => {
    expect(isCid("QmbFMke1KXqnYyBBWxB74N4c5SBnJMVAiMNRcGu6x1AwQH")).toBe(false);
    expect(isCid(RAW_CID.toUpperCase())).toBe(false);
  });

  it("rejects a truncated digest even though the header decodes", () => {
    expect(isCid(RAW_CID.slice(0, -4))).toBe(false);
  });

  it("terminates on a run of varint continuation bytes", () => {
    expect(isCid("b777777777777777")).toBe(false);
  });

  it("rejects non-strings without throwing", () => {
    for (const value of [null, undefined, 42, {}, [], { toString: () => RAW_CID }]) {
      expect(isCid(value)).toBe(false);
    }
  });
});

describe("asCid", () => {
  it("returns the value or null", () => {
    expect(asCid(RAW_CID)).toBe(RAW_CID);
    expect(asCid("../evil")).toBeNull();
  });
});

describe("ipfsUrl", () => {
  it("builds a gateway URL for a real CID", () => {
    expect(ipfsUrl(RAW_CID)).toBe(`https://ipfs.filebase.io/ipfs/${RAW_CID}`);
  });

  it("returns null rather than a URL pointing somewhere else", () => {
    // Each of these, concatenated naively, produces a URL that leaves the
    // gateway — which is the whole reason this returns null.
    for (const hostile of ["../../evil", "https://evil.example/x", "javascript:alert(1)"]) {
      expect(ipfsUrl(hostile)).toBeNull();
    }
  });
});

describe("looksLike", () => {
  const bytes = (...values: number[]) => Uint8Array.from(values);

  it("recognises real file headers", () => {
    expect(looksLike("image/png", bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00))).toBe(true);
    expect(looksLike("image/jpeg", bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
    expect(looksLike("application/pdf", bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31))).toBe(true);
    expect(
      looksLike("image/webp", bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50)),
    ).toBe(true);
  });

  it("catches HTML labelled as an image", () => {
    const html = new TextEncoder().encode("<script>alert(1)</script>");
    for (const type of ["image/png", "image/jpeg", "image/webp", "application/pdf"] as const) {
      expect(looksLike(type, html), `${type} must not accept HTML`).toBe(false);
    }
  });

  it("does not accept a WAV as a WebP", () => {
    // Same RIFF container tag; only the form type at offset 8 differs.
    expect(
      looksLike("image/webp", bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45)),
    ).toBe(false);
  });

  it("does not read past the end of a short file", () => {
    expect(looksLike("image/png", bytes(0x89, 0x50))).toBe(false);
    expect(looksLike("image/webp", bytes(0x52, 0x49, 0x46, 0x46))).toBe(false);
  });
});
