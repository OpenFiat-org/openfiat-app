import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The wallet-derived encryption key, and the two checks that keep it from
 * failing silently.
 *
 * Everything about this design rests on one assumption: the same wallet
 * produces the same signature for the same bytes. Ed25519 is deterministic
 * by construction (RFC 8032 §5.1.6 derives the per-signature nonce from the
 * private prefix and the message, with no randomness), which is why
 * re-deriving works on a device that has never seen this browser. But a
 * wallet that randomised its signatures anyway — or one that wrapped the
 * bytes in an envelope before signing — would publish a key it can never
 * derive again, and its owner would find out days later as unreadable
 * payment details on a live trade.
 *
 * So the assumption is checked rather than trusted, in two places, and both
 * are asserted here: `enrol` signs twice and compares before publishing
 * anything, and `channelIdentity` compares what it derives against what the
 * network holds.
 */

const sendSignedEvent = vi.hoisted(() => vi.fn());
const signPayload = vi.hoisted(() => vi.fn(async () => "signature"));
const fetchIdentityClaims = vi.hoisted(() => vi.fn());

vi.mock("@/lib/arbitration", () => ({ sendSignedEvent, signPayload }));
vi.mock("@/lib/live-identity", async () => {
  // `currentClaims` is real: which claim is in force is exactly the logic
  // under test when a key has been rotated, and mocking it away would leave
  // the interesting case untested.
  const actual = await vi.importActual<typeof import("@/lib/live-identity")>(
    "@/lib/live-identity",
  );
  return { ...actual, fetchIdentityClaims };
});
vi.mock("@/lib/node-endpoint", () => ({ nodeUrl: () => "http://127.0.0.1:7080" }));

import {
  channelIdentity,
  counterpartyEncryptionKey,
  enrol,
  forgetChannelIdentity,
  isUsableEncryptionKey,
} from "@/lib/channel-identity";
import type { SolanaProvider } from "@/lib/wallet-connection";

/** A real Solana address, so `peerIdForAddress` has 32 bytes to work with. */
const ADDRESS = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";

/** A wallet whose `signMessage` returns whatever it is told to. */
function walletReturning(...signatures: Uint8Array[]): SolanaProvider {
  let call = 0;
  return {
    signMessage: async () => ({
      signature: signatures[Math.min(call++, signatures.length - 1)]!,
    }),
  } as unknown as SolanaProvider;
}

const stableWallet = (seed = 1) => walletReturning(new Uint8Array(64).fill(seed));

function claim(value: string, overrides: Record<string, unknown> = {}) {
  return {
    claimId: "enc-1",
    type: "EncryptionKey",
    custom: false,
    value,
    verified: false,
    supersedes: null,
    expiresAt: null,
    revoked: false,
    createdAt: 1_000,
    ...overrides,
  };
}

/** What the published claim for `stableWallet(1)` must say. */
async function publishedValueFor(seed: number): Promise<string> {
  const { deriveEncryptionKeypair, encodeEncryptionPublicKey } = await import("@openfiat/sdk");
  return encodeEncryptionPublicKey(
    deriveEncryptionKeypair(new Uint8Array(64).fill(seed)).publicKey,
  );
}

beforeEach(() => {
  forgetChannelIdentity();
  sendSignedEvent.mockReset();
  signPayload.mockReset();
  signPayload.mockResolvedValue("signature");
  fetchIdentityClaims.mockReset();
  fetchIdentityClaims.mockResolvedValue([]);
});

afterEach(() => forgetChannelIdentity());

