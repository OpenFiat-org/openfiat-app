import { describe, expect, it } from "vitest";

import { preimage } from "@/lib/domain";
import vectors from "./vectors/client_signed_v1.json";

/**
 * Proves this app's `preimage()` header matches `openfiat-core`'s Rust
 * implementation byte for byte (F-01).
 *
 * The vectors are vendored from `openfiat-core`'s
 * `crates/serialization/tests/conformance_vectors.rs` — the same file the
 * Rust workspace, the TS SDK, and this app all check against, so agreement
 * here is agreement with every other signer of these events, not just with
 * itself.
 *
 * Each row's `payload_json` is already-encoded bytes, not a value to
 * re-encode: this test hashes it as opaque UTF-8, exactly as
 * `preimage_raw`/`preimage` treat `body` on the Rust side. Re-parsing and
 * re-stringifying it here would only prove `JSON.stringify` can reproduce
 * `serde_json`'s output, which is a different (and narrower) claim than
 * the one this file exists to make.
 */
interface Vector {
  tag: string;
  payload_json: string;
  preimage_hex: string;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

describe("client-signed preimage conformance vectors", () => {
  const rows = vectors as Vector[];

  it("loaded a non-empty vector file", () => {
    expect(rows.length).toBeGreaterThan(0);
  });

  it.each(rows.map((row) => [row.tag, row] as const))("matches Rust for %s", (_tag, row) => {
    const body = new TextEncoder().encode(row.payload_json);
    expect(toHex(preimage(row.tag, body))).toBe(row.preimage_hex);
  });
});
