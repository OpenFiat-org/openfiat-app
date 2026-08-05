import type { Metadata } from "next";
import { CounterpartiesConsole } from "@/components/counterparties/counterparties-console";
import { PageHero } from "@/components/page-hero";

export const metadata: Metadata = {
  title: "People you trade with",
  description:
    "How many times you have traded with each wallet, read from a live node by signing a challenge with your own key. Readable only by you.",
};

export default function CounterpartiesPage() {
  return (
    <section>
      <PageHero
        variant="bloom"
        title="People you trade with"
        description="Who you deal with most, and how many times you have traded with each of them. This is your own history and nobody else's: a node will not answer this question for a wallet you cannot prove you hold the key to, so there is no directory of who trades with whom to be looked up, scraped or subpoenaed."
      />

      <div className="mt-8">
        <CounterpartiesConsole />
      </div>
    </section>
  );
}
