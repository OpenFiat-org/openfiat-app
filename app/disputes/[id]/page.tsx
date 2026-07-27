import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DISPUTES, disputeById } from "@/lib/data/disputes";
import { tradeById } from "@/lib/data/trades";
import { DisputeCaseView } from "@/components/disputes/case-view";

interface Params {
  id: string;
}

export function generateStaticParams(): Params[] {
  return DISPUTES.map((d) => ({ id: d.id }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params;
  const dispute = disputeById(id);
  if (!dispute) return { title: "Dispute" };
  return {
    title: `Dispute ${dispute.id}`,
    description: `${dispute.category} on trade ${dispute.tradeId}. Escrow frozen; decided by staked arbitrators voting commit-and-reveal.`,
    alternates: { canonical: `/disputes/${dispute.id}` },
  };
}

export default async function DisputePage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const dispute = disputeById(id);
  if (!dispute) notFound();

  return (
    <section>
      <Link href="/disputes" className="text-sm text-gray-500 hover:text-white">
        ← Back to Disputes
      </Link>
      <div className="mt-3 mb-8">
        <h1 className="text-xl font-semibold text-white">Dispute {dispute.id}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {dispute.category} · trade {dispute.tradeId}
        </p>
      </div>

      <DisputeCaseView dispute={dispute} tradeSig={tradeById(dispute.tradeId)?.txSig} />
    </section>
  );
}
