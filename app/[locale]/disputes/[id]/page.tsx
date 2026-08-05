import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { fetchDispute } from "@/lib/live-disputes";
import { DisputeCaseView } from "@/components/disputes/case-view";

interface Params {
  id: string;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Dispute ${id}` };
}

export default async function DisputePage({ params }: { params: Promise<Params> }) {
  const { id } = await params;

  let dispute = null;
  let error: string | null = null;
  try {
    dispute = await fetchDispute(id);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <section>
      <Link href="/disputes" className="text-sm text-gray-500 hover:text-white">
        ← Back to Disputes
      </Link>
      <div className="mt-3 mb-8">
        <h1 className="text-xl font-semibold text-white">Dispute {id}</h1>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/[0.04] p-6">
          <p className="text-sm font-medium text-red-300">Could not read this dispute from the node</p>
          <p className="mt-1 font-mono text-xs text-red-400/80">{error}</p>
        </div>
      ) : dispute ? (
        <DisputeCaseView dispute={dispute} />
      ) : (
        <p className="rounded-lg border border-white/10 bg-white/[0.02] p-6 text-sm text-gray-400">
          This node has no dispute with id &ldquo;{id}&rdquo;.
        </p>
      )}
    </section>
  );
}
