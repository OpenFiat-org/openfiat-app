import type { Metadata } from "next";
import { OrdersTable } from "@/components/orders/orders-table";
import { PageHero } from "@/components/page-hero";

export const metadata: Metadata = {
  title: "Orders",
  description: "Your OpenFiat P2P trades — reservations, escrow settlement, and history.",
};

export default function OrdersPage() {
  return (
    <section>
      <PageHero
        title="My Trades"
        description="Every trade runs the escrow lifecycle on Solana: locked → paid → verified → released."
      />
      <div className="mt-8">
        <OrdersTable />
      </div>
    </section>
  );
}
