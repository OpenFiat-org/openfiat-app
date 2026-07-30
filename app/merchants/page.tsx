import type { Metadata } from "next";

import { MerchantsDirectory } from "@/components/merchants/merchants-directory";
import { PageHero } from "@/components/page-hero";

export const metadata: Metadata = {
  title: "Merchants",
  description:
    "Everyone advertising a trade on OpenFiat, read from the advertisement book (OFS-2100) your access node holds — the pairs they quote, the payment rails they take, and the trading record the protocol computes for them.",
};

/**
 * The merchant directory.
 *
 * There was no way to browse merchants at all: the order book showed whoever
 * was quoting the pair you were already looking at, and `/merchants/<id>` was
 * reachable only from the fixture data that generated its links.
 *
 * What "merchant" means here, and why the page shows what it shows, is argued
 * in `lib/live-merchants.ts`. The short version: a merchant is a wallet with a
 * live advertisement, because that is the only definition of the set that both
 * a node will enumerate and this protocol is willing to make public.
 */
export default function MerchantsPage() {
  return (
    <section>
      <PageHero
        variant="globe"
        title="Merchants"
        description="Every wallet currently advertising a trade, as your access node's advertisement book reports it. There is no merchant register in this protocol and no application to be listed — publishing an advertisement is what puts a wallet here, and withdrawing every advertisement is what removes it."
      />

      <div className="mt-10">
        <MerchantsDirectory />
      </div>
    </section>
  );
}
