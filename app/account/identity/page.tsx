import type { Metadata } from "next";
import { IDENTITY_CLAIMS } from "@/lib/data/identity";
import { LiveReputationPanel } from "@/components/account/live-reputation";
import { DataTable, Td, Th, Tr } from "@/components/data-table";
import { PageHero } from "@/components/page-hero";
import { StatusPill } from "@/components/status-pill";

export const metadata: Metadata = {
  title: "Identity & Reputation",
  description: "OpenFiat identity levels L0–L3 and wallet-bound portable reputation.",
};

export default function IdentityPage() {
  return (
    <section>
      <PageHero
        title="Identity & Reputation"
        description="Identity levels gate what you can do on the protocol; reputation is earned per wallet and portable across all OpenFiat apps."
      />

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wider text-gray-400">Identity claims</h2>
      <div className="mt-3">
        <DataTable
          minWidth={820}
          head={
            <tr>
              <Th>Level</Th>
              <Th>Claim</Th>
              <Th>Details</Th>
              <Th>Expiry</Th>
              <Th right>Status</Th>
            </tr>
          }
        >
          {IDENTITY_CLAIMS.map((c) => (
            <Tr key={c.level}>
              <Td>
                <span className="flex h-7 w-7 items-center justify-center rounded bg-brand/15 text-xs font-bold text-brand-hover">
                  {c.level}
                </span>
              </Td>
              <Td>
                <p className="font-medium text-white">{c.title}</p>
                <p className="max-w-64 text-xs text-gray-500">{c.description}</p>
              </Td>
              <Td className="text-xs text-gray-400">
                {c.details.map((d) => (
                  <p key={d}>· {d}</p>
                ))}
              </Td>
              <Td className="text-xs text-gray-500">{c.expiry ?? "—"}</Td>
              <Td right><StatusPill status={c.status} /></Td>
            </Tr>
          ))}
        </DataTable>
      </div>

      <div className="mt-10">
        <LiveReputationPanel />
      </div>
    </section>
  );
}
