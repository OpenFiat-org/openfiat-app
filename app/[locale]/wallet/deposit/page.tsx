import type { Metadata } from "next";
import { DepositForm } from "@/components/wallet/deposit-form";

export const metadata: Metadata = {
  title: "Deposit",
  description: "Move tokens from your wallet into a liquidity vault on Solana devnet.",
};

export default async function DepositPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  // A mint address, not an asset ticker. Vaults are keyed by mint on chain
  // and two mints can share a ticker, so the vault table links with the real
  // address and this page never has to guess which one was meant.
  const mint = Array.isArray(query.mint) ? query.mint[0] : query.mint;

  return (
    <section className="max-w-2xl">
      <h1 className="text-xl font-semibold text-white">Deposit into a vault</h1>
      <p className="mt-1 text-sm text-gray-400">
        Fund the inventory that backs your sell advertisements. A real transaction on Solana devnet.
      </p>
      <div className="mt-8">
        <DepositForm initialMint={mint} />
      </div>
    </section>
  );
}
