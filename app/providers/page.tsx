import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/page-hero";
import {
  ProvidersDirectory,
  ProvidersMetrics,
} from "@/components/providers/providers-directory";

export const metadata: Metadata = {
  title: "Service Providers",
  description:
    "The OpenFiat Service Registry (OFS-1500) — permissionless discovery for notification, oracle, risk-intelligence, snapshot, gateway, and API providers.",
};

/**
 * Counts and rows both come from the registry the selected node reports.
 * They were a fixture: a hand-written directory of invented providers,
 * with an "Avg uptime" averaged over a field the protocol does not have.
 */
export default function ProvidersPage() {
  return (
    <section>
      <PageHero
        variant="pulse"
        title="Service Providers"
        description="The Service Registry (OFS-1500) is permissionless: anyone can register a service — endpoints, protocol versions, capabilities, pricing — signed by their wallet, and get discovered by nodes and merchants across the network."
        below={
          /* The page said registration was permissionless and then offered no
             way to do it, which is the same as saying nothing. */
          <Link
            href="/providers/register"
            className="inline-block rounded-md bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-hover"
          >
            Register a service →
          </Link>
        }
      >
        <ProvidersMetrics />
      </PageHero>

      <div className="mt-10">
        <ProvidersDirectory />
      </div>
    </section>
  );
}