describe("enrolling", () => {
  it("publishes an EncryptionKey claim carrying the derived key", async () => {
    const keypair = await enrol(stableWallet(1), ADDRESS);
    expect(sendSignedEvent).toHaveBeenCalledTimes(1);
    const [, method, envelope] = sendSignedEvent.mock.calls[0]!;
    expect(method).toBe("sendClaimPublish");
    const { publish } = envelope as { publish: Record<string, unknown> };
    expect(publish.claim_type).toBe("EncryptionKey");
    expect(publish.value).toBe(await publishedValueFor(1));
    expect(publish.value).toBe(
      (await import("@openfiat/sdk")).encodeEncryptionPublicKey(keypair.publicKey),
    );
  });

  it("writes the claim's keys in the order the node re-serializes them", async () => {
    // Load-bearing and silent when wrong: the node verifies the signature
    // over its own `serde_json` rendering, which follows struct declaration
    // order. A reordered key is a valid signature over the wrong bytes and
    // comes back as INVALID_SIGNATURE with nothing to distinguish it from a
    // wallet fault.
    await enrol(stableWallet(1), ADDRESS);
    const { publish } = sendSignedEvent.mock.calls[0]![2] as { publish: object };
    expect(Object.keys(publish)).toEqual([
      "id",
      "wallet",
      "wallet_public_key",
      "claim_type",
      "value",
      "verified",
      "supersedes",
      "expires_at",
      "timestamp",
    ]);
  });

  it("sends the optional fields as explicit nulls rather than omitting them", async () => {
    // `serde_json` renders `None` as `null`, so an absent key changes the
    // bytes the node hashes.
    await enrol(stableWallet(1), ADDRESS);
    const { publish } = sendSignedEvent.mock.calls[0]![2] as {
      publish: Record<string, unknown>;
    };
    expect(publish).toHaveProperty("supersedes", null);
    expect(publish).toHaveProperty("expires_at", null);
  });

  it("links a rotation to the claim it replaces", async () => {
    await enrol(stableWallet(1), ADDRESS, "enc-old");
    const { publish } = sendSignedEvent.mock.calls[0]![2] as {
      publish: Record<string, unknown>;
    };
    expect(publish.supersedes).toBe("enc-old");
  });

  it("refuses a wallet that signs the same message two different ways", async () => {
    // The whole reason for the second prompt. Publishing here would put a
    // key on the network that this wallet can never derive again, and the
    // failure would surface on a live trade as unreadable payment details.
    const flaky = walletReturning(new Uint8Array(64).fill(1), new Uint8Array(64).fill(2));
    await expect(enrol(flaky, ADDRESS)).rejects.toThrow(/two different signatures/);
    expect(sendSignedEvent).not.toHaveBeenCalled();
  });

  it("refuses a wallet that cannot sign messages at all", async () => {
    await expect(enrol({} as SolanaProvider, ADDRESS)).rejects.toThrow(/cannot sign messages/);
    expect(sendSignedEvent).not.toHaveBeenCalled();
  });

  it("refuses a signature that is not 64 bytes", async () => {
    // Reachable from a wallet that wraps or truncates. Hashing it would
    // produce a key nobody else will ever compute.
    await expect(enrol(walletReturning(new Uint8Array(32)), ADDRESS)).rejects.toThrow(/64/);
    expect(sendSignedEvent).not.toHaveBeenCalled();
  });

  it("uses an unpredictable claim id", async () => {
    // A node refuses a duplicate ClaimId network-wide, so a predictable id
    // could be squatted by anyone willing to publish it first — locking a
    // wallet out of ever enrolling.
    await enrol(stableWallet(1), ADDRESS);
    forgetChannelIdentity();
    await enrol(stableWallet(1), ADDRESS);
    const ids = sendSignedEvent.mock.calls.map(
      (call) => (call[2] as { publish: { id: string } }).publish.id,
    );
    expect(ids[0]).not.toBe(ids[1]);
    expect(ids[0]).not.toContain(ADDRESS);
  });
});

