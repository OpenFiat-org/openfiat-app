import type { Metadata } from "next";
import Link from "next/link";

import { GovernanceProposalsPanel } from "@/components/governance/governance-proposals-panel";
import { NetworkProposalsPanel } from "@/components/governance/network-proposals-panel";
import { PageHero } from "@/components/page-hero";

export const metadata: Metadata = {
  title: "Governance",
  description: "OpenFiat governance — proposals, OPEN-weighted voting, and the protocol treasury.",
};

/**
 * Governance, in the two registers it actually exists in.
 *
 * This page used to show one of them — the `openfiat-governance` program's
 * `Proposal` accounts — and so could only ever show fingerprints, because
 * the program stores the title and summary as SHA-256 hashes and nothing
 * else. The words live in the off-chain records every node gossips, which
 * nothing in this app could read or write.
 *
 * Both are here, kept apart and labelled, because they are not the same
 * list and a merged one would have to invent a correspondence. Where a
 * correspondence really exists it is a two-sided, signed claim, and a
 * proposal's own page reports it — including the case where the two
 * records disagree, which is the case a single-register view could never
 * surface.
 */
export default function GovernancePage() {
  return (
    <section>
      <PageHero
        variant="ballot"
        title="Governance"
        description="Proposals are decided by OPEN-weighted voting. There are two records of a proposal — the one the network gossips, which carries its text, and the one the governance program holds on Solana devnet, which carries the stake-weighted tally. Both are below."
      />

      <div className="mt-10 space-y-12">
        <div>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-white">Network proposals</h2>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-gray-500">
                Signed records replicated between nodes. This is where a proposal&apos;s title and
                summary exist — the chain stores only hashes of them. Read from your access node,
                so a node that has replicated less of the network shows fewer.
              </p>
            </div>
            <Link
              href="/governance/new"
              className="shrink-0 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
            >
              File a proposal
            </Link>
          </div>
          <div className="mt-5">
            <NetworkProposalsPanel />
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-white">On-chain proposals</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-gray-500">
            <code>Proposal</code> accounts on the openfiat-governance program. A stake deposit is
            paid to file one and the votes are weighted by staked OPEN, tallied and finalised by
            the program itself. Its title and summary are stored as hashes, so what a row can show
            is a fingerprint of them.
          </p>
          <div className="mt-5">
            <GovernanceProposalsPanel />
          </div>
        </div>
      </div>
    </section>
  );
}
