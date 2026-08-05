import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { OPEN_PRICE_USDC, SALE_PHASES } from "@/lib/sale-terms";
import { DataTable, Td, Th, Tr } from "@/components/data-table";
import { BuyOpen } from "@/components/open/buy-open";
import { PageHero } from "@/components/page-hero";

export const metadata: Metadata = {
  title: "OPEN Token — Presale",
  description:
    "Buy OPEN in the official presale: the utility and governance token of the OpenFiat protocol — merchant bonds, node and arbitrator staking, governance voting, and protocol fees.",
  alternates: { canonical: "/open" },
};

/**
 * What OPEN is for.
 *
 * No figures. Three of these lines used to carry them — "a 5,000 OPEN bond",
 * "1 ad slot per 5,000 OPEN", "arbitrators bond 50,000 OPEN" — and every one
 * was wrong against the deployed `StakingConfig`, which sets the merchant and
 * arbitrator floors at 500 OPEN each. They were not stale by a little: the
 * arbitrator figure was a hundred times the real minimum, on the page whose
 * job is to tell somebody what the token is worth having.
 *
 * The minimums are a governance-updatable on-chain parameter, so any copy of
 * them here is a copy that goes stale silently. `/staking` reads them off the
 * chain and each line links to it.
 */
const UTILITY: Array<{ title: string; description: string; href: string; link: string }> = [
  {
    title: "Merchant bonds",
    description:
      "Publishing advertisements requires a bond. The minimum is an on-chain staking parameter, so it is read from the chain rather than printed here.",
    href: "/staking",
    link: "See the live minimums",
  },
  {
    title: "Node & arbitrator staking",
    description:
      "Operators bond OPEN to serve the network, and arbitrators bond to be eligible for dispute seats. Each role has its own floor and its own unbonding period.",
    href: "/staking",
    link: "Bond for a role",
  },
  {
    title: "Governance voting",
    description: "OPEN-weighted votes decide OFIPs — fees, assets, treasury spend.",
    href: "/governance",
    link: "See proposals",
  },
  {
    title: "Protocol fees",
    description:
      "Settlement, dispute and service fees accrue to the four protocol treasuries.",
    href: "/governance",
    link: "See governance",
  },
];

export default function OpenTokenPage() {
  return (
    <section>
      <PageHero
        variant="flow"
        title="OPEN Token"
        description="The utility and governance token of the OpenFiat protocol. OPEN P2P trading and swapping unlock when the network goes live — until then, OPEN is only available through the official sale."
      >
        {/* No "Live" pill. It was a constant, so the page said the sale was
            live whether or not a SaleConfig existed — and none does on this
            cluster. Whether a sale is running is a fact about the chain, and
            `BuyOpen` below is the one place that reads it. The price is a
            [CONFIRMED] specification figure the deployed program enforces,
            so it is safe to state without a chain read. */}
        <p className="font-mono text-sm tabular-nums text-gray-200">
          1 OPEN = {OPEN_PRICE_USDC} USDC
        </p>
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
                </tr>
              }
            >
              {SALE_PHASES.map((p) => (
                <Tr key={p.name}>
                  <Td py="py-5" className="font-medium text-white">
                    {p.name}
                    <span className="mt-1 block max-w-md text-xs font-normal text-gray-500">
                      {p.note}
                    </span>
                  </Td>
                  {/* Null price means market priced — there is no fixed rate
                      after the sale phases, so a figure would be invented. */}
                  <Td py="py-5" right num className="text-gray-200">
                    {p.priceUsdc === null ? "—" : `$${p.priceUsdc.toFixed(2)}`}
                  </Td>
                  <Td py="py-5" right num className="text-gray-400">{p.allocation}</Td>
                </Tr>
              ))}
            </DataTable>
            {/* The Status column is gone. It held "Live" / "Upcoming" /
                "Upcoming" as constants, which is a claim about the chain
                made without reading it. `BuyOpen` above states whether a
                sale exists, once, from the account itself. */}
            <p className="mt-3 max-w-2xl text-xs leading-relaxed text-gray-500">
              Terms as OFS-4100 §2–3 fixes them, not a schedule. Whether a
              phase is open is a fact about the chain — the panel above reads
              the sale account and says what it found.
            </p>
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
