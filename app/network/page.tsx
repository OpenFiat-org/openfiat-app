import type { Metadata } from "next";
import Link from "next/link";

import { PageHero } from "@/components/page-hero";
import { LiveNetwork } from "@/components/network/live-network";
import { NodeOperations } from "@/components/network/node-operations";
import { NETWORK_LABEL } from "@/lib/node-endpoint";

export const metadata: Metadata = {
  title: "Network",
  description: "OpenFiat network view — the real devnet cluster, contacted live.",
};

/**
 * This page used to render `lib/data/network.ts`: 128 nodes online, 3,412
 * peers, block height 312,445,902, epoch 742, and a table of ten nodes with
 * invented regions, versions and latencies — none of which existed. It also
 * carried a static "protocol event stream" of hand-written events, captioned
 * "a live node would stream these in real time" while sitting next to a live
 * node that could have done exactly that.
 *
 * Everything now comes from `knownNodes()` and a live request per node. The
 * event stream moved to /explorer, which already subscribes to the real feed
 * rather than describing one.
 */
export default function NetworkPage() {
  return (
    <section>
      <PageHero
        variant="mesh"
        title="Network"
        description={`The coordination layer is event-sourced: every state transition emits a signed protocol event. This is the ${NETWORK_LABEL} cluster, contacted live when the page loads.`}
      >
        <LiveNetwork />
      </PageHero>

      {/*
        * Below the cluster view rather than beside it, because it answers a
        * different question. Above is "which nodes exist and can I reach
        * them"; this is "what is the one I am talking to actually doing" —
        * its peers, and the snapshots it holds. Merging them would present
        * one node's discovery cache as the network's census.
        */}
      <NodeOperations />

      <p className="mt-10 text-sm text-gray-400">
        Looking for the signed event feed?{" "}
        <Link href="/explorer" className="text-brand-hover hover:underline">
          The explorer
        </Link>{" "}
        subscribes to it from your access node. Services that nodes consume — oracles, notification
        gateways, risk intelligence, snapshots — are in the{" "}
        <Link href="/providers" className="text-brand-hover hover:underline">
          service registry
        </Link>
        , not here: they are not endpoints an interface connects to.
      </p>
    </section>
  );
}
