import bs58 from "bs58";
import { afterEach, describe, expect, it, vi } from "vitest";
import { signedReadStatus } from "@/components/use-signed-read";
import { COUNTERPARTIES } from "@/lib/counterparties";
import { MY_DISPUTES } from "@/lib/live-disputes";
import { MY_SETTLEMENTS } from "@/lib/live-settlements";
import {
  cachedRead,
  classifyFailure,
  forgetSignedReads,
  signedRead,
  WalletProofError,
} from "@/lib/wallet-proof";
import type { SolanaProvider } from "@/lib/wallet-connection";

/**
 * The handshake that stands between a stranger and the trade graph.
 *
 * Asserted against the JSON-RPC bodies actually put on the wire rather than
 * against the helpers' return values: what matters is which method is called,
 * which bytes get signed, and what happens when the node says no — and every
 * one of those is invisible from inside.
 */

/** 32 bytes of 0x01, base58-encoded — well-formed as far as derivation goes. */
const ADDRESS = bs58.encode(new Uint8Array(32).fill(1));

interface Call {
  method: string;
  params: Record<string, string>;
}

/**
 * A node that issues one nonce and then answers `result` — plus a record of
 * what it was asked and what the wallet was given to sign.
 */
function fakeNode(result: unknown, error?: string) {
  const calls: Call[] = [];
  const signed: string[] = [];

  const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as Call;
    calls.push(body);
    if (body.method.endsWith("Challenge")) {
      return {
        json: async () => ({
          result: { subject: body.params.wallet, nonce: "nonce-1", expires_at: 9_999 },
        }),
      };
    }
    return { json: async () => (error ? { error: { message: error } } : { result }) };
  });
  vi.stubGlobal("fetch", fetchMock);

  const signer: SolanaProvider = {
    connect: async () => ({ publicKey: { toString: () => ADDRESS } }),
    signAndSendTransaction: async () => ({ signature: "" }),
    signMessage: async (message: Uint8Array) => {
      signed.push(new TextDecoder().decode(message));
      return { signature: new Uint8Array(64).fill(3) };
    },
  };

  return { calls, signed, signer, fetchMock };
}

afterEach(() => {
  vi.unstubAllGlobals();
  forgetSignedReads();
});

describe("the gated read handshake", () => {
  it("asks the surface's own issuer for a nonce, then presents the proof", async () => {
    const node = fakeNode([]);
    await signedRead("https://node.example/", "getMySettlements", ADDRESS, node.signer, MY_SETTLEMENTS);

    expect(node.calls.map((c) => c.method)).toEqual(["getWalletChallenge", "getMySettlements"]);

    const proof = node.calls[1].params;
    // The wallet is named as a base64 PeerId and the key is sent explicitly,
    // because the identity claim is something the caller states and the node
    // checks — not something the node infers on the caller's behalf.
    expect(Object.keys(proof).sort()).toEqual(["nonce", "public_key", "signature", "wallet"]);
    expect(proof.wallet).toBe(node.calls[0].params.wallet);
    expect(proof.public_key).toBe(btoa(String.fromCharCode(...bs58.decode(ADDRESS))));
    expect(proof.nonce).toBe("nonce-1");
  });

  it("signs the domain, the subject and the nonce, in that order", async () => {
    const node = fakeNode([]);
    await signedRead("https://node.example", "getMyDisputes", ADDRESS, node.signer, MY_DISPUTES);

    const wallet = node.calls[0].params.wallet;
    expect(node.signed).toEqual([`openfiat-my-disputes:${wallet}:nonce-1`]);
  });

  /**
   * The one thing keeping the gated surfaces apart. They draw nonces from one
   * ledger on the node and name their subject identically, so if two surfaces
   * ever signed the same bytes, a signature collected for the harmless one
   * would open the other.
   */
  it("signs different bytes for every surface", async () => {
    const domains = new Set<string>();
    for (const surface of [COUNTERPARTIES, MY_SETTLEMENTS, MY_DISPUTES]) {
      const node = fakeNode([]);
      await signedRead("https://node.example", "x", ADDRESS, node.signer, surface);
      domains.add(node.signed[0].split(":")[0]);
      vi.unstubAllGlobals();
    }
    expect(domains).toEqual(
      new Set(["openfiat-counterparties", "openfiat-my-settlements", "openfiat-my-disputes"]),
    );
  });

  it("uses the shared issuer for the new surfaces and the old one for counterparties", async () => {
    // Both exist on the node and both draw from the same challenge ledger.
    // Counterparties stays on its own so the read keeps working against nodes
    // that have not taken the redaction yet.
    expect(MY_SETTLEMENTS.challenge).toBe("getWalletChallenge");
    expect(MY_DISPUTES.challenge).toBe("getWalletChallenge");
    expect(COUNTERPARTIES.challenge).toBe("getCounterpartiesChallenge");
  });

  /**
   * The load-bearing failure. A node refusing to answer for a wallet the
   * caller cannot prove is not "no records found" — they are opposite
   * answers, and a screen that renders the refusal as an empty list tells
   * someone their disputes do not exist.
   */
  it("raises a refusal rather than returning nothing", async () => {
    const node = fakeNode(null, "APPLICATION_ERROR: INVALID_IDENTITY_CLAIM");
    const refused = signedRead("https://node.example", "getMyDisputes", ADDRESS, node.signer, MY_DISPUTES);

    await expect(refused).rejects.toBeInstanceOf(WalletProofError);
    await expect(refused).rejects.toMatchObject({ kind: "not-your-wallet" });
    // In this surface's own words: the roster of a case is not the same thing
    // as a wallet's trading history, and neither message describes the other.
    await expect(refused).rejects.toThrow(/seated on it/);
  });

  it("refuses before the network when the wallet cannot sign at all", async () => {
    const node = fakeNode([]);
    // A connection restored from storage for a provider that is no longer
    // injected looks exactly like this.
    const cannotSign: SolanaProvider = { ...node.signer, signMessage: undefined };

    await expect(
      signedRead("https://node.example", "getMySettlements", ADDRESS, cannotSign, MY_SETTLEMENTS),
    ).rejects.toMatchObject({ kind: "wallet-cannot-sign" });
    // No nonce was spent finding this out.
    expect(node.fetchMock).not.toHaveBeenCalled();
  });

  it("refuses an address that is not a protocol identity", async () => {
    const node = fakeNode([]);
    await expect(
      signedRead("https://node.example", "getMySettlements", "not-a-key", node.signer, MY_SETTLEMENTS),
    ).rejects.toMatchObject({ kind: "not-your-wallet" });
  });

  it("reads a node error for what it is", () => {
    expect(classifyFailure("APPLICATION_ERROR: INVALID_IDENTITY_CLAIM")).toBe("not-your-wallet");
    expect(classifyFailure("INVALID_SIGNATURE")).toBe("wrong-key");
    expect(classifyFailure("INVALID_REQUEST")).toBe("challenge-expired");
    expect(classifyFailure("RESOURCE_NOT_FOUND")).toBe("challenge-spent");
    expect(classifyFailure("socket hang up")).toBe("unreachable");
  });
});

