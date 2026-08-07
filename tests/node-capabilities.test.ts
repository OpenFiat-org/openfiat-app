import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import {
  claimContradicted,
  readCapabilities,
} from "@/lib/node-capabilities";

/**
 * A node's registration describes itself now: chain mode, content
 * serving, retention window, snapshots. All of it signed by the node
 * about itself, so the two things that can go wrong here are presenting a
 * claim as a verified fact, and dropping a capability string this build
 * has never heard of.
 *
 * The second is the one that fails silently. The vocabulary is a list of
 * strings and it will grow; a reader that understands four and discards
 * the fifth hides the newest thing a node can do while continuing to look
 * correct.
 */
describe("readCapabilities", () => {
  it("reads what a fully-configured node registers", () => {
    const claims = readCapabilities([
      "chain:rpc",
      "retention:archival (everything)",
      "content:serving",
      "snapshots:producing",
    ]);
    expect(claims.chainMode).toBe("RpcConnected");
    expect(claims.retention).toBe("archival (everything)");
    expect(claims.servesContent).toBe(true);
    expect(claims.producesSnapshots).toBe(true);
    expect(claims.unrecognised).toEqual([]);
  });

  it("reads a gossip-only node that serves no content", () => {
    const claims = readCapabilities(["chain:gossip", "retention:rolling 30d"]);
    expect(claims.chainMode).toBe("GossipOnly");
    // A retention window with a space in it. Passed through as the node
    // worded it rather than parsed into days — this app's vocabulary does
    // not get to sit in front of the node's.
    expect(claims.retention).toBe("rolling 30d");
    expect(claims.servesContent).toBe(false);
    expect(claims.producesSnapshots).toBe(false);
  });

  /*
   * The whole point. A capability nothing here has a reading for must
   * arrive on screen as itself.
   */
  it("keeps a capability it has never seen, verbatim", () => {
    const claims = readCapabilities(["chain:rpc", "swqos:leader-tpu", "arbitration:panel"]);
    expect(claims.unrecognised).toEqual(["swqos:leader-tpu", "arbitration:panel"]);
    expect(claims.chainMode).toBe("RpcConnected");
  });

  /*
   * "Declared gossip-only" and "declared nothing" are different answers.
   * Rounding the second down to the first is how every node in a
   * directory came to be labelled second-hand regardless of what it ran.
   */
  it("returns null for a registration that declared no chain mode", () => {
    expect(readCapabilities([]).chainMode).toBeNull();
    expect(readCapabilities(["content:serving"]).chainMode).toBeNull();
  });

  it("ignores blank entries without counting them as unknown capabilities", () => {
    expect(readCapabilities(["", "  "]).unrecognised).toEqual([]);
  });
});

describe("chain-mode claim wording", () => {
  /*
   * The wording is the safeguard, and it moved to the message catalogue when
   * the network/providers surfaces were localized. "RPC-connected" states as
   * fact something signed only by the party it flatters; "Claims RPC-connected"
   * does not. Asserted here against the English source of truth.
   */
  it("never phrases a claim as an established fact", () => {
    const network = (en as { network: { chainMode: Record<string, string> } }).network.chainMode;
    const providers = (en as { providers: { chainClaim: Record<string, string> } }).providers.chainClaim;
    expect(network.RpcConnected).toBe("Claims RPC-connected");
    expect(network.GossipOnly).toBe("Claims gossip-only");
    expect(network.none).toBe("No chain mode declared");
    for (const copy of [...Object.values(network), ...Object.values(providers)]) {
      expect(copy).not.toMatch(/[✓✔]/);
      expect(copy).not.toMatch(/\bverified\b/i);
    }
  });
});

describe("claimContradicted", () => {
  /*
   * Only in the direction that misleads. A node claiming rpc that cannot
   * produce a slot is offering chain answers it has no source for, and
   * somebody picking an access node on that claim needs to see it.
   */
  it("flags a node that claims to read Solana and answers with no slot", () => {
    expect(claimContradicted("RpcConnected", { kind: "no-slot" })).toBe(true);
  });

  it("does not flag a node doing more than it advertised", () => {
    expect(claimContradicted("GossipOnly", { kind: "answered", slot: 12 })).toBe(false);
  });

  it("does not turn an unreachable node into a contradicted claim", () => {
    // Nothing was observed, which is not the same as observing nothing.
    expect(claimContradicted("RpcConnected", { kind: "unreachable" })).toBe(false);
    expect(claimContradicted("RpcConnected", { kind: "pending" })).toBe(false);
  });
});