describe("where a wallet stands", () => {
  it("is ready when what it derives is what the network holds", async () => {
    fetchIdentityClaims.mockResolvedValue([claim(await publishedValueFor(1))]);
    const state = await channelIdentity(stableWallet(1), ADDRESS);
    expect(state.status).toBe("ready");
  });

  it("is not-published when the wallet has published nothing", async () => {
    fetchIdentityClaims.mockResolvedValue([]);
    expect((await channelIdentity(stableWallet(1), ADDRESS)).status).toBe("not-published");
  });

  it("reports a mismatch rather than repairing it", async () => {
    // A wallet that has changed its signing behaviour, or a second wallet
    // application over the same seed, means every existing channel is now
    // unreadable. Silently republishing would hide that from the one person
    // who needs to know.
    fetchIdentityClaims.mockResolvedValue([await publishedValueFor(9)].map((v) => claim(v)));
    const state = await channelIdentity(stableWallet(1), ADDRESS);
    expect(state.status).toBe("mismatch");
    if (state.status !== "mismatch") return;
    expect(state.published).toBe(await publishedValueFor(9));
    expect(state.publishedClaimId).toBe("enc-1");
    expect(sendSignedEvent).not.toHaveBeenCalled();
  });

  it("ignores a revoked or superseded key when deciding what is current", async () => {
    fetchIdentityClaims.mockResolvedValue([
      claim(await publishedValueFor(9), { claimId: "enc-old" }),
      claim(await publishedValueFor(1), {
        claimId: "enc-new",
        supersedes: "enc-old",
        createdAt: 2_000,
      }),
    ]);
    expect((await channelIdentity(stableWallet(1), ADDRESS)).status).toBe("ready");
  });

  it("derives once per tab, not once per question", async () => {
    // The secret is held in memory and never written anywhere, so the cost
    // of not caching is a wallet prompt on every read of every channel.
    const wallet = stableWallet(1);
    const spy = vi.spyOn(wallet, "signMessage" as never);
    fetchIdentityClaims.mockResolvedValue([claim(await publishedValueFor(1))]);
    await channelIdentity(wallet, ADDRESS);
    await channelIdentity(wallet, ADDRESS);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("finding a counterparty's key", () => {
  it("returns the key they published", async () => {
    fetchIdentityClaims.mockResolvedValue([claim(await publishedValueFor(2))]);
    const key = await counterpartyEncryptionKey(ADDRESS);
    expect(key).not.toBeNull();
    expect(key).toHaveLength(32);
  });

  it("returns null when they have published none", async () => {
    // A real answer a caller must surface. Falling back to their wallet key
    // is exactly how a channel ends up sealed to somebody who cannot open
    // it — invisibly, because the granter's own copy reads fine.
    fetchIdentityClaims.mockResolvedValue([claim("anything", { type: "Email" })]);
    expect(await counterpartyEncryptionKey(ADDRESS)).toBeNull();
  });

  it("returns null for a small-order point even though a node should have refused it", async () => {
    // Base58 of 32 zero bytes: the X25519 identity. A grant sealed to it has
    // a shared secret every node holding a replica can compute. This client
    // must not depend on every node in the network having validated it.
    fetchIdentityClaims.mockResolvedValue([claim("1".repeat(32))]);
    expect(await counterpartyEncryptionKey(ADDRESS)).toBeNull();
    expect(isUsableEncryptionKey("1".repeat(32))).toBe(false);
  });

  it("returns null for a value that is not a key at all", async () => {
    fetchIdentityClaims.mockResolvedValue([claim("user@example.com")]);
    expect(await counterpartyEncryptionKey(ADDRESS)).toBeNull();
  });
});

describe("forgetting", () => {
  it("drops the derived key when the connected wallet changes", async () => {
    // Keyed by address, so a second wallet could never read the first's key
    // by accident. This is for the person who disconnects: a key that opens
    // every one of their trade conversations must not outlive the session
    // they believe they ended.
    const wallet = stableWallet(1);
    const spy = vi.spyOn(wallet, "signMessage" as never);
    fetchIdentityClaims.mockResolvedValue([claim(await publishedValueFor(1))]);
    await channelIdentity(wallet, ADDRESS);
    window.dispatchEvent(new CustomEvent("openfiat:wallet-changed"));
    await channelIdentity(wallet, ADDRESS);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