describe("caching a read that costs a wallet prompt", () => {
  it("serves concurrent callers one signature", async () => {
    const node = fakeNode([{ id: "d1" }]);
    const cache = cachedRead((endpoint: string, address: string, signer: SolanaProvider) =>
      signedRead<unknown[]>(endpoint, "getMyDisputes", address, signer, MY_DISPUTES),
    );

    const [a, b] = await Promise.all([
      cache.load("https://node.example", ADDRESS, node.signer),
      cache.load("https://node.example", ADDRESS, node.signer),
    ]);

    expect(a).toBe(b);
    expect(node.signed).toHaveLength(1);
  });

  it("does not answer one wallet with another's records", async () => {
    const node = fakeNode([]);
    const cache = cachedRead((endpoint: string, address: string, signer: SolanaProvider) =>
      signedRead<unknown[]>(endpoint, "getMyDisputes", address, signer, MY_DISPUTES),
    );
    const other = bs58.encode(new Uint8Array(32).fill(2));

    await cache.load("https://node.example", ADDRESS, node.signer);
    expect(cache.peek("https://node.example", other)).toBeUndefined();
    // Nor one node's with another's: a case exists on the node that has seen
    // it, and the same wallet on a different node has a different answer.
    expect(cache.peek("https://other.example", ADDRESS)).toBeUndefined();
  });

  it("forgets a failure, so a node that was briefly down can be retried", async () => {
    const node = fakeNode(null, "socket hang up");
    const cache = cachedRead((endpoint: string, address: string, signer: SolanaProvider) =>
      signedRead<unknown[]>(endpoint, "getMyDisputes", address, signer, MY_DISPUTES),
    );

    await expect(cache.load("https://node.example", ADDRESS, node.signer)).rejects.toThrow();
    expect(cache.peek("https://node.example", ADDRESS)).toBeUndefined();
  });

  /**
   * A second wallet on the same machine seeing the first one's records would
   * be the disclosure this whole mechanism exists to prevent, so a wallet
   * change drops every cache rather than the one the caller remembered.
   */
  it("drops every surface at once when the wallet changes", async () => {
    const node = fakeNode([]);
    const first = cachedRead((endpoint: string, address: string, signer: SolanaProvider) =>
      signedRead<unknown[]>(endpoint, "getMyDisputes", address, signer, MY_DISPUTES),
    );
    const second = cachedRead((endpoint: string, address: string, signer: SolanaProvider) =>
      signedRead<unknown[]>(endpoint, "getMySettlements", address, signer, MY_SETTLEMENTS),
    );

    await first.load("https://node.example", ADDRESS, node.signer);
    await second.load("https://node.example", ADDRESS, node.signer);
    forgetSignedReads();

    expect(first.peek("https://node.example", ADDRESS)).toBeUndefined();
    expect(second.peek("https://node.example", ADDRESS)).toBeUndefined();
  });
});

describe("what a screen is told before anyone has signed", () => {
  /**
   * "No wallet connected" and "connected, and there is nothing" have to stay
   * distinguishable all the way to the copy. Collapsing them is how a page
   * ends up telling someone they have no disputes when they have not been
   * asked to sign yet.
   */
  it("never reports an unconnected wallet as a completed empty read", () => {
    expect(signedReadStatus({ connected: false, loading: false, loaded: false, failed: false })).toBe(
      "no-wallet",
    );
    expect(signedReadStatus({ connected: false, loading: false, loaded: true, failed: false })).toBe(
      "no-wallet",
    );
  });

  it("waits to be asked rather than reading on sight", () => {
    expect(signedReadStatus({ connected: true, loading: false, loaded: false, failed: false })).toBe(
      "ready",
    );
  });

  it("keeps a failure distinct from an empty result", () => {
    expect(signedReadStatus({ connected: true, loading: false, loaded: false, failed: true })).toBe(
      "failed",
    );
    expect(signedReadStatus({ connected: true, loading: false, loaded: true, failed: false })).toBe(
      "loaded",
    );
  });

  it("reports loading over anything it might already hold", () => {
    expect(signedReadStatus({ connected: true, loading: true, loaded: true, failed: false })).toBe(
      "loading",
    );
  });
});
