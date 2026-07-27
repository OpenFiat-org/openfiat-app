import type { Metadata } from "next";
import { IDENTITY_CLAIMS, REPUTATION } from "@/lib/data/identity";
import { DataTable, Td, Th, Tr } from "@/components/data-table";
import { PageHero } from "@/components/page-hero";
import { Panel } from "@/components/panel";
import { StatusPill } from "@/components/status-pill";
import { TierBadge } from "@/components/tier-badge";

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
        <Panel title="Reputation — wallet-bound, portable across OpenFiat apps">
          <div className="border-b border-white/10 px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400">Tier</span>
                <span className="font-semibold text-white">{REPUTATION.tier}</span>
                <TierBadge tier={REPUTATION.tier} />
              </div>
              <div className="flex min-w-56 flex-1 items-center gap-3">
                <span className="h-1.5 flex-1 rounded-full bg-white/10">
                  <span
                    className="block h-1.5 rounded-full bg-gradient-to-r from-brand to-brand-teal"
                    style={{ width: `${REPUTATION.progressPct}%` }}
                  />
                </span>
                <span className="text-xs tabular-nums text-gray-500">
                  {REPUTATION.progressPct}% to {REPUTATION.nextTier}
                </span>
              </div>
            </div>
          </div>
          <ol className="divide-y divide-white/5">
            {REPUTATION.dimensions.map((d) => (
              <li key={d.label} className="flex items-center gap-4 px-4 py-2 text-sm">
                <span className="w-40 shrink-0 text-gray-300">{d.label}</span>
                <span className="h-1 flex-1 rounded-full bg-white/10">
                  <span className="block h-1 rounded-full bg-brand" style={{ width: `${d.score}%` }} />
                </span>
                <span className="w-44 shrink-0 text-right text-xs tabular-nums text-gray-500">{d.display}</span>
              </li>
            ))}
          </ol>
          <p className="border-t border-white/10 px-4 py-3 text-xs text-gray-500">
            OpenFiat reputation has no star ratings — it is a set of objective, on-chain-verifiable dimensions,
            bound to your wallet and portable across every OpenFiat application.
          </p>
        </Panel>
      </div>
    </section>
  );
}
