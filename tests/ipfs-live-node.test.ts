import { describe, expect, it } from "vitest";

import { buildDag } from "@/lib/ipfs/dag";

/**
 * The upload path against a real running node.
 *
 * Everything else about chunking can be verified in isolation, and is —
 * `tests/ipfs-dag.test.ts` checks the encoder against a CID a real IPFS
 * provider returned. What none of that can check is the part that
 * actually broke before: whether a node accepts these blocks and serves
 * the file back. The node recomputes every digest and refuses bytes that
 * are not what the CID names, so a disagreement between this app's
 * encoder and `openfiat_crypto::Cid` shows up here as a rejection rather
 * than as a broken image in production.
 *
 * Skipped unless `OPENFIAT_LIVE_NODE_URL` names a node to talk to:
 *
 *     OPENFIAT_LIVE_NODE_URL=http://127.0.0.1:7080 pnpm test
 */
const NODE = process.env.OPENFIAT_LIVE_NODE_URL?.replace(/\/+$/, "");

describe.runIf(NODE)("a real node", () => {
  it("accepts a chunked upload and serves the whole file back", async () => {
    // Past one chunk, so this exercises the dag-pb root rather than the
    // single-raw-block case an avatar usually takes. Pseudo-random so a
    // rerun cannot pass by finding the previous run's blocks still held.
    const bytes = new Uint8Array(700_000);
    let seed = Date.now() & 0xffff;
    for (let i = 0; i < bytes.length; i += 1) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      bytes[i] = seed & 0xff;
    }

    const { root, blocks } = await buildDag(bytes);
    expect(blocks.length).toBe(4); // three chunks and the root

    for (const block of blocks) {
      const response = await fetch(`${NODE}/rpc`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "sendContentPut",
          params: { cid: block.cid, content: Buffer.from(block.bytes).toString("base64") },
        }),
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as { error?: unknown; result?: { cid: string } };
      // A rejection here means the node's digest of these bytes is not
      // the CID this app computed for them.
      expect(body.error).toBeUndefined();
      expect(body.result?.cid).toBe(block.cid);
    }

    const served = await fetch(`${NODE}/ipfs/${root}`, { cache: "no-store" });
    expect(served.status).toBe(200);
    const readBack = new Uint8Array(await served.arrayBuffer());
    expect(readBack.byteLength).toBe(bytes.byteLength);
    expect(Buffer.from(readBack).equals(Buffer.from(bytes))).toBe(true);
  }, 30_000);

  it("refuses bytes that are not what the CID names", async () => {
    // The property the open ingress rests on, checked against the real
    // implementation rather than against a description of it.
    const { root } = await buildDag(new TextEncoder().encode("the real content"));
    const response = await fetch(`${NODE}/rpc`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "sendContentPut",
        params: { cid: root, content: Buffer.from("something else").toString("base64") },
      }),
    });
    const body = (await response.json()) as { error?: { message?: string } };
    expect(body.error).toBeDefined();
  });
});
