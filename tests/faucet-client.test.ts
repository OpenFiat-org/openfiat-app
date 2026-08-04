import { afterEach, describe, expect, it, vi } from "vitest";
import { requestFaucetDrip, fetchFaucetHealth, FaucetRequestError } from "@/lib/faucet-client";
import type { SolanaProvider } from "@/lib/wallet-connection";

const CHALLENGE = "OpenFiat devnet faucet\n\nNonce:   " + "a".repeat(48);

/** A wallet that signs anything, returning a recognisable 64-byte signature. */
function stubSigner(overrides: Partial<SolanaProvider> = {}): SolanaProvider {
  return {
    connect: vi.fn(),
    signAndSendTransaction: vi.fn(),
    signMessage: vi.fn().mockResolvedValue({ signature: new Uint8Array(64).fill(7) }),
    ...overrides,
  } as unknown as SolanaProvider;
}

/**
 * A grant is two round trips now — `POST /challenge` then `POST /faucet` — so
 * the mock routes by URL rather than by call order. Routing by order would
 * pass even if the client sent the two requests the wrong way round.
 */
function mockFaucet(faucetResponse: { status: number; body: unknown }) {
  const fetchMock = vi.fn((url: string) => {
    if (String(url).endsWith("/challenge")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ challenge: CHALLENGE, expiresAt: "2026-01-01T00:00:00Z" }),
      });
    }
    return Promise.resolve({
      ok: faucetResponse.status < 400,
      status: faucetResponse.status,
      json: () => Promise.resolve(faucetResponse.body),
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The body the client sent to `/faucet` (the second call). */
function faucetBody(fetchMock: ReturnType<typeof mockFaucet>): Record<string, unknown> {
  const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/faucet"));
  if (!call) throw new Error("the client never called /faucet");
  const [, init] = call as unknown as [string, RequestInit];
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

function mockFetchOnce(status: number, body: unknown, ok = status < 400) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok, status, json: () => Promise.resolve(body) }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestFaucetDrip", () => {
  it("returns the signature and amounts on success", async () => {
    mockFaucet({ status: 200, body: { signature: "abc123", amounts: { USDC: 100, USDT: 100 } } });
    const result = await requestFaucetDrip("Some111Address", stubSigner());
    expect(result.signature).toBe("abc123");
    expect(result.amounts).toEqual({ USDC: 100, USDT: 100 });
  });

  it("signs the challenge the server issued, byte for byte", async () => {
    // The faucet only accepts a signature over the exact text it sent. A
    // client that composed its own message, or trimmed the server's, would
    // fail every request — and would do so only against the real service.
    const signer = stubSigner();
    const fetchMock = mockFaucet({ status: 200, body: { signature: "abc123", amounts: {} } });
    await requestFaucetDrip("Some111Address", signer, ["OPEN"]);

    const signMessage = signer.signMessage as unknown as ReturnType<typeof vi.fn>;
    const signed = signMessage.mock.calls[0][0] as Uint8Array;
    expect(new TextDecoder().decode(signed)).toBe(CHALLENGE);

    const body = faucetBody(fetchMock);
    expect(body.challenge).toBe(CHALLENGE);
    expect(body.signature).toBe(btoa(String.fromCharCode(...new Uint8Array(64).fill(7))));
  });

  it("asks for the challenge before sending the request", async () => {
    const fetchMock = mockFaucet({ status: 200, body: { signature: "s", amounts: {} } });
    await requestFaucetDrip("Some111Address", stubSigner());
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls[0]).toMatch(/\/challenge$/);
    expect(urls[1]).toMatch(/\/faucet$/);
  });

  it("sends no amount field — the server enforces the cap, not the client", async () => {
    const fetchMock = mockFaucet({
      status: 200,
      body: { signature: "abc123", amounts: { USDC: 100 } },
    });
    await requestFaucetDrip("Some111Address", stubSigner(), ["USDC"]);
    const body = faucetBody(fetchMock);
    // `assets`, not `mints`: the faucet dispenses native SOL as well as
    // tokens. The service still accepts `mints` as a legacy alias, so
    // sending the old name would keep working and this assertion is what
    // stops the app quietly staying on it.
    expect(body.assets).toEqual(["USDC"]);
    expect(body.address).toBe("Some111Address");
    expect(body.amount).toBeUndefined();
  });

  // SOL and OPEN are the two that make onboarding possible at all — SOL for
  // fees and account rent, OPEN to stake a role. A regression here would not
  // fail loudly; a tester would simply get stuck a few steps later.
  it("can request all four assets, including SOL and OPEN", async () => {
    const fetchMock = mockFaucet({
      status: 200,
      body: { signature: "abc123", amounts: { SOL: 0.01, USDC: 100, USDT: 100, OPEN: 12000 } },
    });
    const result = await requestFaucetDrip("Some111Address", stubSigner(), [
      "SOL",
      "USDC",
      "USDT",
      "OPEN",
    ]);
    expect(faucetBody(fetchMock).assets).toEqual(["SOL", "USDC", "USDT", "OPEN"]);
    expect(result.amounts.SOL).toBe(0.01);
    expect(result.amounts.OPEN).toBe(12000);
  });

  it("omits assets entirely when none are named, asking for the service's default set", async () => {
    const fetchMock = mockFaucet({ status: 200, body: { signature: "abc123", amounts: {} } });
    await requestFaucetDrip("Some111Address", stubSigner());
    expect("assets" in faucetBody(fetchMock)).toBe(false);
  });

  it("reports a declined wallet prompt as a decline, not a service failure", async () => {
    // Dismissing the prompt is the single most common way this ends, and
    // "the faucet is down" would send the user looking in the wrong place.
    mockFaucet({ status: 200, body: { signature: "s", amounts: {} } });
    const signer = stubSigner({
      signMessage: vi.fn().mockRejectedValue(new Error("User rejected the request.")),
    });
    await expect(requestFaucetDrip("Some111Address", signer)).rejects.toMatchObject({
      message: "Signature request was declined.",
    });
  });

  it("refuses up front if the wallet cannot sign messages at all", async () => {
    mockFaucet({ status: 200, body: { signature: "s", amounts: {} } });
    const signer = stubSigner({ signMessage: undefined });
    await expect(requestFaucetDrip("Some111Address", signer)).rejects.toBeInstanceOf(
      FaucetRequestError,
    );
  });

  it("does not call the wallet at all if the challenge request fails", async () => {
    // No point prompting someone to sign something that cannot be redeemed.
    mockFetchOnce(503, { error: "faucet unavailable" });
    const signer = stubSigner();
    await expect(requestFaucetDrip("Some111Address", signer)).rejects.toMatchObject({
      status: 503,
    });
    expect(signer.signMessage).not.toHaveBeenCalled();
  });

  it("throws FaucetRequestError with the server's message on a 429", async () => {
    mockFaucet({
      status: 429,
      body: { error: "rate limit exceeded for this wallet address (max 3 per 60000ms)" },
    });
    await expect(requestFaucetDrip("Some111Address", stubSigner())).rejects.toMatchObject({
      message: "rate limit exceeded for this wallet address (max 3 per 60000ms)",
      status: 429,
    });
  });

  it("surfaces a rejected challenge as the server described it", async () => {
    mockFaucet({ status: 401, body: { error: "challenge was issued for a different wallet" } });
    await expect(requestFaucetDrip("Some111Address", stubSigner())).rejects.toMatchObject({
      message: "challenge was issued for a different wallet",
      status: 401,
    });
  });

  it("falls back to a generic message if the error body isn't the expected shape", async () => {
    mockFaucet({ status: 502, body: "<html>gateway error</html>" });
    await expect(requestFaucetDrip("Some111Address", stubSigner())).rejects.toThrow(/HTTP 502/);
  });

  it("is an instance of FaucetRequestError, not a generic Error, on failure", async () => {
    mockFaucet({ status: 400, body: { error: "address is not valid base58" } });
    try {
      await requestFaucetDrip("not-valid", stubSigner());
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
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));
    expect(await fetchFaucetHealth()).toEqual({ status: "down" });
  });
});
