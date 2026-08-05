import type { Metadata } from "next";
import { DisputesTable } from "@/components/disputes/disputes-table";
import { PageHero } from "@/components/page-hero";

export const metadata: Metadata = {
  title: "Disputes",
  description:
    "OpenFiat dispute arbitration — escrow freezes on filing, staked arbitrators join voluntarily, and votes are cast by commit-and-reveal.",
};

export default function DisputesPage() {
  return (
    <section>
      <PageHero
        variant="scales"
        title="Disputes"
        description="Filing freezes the escrow immediately and no funds move until the case closes. Cases are decided by independent staked arbitrators who volunteer, review evidence, and vote by commit-and-reveal — not by an assigned judge."
      />

      <div className="mt-8">
        <DisputesTable />
      </div>
    </section>
  );
}
