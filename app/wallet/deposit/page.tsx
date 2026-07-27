import type { Metadata } from "next";
import { DepositForm } from "@/components/wallet/deposit-form";

export const metadata: Metadata = {
  title: "Deposit",
};

export default async function DepositPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const asset = Array.isArray(query.asset) ? query.asset[0] : query.asset;

  return (
    <section className="max-w-2xl">
      <h1 className="text-xl font-semibold text-white">Deposit</h1>
      <p className="mt-1 text-sm text-gray-400">Fund your wallet on Solana, then allocate to liquidity vaults.</p>
      <div className="mt-8">
        <DepositForm initialAsset={asset} />
      </div>
    </section>
  );
}
