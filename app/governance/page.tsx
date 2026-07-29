import type { Metadata } from "next";
import { GovernanceProposalsPanel } from "@/components/governance/governance-proposals-panel";
import { PageHero } from "@/components/page-hero";

export const metadata: Metadata = {
  title: "Governance",
  description: "OpenFiat governance — OFIPs, OPEN-weighted voting, and the protocol treasury.",
};

export default function GovernancePage() {
  return (
    <section>
      <PageHero
        variant="ballot"
        title="Governance"
        description="OpenFiat Improvement Proposals (OFIPs) are decided by OPEN-weighted voting on the real openfiat-governance program (Solana devnet). A proposal's title/summary is only stored on-chain as a hash — its numeric id, category, and vote tallies are what this page shows."
      />

      <div className="mt-10">
        <GovernanceProposalsPanel />
      </div>
    </section>
  );
}
