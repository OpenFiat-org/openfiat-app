import type { Metadata } from "next";
import { AdWizard } from "@/components/ads/ad-wizard";

export const metadata: Metadata = {
  title: "Post Advertisement",
  description: "Publish a new OpenFiat advertisement backed by your liquidity vault — step by step.",
};

export default function NewAdPage() {
  return (
    <section>
      <h1 className="text-xl font-semibold text-white">Post Advertisement</h1>
      <p className="mt-1 text-sm text-gray-400">
        Five steps: market, pricing, limits, payment methods, review. Your progress is saved as a draft.
      </p>
      <div className="mt-8">
        <AdWizard />
      </div>
    </section>
  );
}
