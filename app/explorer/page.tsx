import type { Metadata } from "next";
import { fetchTrades } from "@/lib/live-trades";
import { ExplorerLive } from "@/components/explorer/live-explorer-panel";

export const metadata: Metadata = {
  title: "Explorer",
  description: "Explore the OpenFiat coordination layer — protocol events, settlements, addresses, and trades.",
};

export default async function ExplorerPage() {
  let trades = null;
  try {
    trades = (await fetchTrades()).slice(0, 8);
  } catch {
    // ExplorerLive renders "could not read trades" for `null` — a real,
    // distinct fact from an empty list.
  }

  return (
    <section>
      <ExplorerLive settlements={trades} />
    </section>
  );
}
