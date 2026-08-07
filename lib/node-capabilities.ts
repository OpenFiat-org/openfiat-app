/**
 * What a node's registration says about itself, and what none of it proves.
 *
 * # These are claims
 *
 * A Service Registry entry (OFS-1500) is signed by the node's own key and
 * carries what its operator configured. Nothing in it is verified by
 * anybody: a node claiming `chain:rpc` may have no Solana endpoint at all,
 * and the registry would replicate that claim to the whole network exactly
 * the same way. So this module produces `claims`, the UI says "claims", and
 * nothing here gets a checkmark.
 *
 * It is a claim that fails visibly in one direction, which is why it is
 * worth showing beside an observation. A node that is not reading Solana
 * has no slot to hand over, and anyone can ask for one — so a `chain:rpc`
 * claim with no slot behind it is a contradiction anybody can see.
 *
 * The converse does not hold, and assuming it did would be the same
 * mistake pointed the other way: a gossip-only node answers with a slot
 * perfectly well, because relaying on-chain facts second-hand is what
 * gossip is for. Measured on this project's own devnet, the gossip-only
 * node returned the same slot as the RPC-connected one. So an answer is
 * reported as what it is — the node had a slot — and never as proof of a
 * chain connection.
 *
 * # Unknown strings are kept
 *
 * The capability vocabulary is a list of strings a node emits, and it will
 * grow. A reader that understood four of them and dropped the fifth would
 * hide the newest thing a node can do, silently, and would keep looking
 * correct while doing it. So anything with no reading here survives as
 * itself in `unrecognised` and is rendered verbatim.
 *
 * The strings, as `openfiat-node` derives them from its running config:
 * `chain:rpc` | `chain:gossip`, `content:serving`, `retention:<window>`
 * (e.g. `retention:rolling 30d`, `retention:archival (everything)`), and
 * `snapshots:producing`.
 */

export interface NodeClaims {
  /**
   * The chain bridge the node says it runs, or `null` if it claimed
   * neither.
   *
   * It changes what the node's on-chain answers are worth: an
   * `RpcConnected` node reads Solana itself, a `GossipOnly` node learns
   * the same facts second-hand over gossip and can lag behind them.
   */
  chainMode: "RpcConnected" | "GossipOnly" | null;
  /**
   * Whether the node says it holds and serves protocol content — which
   * decides whether it can hand over an attachment or an avatar itself.
   */
  servesContent: boolean;
  /**
   * The retention window as the node worded it, e.g. `rolling 30d` or
   * `archival (everything)`; `null` if it declared none.
   *
   * Passed through rather than parsed into days. It decides how far back
   * the node can answer for evidence, and re-wording it here would put
   * this app's vocabulary in front of the node's own.
   */
  retention: string | null;
  /** Whether the node says it produces snapshots other nodes can fetch. */
  producesSnapshots: boolean;
  /**
   * Every capability string with no reading above, exactly as received.
   *
   * Not a fallback — the point. A UI that renders only the capabilities it
   * was written against goes quietly out of date.
   */
  unrecognised: string[];
}

const CHAIN_MODES: Record<string, NodeClaims["chainMode"]> = {
  "chain:rpc": "RpcConnected",
  "chain:gossip": "GossipOnly",
};

/** Reads a registration's capability strings. Never throws, never drops one. */
export function readCapabilities(capabilities: readonly string[]): NodeClaims {
  const claims: NodeClaims = {
    chainMode: null,
    servesContent: false,
    retention: null,
    producesSnapshots: false,
    unrecognised: [],
  };

  for (const raw of capabilities) {
    const capability = raw.trim();
    if (capability === "") continue;

    if (capability in CHAIN_MODES) {
      claims.chainMode = CHAIN_MODES[capability]!;
    } else if (capability === "content:serving") {
      claims.servesContent = true;
    } else if (capability === "snapshots:producing") {
      claims.producesSnapshots = true;
    } else if (capability.startsWith("retention:")) {
      claims.retention = capability.slice("retention:".length);
    } else {
      claims.unrecognised.push(capability);
    }
  }

  return claims;
}

/*
 * The chain mode a node claims and the one-phrase result of probing
 * `getChainStatus` are both rendered from the raw value now, through the
 * `network`/`providers` catalogues, so they read in the viewer's language and
 * can never be phrased as verified. See `components/network/live-network.tsx`
 * (`observationLabel`) and `providers`/`network`'s `chainClaim`/`chainMode`
 * keys — there is no lib-side English sentence to drift out of the UI's.
 */

/** What a probe of `getChainStatus` establishes. Consumers render it via the
 *  catalogue keyed on `kind` (plus the slot for `answered`). */
export type ChainObservation =
  /**
   * The node answered with a slot. It had one to give — which a gossip-only
   * node can, so this is not evidence of a chain connection.
   */
  | { kind: "answered"; slot: number }
  /** The node was reachable but returned no slot. */
  | { kind: "no-slot" }
  /** The node could not be reached at all, so nothing was observed. */
  | { kind: "unreachable" }
  /** Not asked yet. */
  | { kind: "pending" };

/**
 * Whether a node's claim and what it actually answered disagree.
 *
 * Only in the direction that misleads. A node claiming `chain:rpc` that
 * answers no slot is offering chain answers it cannot source, and someone
 * choosing an access node on that claim needs to see it.
 *
 * A node claiming `chain:gossip` that answers with a slot is NOT a
 * contradiction — that is gossip working, not a node caught out — and
 * flagging it would train a reader to ignore the flag.
 */
export function claimContradicted(
  mode: NodeClaims["chainMode"],
  observation: ChainObservation,
): boolean {
  return mode === "RpcConnected" && observation.kind === "no-slot";
}
