import type { Metadata } from "next";
import Link from "next/link";
import { PRESALE, SALE_PHASES } from "@/lib/data/sale";
import { DataTable, Td, Th, Tr } from "@/components/data-table";
import { BuyOpen } from "@/components/open/buy-open";
import { PageHero } from "@/components/page-hero";
import { StatusPill } from "@/components/status-pill";

export const metadata: Metadata = {
  title: "OPEN Token — Presale",
  description:
    "Buy OPEN in the official presale: the utility and governance token of the OpenFiat protocol — merchant bonds, node and arbitrator staking, governance voting, and protocol fees.",
  alternates: { canonical: "/open" },
};

const UTILITY: Array<{ title: string; description: string; href: string; link: string }> = [
  { title: "Merchant bonds", description: "Publishing ads requires a 5,000 OPEN bond — 1 ad slot per 5,000 OPEN.", href: "/staking", link: "Stake as a merchant" },
  { title: "Node & arbitrator staking", description: "Operators bond OPEN to serve the network; arbitrators bond 50,000 OPEN to rule on disputes.", href: "/staking", link: "Bond for a role" },
  { title: "Governance voting", description: "OPEN-weighted votes decide OFPs — fees, assets, treasury spend.", href: "/governance", link: "See proposals" },
  { title: "Protocol fees", description: "Trade, dispute, and service fees are denominated in OPEN and accrue to the treasury.", href: "/governance", link: "View treasury" },
];

export default function OpenTokenPage() {
  return (
    <section>
      <PageHero
        variant="flow"
        title="OPEN Token"
        description="The utility and governance token of the OpenFiat protocol. OPEN P2P trading and swapping unlock when the network goes live — until then, OPEN is only available through the official sale."
      >
        <div className="flex items-center gap-3">
          <StatusPill status="Live" />
          <p className="font-mono text-sm tabular-nums text-gray-200">1 OPEN = {PRESALE.priceUsdc} USDC</p>
        </div>
      </PageHero>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <BuyOpen />

          <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-gray-400">Sale phases</h2>
          <div className="mt-3">
            <DataTable
              minWidth={560}
              head={
                <tr>
                  <Th>Phase</Th>
                  <Th right>Price</Th>
                  <Th right>Allocation</Th>
                  <Th right>Status</Th>
                </tr>
              }
            >
              {SALE_PHASES.map((p) => (
                <Tr key={p.name}>
                  <Td py="py-5" className="font-medium text-white">{p.name}</Td>
                  <Td py="py-5" right num className="text-gray-200">${p.priceUsdc.toFixed(2)}</Td>
                  <Td py="py-5" right num className="text-gray-400">{p.allocation}</Td>
                  <Td py="py-5" right><StatusPill status={p.status} /></Td>
                </Tr>
              ))}
            </DataTable>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">What OPEN does</h2>
          <div className="mt-3 divide-y divide-white/5 border-y border-white/5">
            {UTILITY.map((u) => (
              <div key={u.title} className="py-4">
                <p className="font-medium text-white">{u.title}</p>
                <p className="mt-1 text-sm text-gray-400">{u.description}</p>
                <Link href={u.href} className="mt-1.5 inline-block text-xs text-brand hover:text-brand-hover">
                  {u.link} →
                </Link>
              </div>
            ))}
          </div>
          <p className="mt-4 border-l-2 border-amber-400/50 bg-amber-400/5 px-4 py-2.5 text-xs text-amber-200">
            OPEN is only sold through this official sale page. Any OTC offer, DM, or "early unlock" elsewhere is a scam.
          </p>
        </div>
      </div>
    </section>
  );
}
