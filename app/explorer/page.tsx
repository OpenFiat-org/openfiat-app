import type { Metadata } from "next";
import { TRADES } from "@/lib/data/trades";
import { ExplorerLive } from "@/components/explorer/live-explorer-panel";

export const metadata: Metadata = {
  title: "Explorer",
  description: "Explore the OpenFiat coordination layer — protocol events, settlements, addresses, and trades.",
};

export default function ExplorerPage() {
  return (
    <section>
      <ExplorerLive settlements={TRADES.slice(0, 8)} />
    </section>
  );
}
