import type { Metadata } from "next";
import Link from "next/link";
import {
  ARBITRATOR_REQUIREMENTS,
  DISPUTES,
  MY_ARBITRATOR_STANDING,
  arbitratorEligible,
} from "@/lib/data/disputes";
import { merchantByName } from "@/lib/data/merchants";
import { formatDateShort, formatNumber } from "@/lib/format";
import { DataTable, Td, Th, Tr } from "@/components/data-table";
import { PageHero } from "@/components/page-hero";
import { MerchantCell } from "@/components/merchant-cell";
import { StatusPill } from "@/components/status-pill";

export const metadata: Metadata = {
  title: "Disputes",
  description:
    "OpenFiat dispute arbitration — escrow freezes on filing, staked arbitrators join voluntarily, and votes are cast by commit-and-reveal.",
};

/** Chapter 11 §11.6 requirements, against the current user's standing. */
function Eligibility() {
  const eligible = arbitratorEligible();
  const rows: Array<[string, string, boolean]> = [
    [
      "OPEN stake available",
      `${formatNumber(MY_ARBITRATOR_STANDING.stakeAvailable, 0)} / ${formatNumber(ARBITRATOR_REQUIREMENTS.minStake, 0)}`,
      MY_ARBITRATOR_STANDING.stakeAvailable >= ARBITRATOR_REQUIREMENTS.minStake,
    ],
    [
      "Arbitrator reputation",
      `${MY_ARBITRATOR_STANDING.reputation} / ${ARBITRATOR_REQUIREMENTS.minReputation}`,
      MY_ARBITRATOR_STANDING.reputation >= ARBITRATOR_REQUIREMENTS.minReputation,
    ],
    [
      "Protocol age",
      `${MY_ARBITRATOR_STANDING.protocolAgeDays} / ${ARBITRATOR_REQUIREMENTS.minProtocolAgeDays} days`,
      MY_ARBITRATOR_STANDING.protocolAgeDays >= ARBITRATOR_REQUIREMENTS.minProtocolAgeDays,
    ],
    [
      "Active arbitration penalties",
      String(MY_ARBITRATOR_STANDING.activePenalties),
      MY_ARBITRATOR_STANDING.activePenalties === 0,
    ],
  ];

  return (
    <div className="mt-10 border-t border-white/5 pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
          Your arbitrator eligibility
        </h2>
        <p className="text-xs text-gray-500">
          {MY_ARBITRATOR_STANDING.casesRuled} cases ruled ·{" "}
          {MY_ARBITRATOR_STANDING.consensusRate}% in consensus
        </p>
      </div>
      <dl className="mt-4 grid gap-x-10 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map(([label, value, ok]) => (
          <div key={label} className="border-t border-white/5 pt-3">
            <dt className="text-xs text-gray-500">{label}</dt>
            <dd className={`mt-1 tabular-nums text-sm ${ok ? "text-emerald-300" : "text-amber-300"}`}>
              {ok ? "✓" : "!"} {value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-5 max-w-3xl text-xs leading-relaxed text-gray-500">
        {eligible
          ? "You meet the requirements, so you may join any open case. Joining commits stake — an arbitrator whose revealed vote falls outside consensus forfeits part of it."
          : "Joining a case requires all four to pass. Governance may adjust these requirements over time."}
      </p>
    </div>
  );
}

export default function DisputesPage() {
  return (
    <section>
      <PageHero
        variant="scales"
        title="Disputes"
        description="Filing freezes the escrow immediately and no funds move until the case closes. Cases are decided by independent staked arbitrators who volunteer, review sealed evidence, and vote by commit-and-reveal — not by an assigned judge."
      />

      <div className="mt-8">
        <DataTable
          minWidth={900}
          head={
            <tr>
              <Th>Case</Th>
              <Th>Grounds</Th>
              <Th>Counterparty</Th>
              <Th>You are</Th>
              <Th>Filed</Th>
              <Th right>Arbitrators</Th>
              <Th right>Stage</Th>
            </tr>
          }
        >
          {DISPUTES.map((d) => {
            const counterparty = merchantByName(d.counterparty);
            const joining = d.stage === "Arbitrators Joining";
            return (
              <Tr key={d.id}>
                <Td py="py-5">
                  <Link href={`/disputes/${d.id}`} className="font-medium text-brand hover:text-brand-hover">
                    {d.id}
                  </Link>
                  <span className="mt-0.5 block text-xs text-gray-500">
                    {d.tradeId} · {formatNumber(d.amount, 2)} {d.asset} frozen
                  </span>
                </Td>
                <Td py="py-5" className="text-xs text-gray-400">{d.category}</Td>
                <Td py="py-5">
                  {counterparty ? <MerchantCell merchant={counterparty} /> : d.counterparty}
                </Td>
                <Td py="py-5" className="text-gray-400">{d.viewerRole}</Td>
                <Td py="py-5" className="tabular-nums text-gray-400">{formatDateShort(d.openedAt)}</Td>
                <Td py="py-5" right num className="text-gray-300">
                  {d.arbitrators.length}
                  {/* §11.9: the required count is withheld while a case is open,
                      because publishing it leaks the value at risk. */}
                  <span className="text-gray-600">
                    {joining ? " / undisclosed" : ` / ${d.seatsRequired}`}
                  </span>
                </Td>
                <Td py="py-5" right><StatusPill status={d.stage} /></Td>
              </Tr>
            );
          })}
        </DataTable>
      </div>

      <Eligibility />
    </section>
  );
}
