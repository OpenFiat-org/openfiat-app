import type { Metadata } from "next";
import Link from "next/link";
import { PROVIDERS, PROVIDER_TYPES } from "@/lib/data/providers";
import { MetricStrip } from "@/components/metrics";
import { PageHero } from "@/components/page-hero";
import { ProvidersDirectory } from "@/components/providers/providers-directory";

export const metadata: Metadata = {
  title: "Service Providers",
  description:
    "The OpenFiat Service Registry (OFS-1500) — permissionless discovery for notification, oracle, risk-intelligence, snapshot, gateway, and API providers.",
};

export default function ProvidersPage() {
  const counts = Object.entries(PROVIDER_TYPES).map(
    ([type]) => PROVIDERS.filter((p) => p.type === type).length,
  );
  const avgUptime = PROVIDERS.reduce((s, p) => s + p.uptimePct, 0) / PROVIDERS.length;

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
        <MetricStrip
          items={[
            { label: "Total providers", value: String(PROVIDERS.length) },
            { label: "Notifications", value: String(counts[0]) },
            { label: "Oracles", value: String(counts[1]) },
            { label: "Risk intel", value: String(counts[2]) },
            { label: "Snapshots", value: String(counts[3]) },
            { label: "Avg uptime", value: `${avgUptime.toFixed(2)}%` },
          ]}
        />
      </PageHero>

      <div className="mt-10">
        <ProvidersDirectory />
      </div>
    </section>
  );
}
