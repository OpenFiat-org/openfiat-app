import { Client, providers, type ServiceRecord } from "@openfiat/sdk";

import { knownNodes, type KnownNode } from "@/lib/node-endpoint";

/**
 * Which nodes this interface knows it can talk to.
 *
 * # Why a build-time list was never going to be right
 *
 * `knownNodes()` is a constant compiled into the app. It is the seed —
 * how a browser reaches the network at all before it knows anything — and
 * it cannot be anything more, because a list fixed at build time cannot
 * grow when someone launches a node. That is why the network view showed
 * exactly one node: there is one in the constant.
 *
 * Nodes that want to be used announce themselves. An operator who sets
 * `--public-rpc-url` makes their node register in the Service Registry
 * (OFS-1500) as a `PublicApiNode`, signed with its own key, and that
 * registration replicates to every node on the network. So the honest
 * list is the seed plus whatever the seed's registry reports — and it
 * grows as operators join, with no release of this app.
 *
 * # What a registration is and is not
 *
 * It is a claim: "this URL reaches me", signed by the key that made it.
 * It is not evidence the node is up, or fast, or honest. So this returns
 * candidates, and the caller measures them — `components/network`
 * contacts every one and shows the ones that fail as failing, rather than
 * hiding them. A list that only showed reachable nodes would quietly
 * answer a different question than the one being asked.
 */

/** Registry service types that denote a node a client can talk to. */
const NODE_SERVICE_TYPES = new Set(["PublicApiNode", "BootstrapNode"]);

function isNodeService(record: ServiceRecord): boolean {
  const category = Object.entries(record.service_type)[0];
  if (!category) return false;
  const [group, variant] = category;
  return group === "Infrastructure" && NODE_SERVICE_TYPES.has(String(variant));
}

/** Trailing slashes and case differences must not produce two entries. */
function canonical(url: string): string {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}

/**
 * The seed nodes plus every node the seed's registry advertises.
 *
 * Ordered seed-first, then by service id, so the list a visitor sees is
 * stable between loads rather than reordering with whatever the registry
 * happened to return.
 *
 * Never throws: an unreachable seed means the registry could not be read,
 * which leaves the seed itself — still the truth about what this build
 * knows, just no richer.
 */
export async function discoverNodes(): Promise<KnownNode[]> {
  const seeds = knownNodes();
  const seen = new Set(seeds.map((node) => canonical(node.url)));
  const discovered: KnownNode[] = [];

  for (const seed of seeds) {
    let records: ServiceRecord[];
    try {
      records = await providers.getProviders(
        new Client({ endpoint: seed.url, timeoutMs: 5_000 }),
      );
    } catch {
      continue;
    }

    for (const record of records.filter(isNodeService)) {
      for (const endpoint of record.endpoints) {
        const key = canonical(endpoint);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        discovered.push({
          id: record.service_id,
          url: endpoint,
          label: hostLabel(endpoint),
          role: "Public API Node",
          // Not knowable from a registration: whether a node reads Solana
          // directly is something it answers on `getChainStatus`, so the
          // caller finds out by asking rather than by us assuming.
          chainMode: "GossipOnly",
        });
      }
    }
    // One registry read is enough. Every node replicates the same
    // registry, so asking a second seed returns the same records.
    break;
  }

  discovered.sort((a, b) => a.id.localeCompare(b.id));
  return [...seeds, ...discovered];
}

/** The host, which is what an operator recognises their node by. */
function hostLabel(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return endpoint;
  }
}
