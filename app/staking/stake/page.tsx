import type { Metadata } from "next";
import { StakeForm } from "@/components/staking/stake-form";

export const metadata: Metadata = {
  title: "Stake OPEN",
  description: "Bond OPEN for a protocol role — merchant, node operator, arbitrator, or service provider.",
};

export default async function StakePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const role = Array.isArray(query.role) ? query.role[0] : query.role;

  return (
    <section className="max-w-2xl">
      <h1 className="text-xl font-semibold text-white">Stake OPEN</h1>
      <p className="mt-1 text-sm text-gray-400">
        Bond OPEN for your protocol role. Bonds are enforced by the staking program on Solana.
      </p>
      <div className="mt-8">
        <StakeForm initialRole={role} />
      </div>
    </section>
  );
}
