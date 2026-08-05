import type { Metadata } from "next";

import { ProposalDetail } from "@/components/governance/proposal-detail";

export const metadata: Metadata = {
  title: "Proposal",
};

/**
 * A **network** proposal — the off-chain, gossiped record that carries the
 * actual text.
 *
 * Its own route rather than sharing `/governance/[id]` with the on-chain
 * proposal, because the two ids are different things: the chain's is a
 * `u64` seeding a PDA, and this one is an author-chosen string. A single
 * route would have to guess which register a caller meant from whether the
 * id happened to parse as a number, and an off-chain id that spells a
 * number is perfectly legal — so the guess would silently show one
 * proposal under another's URL.
 */
export default async function NetworkProposalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <section>
      <ProposalDetail id={decodeURIComponent(id)} />
    </section>
  );
}
