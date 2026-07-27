import type { Metadata } from "next";
import { WithdrawForm } from "@/components/wallet/withdraw-form";

export const metadata: Metadata = {
  title: "Withdraw",
};

export default async function WithdrawPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const asset = Array.isArray(query.asset) ? query.asset[0] : query.asset;

  return (
    <section className="max-w-2xl">
      <h1 className="text-xl font-semibold text-white">Withdraw</h1>
      <p className="mt-1 text-sm text-gray-400">Send assets to any Solana address.</p>
      <div className="mt-8">
        <WithdrawForm initialAsset={asset} />
      </div>
    </section>
  );
}
