import { afterEach, describe, expect, it, vi } from "vitest";
import { requestFaucetDrip, fetchFaucetHealth, FaucetRequestError } from "@/lib/faucet-client";

function mockFetchOnce(status: number, body: unknown, ok = status < 400) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      status,
      json: () => Promise.resolve(body),
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestFaucetDrip", () => {
  it("returns the signature and amounts on success", async () => {
    mockFetchOnce(200, { signature: "abc123", amounts: { USDC: 100, USDT: 100 } });
    const result = await requestFaucetDrip("Some111Address");
    expect(result.signature).toBe("abc123");
    expect(result.amounts).toEqual({ USDC: 100, USDT: 100 });
  });

  it("sends no amount field — the server enforces the cap, not the client", async () => {
    mockFetchOnce(200, { signature: "abc123", amounts: { USDC: 100 } });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ signature: "abc123", amounts: { USDC: 100 } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await requestFaucetDrip("Some111Address", ["USDC"]);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsedBody = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(parsedBody).toEqual({ address: "Some111Address", mints: ["USDC"] });
    expect(parsedBody.amount).toBeUndefined();
  });

  it("throws FaucetRequestError with the server's message on a 429", async () => {
    mockFetchOnce(429, { error: "rate limit exceeded for this wallet address (max 3 per 60000ms)" });
    await expect(requestFaucetDrip("Some111Address")).rejects.toMatchObject({
      message: "rate limit exceeded for this wallet address (max 3 per 60000ms)",
      status: 429,
    });
  });

  it("falls back to a generic message if the error body isn't the expected shape", async () => {
    mockFetchOnce(502, "<html>gateway error</html>");
    await expect(requestFaucetDrip("Some111Address")).rejects.toThrow(/HTTP 502/);
  });

  it("is an instance of FaucetRequestError, not a generic Error, on failure", async () => {
    mockFetchOnce(400, { error: "address is not valid base58" });
    try {
      await requestFaucetDrip("not-valid");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(FaucetRequestError);
    }
  });
});

describe("fetchFaucetHealth", () => {
  it("returns the parsed health body on success", async () => {
    mockFetchOnce(200, { status: "ok", solBalance: 1.5 });
    expect(await fetchFaucetHealth()).toEqual({ status: "ok", solBalance: 1.5 });
  });

  it("returns status 'down' if the request itself throws (network error)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network error")),
    );
    expect(await fetchFaucetHealth()).toEqual({ status: "down" });
  });
});
