import type { Metadata } from "next";
import { WithdrawForm } from "@/components/wallet/withdraw-form";

export const metadata: Metadata = {
  title: "Withdraw",
  description: "Take tokens back out of a liquidity vault on Solana devnet.",
};

export default async function WithdrawPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const mint = Array.isArray(query.mint) ? query.mint[0] : query.mint;

  return (
    <section className="max-w-2xl">
      <h1 className="text-xl font-semibold text-white">Withdraw from a vault</h1>
      <p className="mt-1 text-sm text-gray-400">
        Move available vault balance back to your own wallet. A real transaction on Solana devnet.
      </p>
      <div className="mt-8">
        <WithdrawForm initialMint={mint} />
      </div>
    </section>
  );
}
