import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";

import { AdWizard } from "@/components/ads/ad-wizard";

export const metadata: Metadata = {
  title: "Post Advertisement",
  description:
    "Publish a new OpenFiat advertisement — ad type and asset, price, amount and limits, payment methods, then confirm.",
};

export default function NewAdPage() {
  return (
    <section>
      <h1 className="text-xl font-semibold text-white">Post an advertisement</h1>
      <p className="mt-1 max-w-2xl text-sm text-gray-400">
        Five steps, in the order every P2P desk asks for them: ad type and asset, price, amount and
        limits, payment methods, then review. Your progress is saved as a draft in this browser and
        nothing is signed until the last screen. New to this?{" "}
        <Link href="/become-a-merchant" className="text-brand hover:text-brand-hover">
          See what it takes to be a merchant
        </Link>
        .
      </p>
      <div className="mt-8">
        <AdWizard />
      </div>
    </section>
  );
}
