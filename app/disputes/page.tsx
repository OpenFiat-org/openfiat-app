import type { Metadata } from "next";
import Link from "next/link";
import { DISPUTES } from "@/lib/data/disputes";
import { merchantByName } from "@/lib/data/merchants";
import { formatDateShort } from "@/lib/format";
import { DataTable, Td, Th, Tr } from "@/components/data-table";
import { PageHero } from "@/components/page-hero";
import { MerchantCell } from "@/components/merchant-cell";
import { StatusPill } from "@/components/status-pill";

export const metadata: Metadata = {
  title: "Disputes",
  description: "OpenFiat dispute arbitration — frozen escrow, evidence, and arbitrator decisions.",
};

export default function DisputesPage() {
  return (
    <section>
      <PageHero
        variant="scales"
        title="Disputes"
        description="Disputes can only be opened on active trades. Opening one freezes the escrow PDA automatically until an arbitrator rules."
      />

      <div className="mt-8">
        <DataTable
          minWidth={820}
          head={
            <tr>
              <Th>Dispute</Th>
              <Th>Trade</Th>
              <Th>Counterparty</Th>
              <Th>Your role</Th>
              <Th>Opened</Th>
              <Th>Arbitrator</Th>
              <Th right>Status</Th>
            </tr>
          }
        >
          {DISPUTES.map((d) => {
            const counterparty = merchantByName(d.counterparty);
            return (
              <Tr key={d.id}>
                <Td py="py-5">
                  <Link href={`/disputes/${d.id}`} className="font-medium text-brand hover:text-brand-hover">
                    {d.id}
                  </Link>
                </Td>
                <Td py="py-5" className="text-gray-300">{d.tradeId}</Td>
                <Td py="py-5">
                  {counterparty ? <MerchantCell merchant={counterparty} /> : d.counterparty}
                </Td>
                <Td py="py-5" className="text-gray-400">{d.userRole}</Td>
                <Td py="py-5" className="tabular-nums text-gray-400">{formatDateShort(d.openedAt)}</Td>
                <Td py="py-5" className="text-xs text-gray-400">{d.arbitrator}</Td>
                <Td py="py-5" right><StatusPill status={d.status} /></Td>
              </Tr>
            );
          })}
        </DataTable>
      </div>
    </section>
  );
}
