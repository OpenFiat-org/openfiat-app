// @vitest-environment node
//
// Node, not jsdom: this exercises a server route. jsdom supplies a
// browser `FormData`/`Request` pair that `request.formData()` never
// resolves against, which surfaces as every test in the file timing out
// rather than as an error naming the environment.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The upload route is where an untrusted file meets a paid pinning
 * account, so its rejections are the part worth testing: everything it
 * lets through becomes public and permanent.
 *
 * `server-only` is stubbed because it throws by design outside a server
 * bundle, and vitest is neither. Stubbing it here does not weaken the
 * guarantee it provides — that guarantee is a *build* error if a client
 * component imports `providers.ts`, which this test does not affect.
 */
vi.mock("server-only", () => ({}));

const pin = vi.fn();
vi.mock("@/lib/ipfs/providers", () => ({
  pinProvider: () => (pinConfigured ? { name: "test", pin } : null),
}));

let pinConfigured = true;

const REAL_CID = "bafkreibdmq27skp3wnycoyoqcei47etyaulerpsegivlkfvyhjkw7ufjva";

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function pngBytes(extra = 32): Uint8Array {
  return Uint8Array.from([...PNG_HEADER, ...new Array(extra).fill(0x41)]);
}

function upload(bytes: Uint8Array, type: string, kind = "attachment", name = "receipt.png") {
  const form = new FormData();
  // `bytes.buffer` rather than the view: TypeScript 6 types BlobPart
  // as ArrayBufferView<ArrayBuffer>, which a Uint8Array<ArrayBufferLike>
  // does not satisfy.
  form.append("file", new File([bytes.buffer as ArrayBuffer], name, { type }));
  form.append("kind", kind);
  return new Request("http://localhost/api/ipfs/upload", { method: "POST", body: form });
}

async function post(request: Request) {
  const { POST } = await import("@/app/api/ipfs/upload/route");
  const response = await POST(request);
  return { status: response.status, body: await response.json() };
}

const fetchMock = vi.fn();

beforeEach(() => {
  pinConfigured = true;
  pin.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The gateway read-back returning exactly what was uploaded. */
function gatewayServes(bytes: Uint8Array) {
  fetchMock.mockResolvedValue({
    ok: true,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  });
}

describe("POST /api/ipfs/upload", () => {
  it("pins a real PNG and returns the CID", async () => {
    const bytes = pngBytes();
    pin.mockResolvedValue({ cid: REAL_CID, provider: "test" });
    gatewayServes(bytes);

    const { status, body } = await post(upload(bytes, "image/png"));
    expect(status).toBe(200);
    expect(body).toEqual({ cid: REAL_CID, mediaType: "image/png", sizeBytes: bytes.byteLength });
  });

  it("refuses a file whose bytes are not the type it claims", async () => {
    // The exact attack the magic-number check exists for: HTML labelled
    // as an image, which a gateway would then sniff and serve as HTML.
    const html = new TextEncoder().encode("<script>alert(1)</script>");
    const { status, body } = await post(upload(html, "image/png"));

    expect(status).toBe(415);
    expect(body.error).toMatch(/not image\/png/);
    expect(pin, "nothing may be pinned before the bytes are checked").not.toHaveBeenCalled();
  });

  it("refuses a type outside the accepted set", async () => {
    const svg = new TextEncoder().encode("<svg onload=alert(1)></svg>");
    const { status } = await post(upload(svg, "image/svg+xml"));
    expect(status).toBe(415);
    expect(pin).not.toHaveBeenCalled();
  });

  it("refuses a PDF as an avatar", async () => {
    const pdf = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
    const { status, body } = await post(upload(pdf, "application/pdf", "avatar", "x.pdf"));
    expect(status).toBe(415);
    expect(body.error).toMatch(/must be an image/);
    expect(pin).not.toHaveBeenCalled();
  });

  it("holds an avatar to the smaller cap", async () => {
    // Between the avatar cap (1 MB) and the attachment cap (10 MB), so
    // the same file is accepted as one and refused as the other.
    const big = pngBytes(2 * 1024 * 1024);
    const { status } = await post(upload(big, "image/png", "avatar", "big.png"));
    expect(status).toBe(413);
    expect(pin).not.toHaveBeenCalled();
  });

  it("refuses an empty file", async () => {
    const { status } = await post(upload(new Uint8Array(0), "image/png"));
    expect(status).toBe(400);
    expect(pin).not.toHaveBeenCalled();
  });

  it("refuses a provider identifier that is not a CID", async () => {
    const bytes = pngBytes();
    pin.mockResolvedValue({ cid: "../../etc/passwd", provider: "test" });

    const { status, body } = await post(upload(bytes, "image/png"));
    expect(status).toBe(502);
    expect(body.error).toMatch(/cannot use/);
  });

  it("refuses to return a CID the gateway will not serve", async () => {
    // A provider that accepts the upload and stores nothing. Without this
    // check the user is told it worked, signs a record naming the CID,
    // and publishes evidence that resolves to nothing.
    const bytes = pngBytes();
    pin.mockResolvedValue({ cid: REAL_CID, provider: "test" });
    fetchMock.mockResolvedValue({ ok: false, arrayBuffer: async () => new ArrayBuffer(0) });

    const { status, body } = await post(upload(bytes, "image/png"));
    expect(status).toBe(502);
    expect(body.error).toMatch(/could not be read back/);
  });

  it("refuses when the gateway serves different bytes", async () => {
    const bytes = pngBytes();
    pin.mockResolvedValue({ cid: REAL_CID, provider: "test" });
    gatewayServes(pngBytes(64));

    const { status } = await post(upload(bytes, "image/png"));
    expect(status).toBe(502);
  });

  it("does not leak the provider's own error text", async () => {
    const bytes = pngBytes();
    // A real provider message can name a bucket, an account or a token.
    pin.mockRejectedValue(new Error("filebase: bucket openfiat token NERG… rejected"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { status, body } = await post(upload(bytes, "image/png"));
    expect(status).toBe(502);
    expect(body.error).not.toMatch(/bucket|token|NERG/);
    spy.mockRestore();
  });

  it("says uploads are unavailable rather than picking a provider itself", async () => {
    pinConfigured = false;
    const { status, body } = await post(upload(pngBytes(), "image/png"));
    expect(status).toBe(503);
    expect(body.error).toMatch(/no IPFS provider configured/);
  });
});
