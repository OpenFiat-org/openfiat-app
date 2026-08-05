import type { Metadata } from "next";

import { NewProposalForm } from "@/components/governance/new-proposal-form";
import { PageHero } from "@/components/page-hero";

export const metadata: Metadata = {
  title: "File a proposal",
  description: "File an OpenFiat proposal — a signed record gossiped to every node on the network.",
};

export default function NewProposalPage() {
  return (
    <section>
      <PageHero
        variant="ballot"
        title="File a proposal"
        description="A proposal is a record you sign and every node replicates. This creates the network's half — the one that carries the actual text — and opens it for voting straight away."
      />

      <div className="mt-10">
        <NewProposalForm />
      </div>
    </section>
  );
}
