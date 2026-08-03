/**
 * `lib/live-risk.ts`: the three different things "no flag" can mean.
 *
 * `getWalletScreening` answers `highest_severity: null` for all three, and
 * they are worth completely different amounts to somebody deciding whether
 * to deal with a stranger. This is the same "empty is not unreachable"
 * discipline the rest of this app applies to nodes, one level further in —
 * and the extra level matters here, because the failure mode is a green tick
 * over a network where nothing is screening anything.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const nodeRpc = vi.fn();
const getProviders = vi.fn();

vi.mock("@/lib/node-rpc", () => ({
  nodeRpc: (...args: unknown[]) => nodeRpc(...args),
  NodeRpcError: class extends Error {},
}));

vi.mock("@openfiat/sdk", () => ({
  Client: class {
    constructor(public options: unknown) {}
  },
  providers: {
    getProviders: (...args: unknown[]) => getProviders(...args),
  },
  peerIdFromPublicKey: (key: Uint8Array) =>
    new Uint8Array([0x00, 0x24, 0x08, 0x01, 0x12, 0x20, ...key]),
}));

const { fetchScreening, isExpired } = await import("@/lib/live-risk");

/** A real base58 PeerId, so `peerIdParam` accepts it. */
const WALLET = "12D3KooWK9hQ7TwbfvFiaAxUbRFCkdhS7iEpAJDnewNL1anyREQ1";

function riskRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "risk-1",
    provider: "12D3KooWProvider",
    wallet: WALLET,
    category: "BlockchainAnalytics",
    outcome: "Flagged",
    severity: "High",
    confidence: "High",
    reason: "Received funds from a wallet on a sanctions list.",
    evidence: ["case-9910"],
    published_at: 1_785_000_000_000,
    expires_at: null,
    ...overrides,
  };
}

function securityService() {
  return { service_type: { Security: "RiskIntelligenceProvider" }, service_id: "risk-1" };
}

function answers(screening: unknown, history: unknown) {
  nodeRpc.mockImplementation((_endpoint: string, method: string) =>
    Promise.resolve(method === "getWalletScreening" ? screening : history),
  );
}

beforeEach(() => {
  nodeRpc.mockReset();
  getProviders.mockReset();
});

describe("what an absent flag means", () => {
  it("distinguishes a network with nothing screening it", async () => {
    // The state the devnet is in. Only a registered provider may publish a
    // record (§5), so with none registered every wallet screens clean —
    // including the ones that should not. A tick here would be invented.
    getProviders.mockResolvedValue([]);
    answers({ wallet: WALLET, highest_severity: null, active_flags: [] }, []);

    const screening = await fetchScreening("http://node.invalid", WALLET);
    expect(screening.registeredProviders).toBe(0);
    expect(screening.highestSeverity).toBeNull();
    expect(screening.history).toEqual([]);
  });

  it("distinguishes a wallet nobody has ever looked at", async () => {
    getProviders.mockResolvedValue([securityService()]);
    answers({ wallet: WALLET, highest_severity: null, active_flags: [] }, []);

    const screening = await fetchScreening("http://node.invalid", WALLET);
    // Somebody could have reported and nobody has. Not the same as looking
    // and finding nothing.
    expect(screening.registeredProviders).toBe(1);
    expect(screening.history).toEqual([]);
  });

  it("distinguishes a wallet that was reported on and cleared", async () => {
    getProviders.mockResolvedValue([securityService()]);
    answers(
      { wallet: WALLET, highest_severity: null, active_flags: [] },
      [riskRecord(), riskRecord({ id: "risk-2", outcome: "Cleared", published_at: 1_785_100_000_000 })],
    );

    const screening = await fetchScreening("http://node.invalid", WALLET);
    // §14 keeps every record for audit, which is the only reason this case
    // is recoverable from the wire at all.
    expect(screening.highestSeverity).toBeNull();
    expect(screening.history).toHaveLength(2);
    // Newest first, so the record that superseded the flag reads first.
    expect(screening.history[0]!.id).toBe("risk-2");
  });
});

describe("a flagged wallet", () => {
  it("carries the severity and the records behind it", async () => {
    getProviders.mockResolvedValue([securityService()]);
    answers({ wallet: WALLET, highest_severity: "High", active_flags: [riskRecord()] }, [riskRecord()]);

    const screening = await fetchScreening("http://node.invalid", WALLET);
    expect(screening.highestSeverity).toBe("High");
    // Attributed. A severity with no publisher beside it is an accusation
    // from nobody, and OFS-7100 makes registration the whole basis for
    // taking a record seriously.
    expect(screening.activeFlags[0]!.provider).toBe("12D3KooWProvider");
    expect(screening.activeFlags[0]!.evidence).toEqual(["case-9910"]);
  });

  it("keeps a record with no expiry as one that has not expired", async () => {
    // `expires_at: null` means permanent, not lapsed. Reading it as zero
    // would quietly retire every permanent flag in the system.
    const permanent = {
      id: "r",
      provider: "p",
      wallet: WALLET,
      category: "Compliance" as const,
      outcome: "Flagged" as const,
      severity: "Critical" as const,
      confidence: "High" as const,
      reason: "",
      evidence: [],
      publishedAt: 0,
      expiresAt: null,
    };
    expect(isExpired(permanent, Date.now())).toBe(false);
    expect(isExpired({ ...permanent, expiresAt: 10 }, 11)).toBe(true);
    expect(isExpired({ ...permanent, expiresAt: 10 }, 9)).toBe(false);
  });
});

describe("an unreachable node", () => {
  it("throws rather than screening clean", async () => {
    // The one failure that would matter: a timeout rendered as "no flags".
    getProviders.mockResolvedValue([]);
    nodeRpc.mockRejectedValue(new Error("connection refused"));
    await expect(fetchScreening("http://node.invalid", WALLET)).rejects.toThrow();
  });
});
