import type { Metadata } from "next";
import { FaucetForm } from "@/components/faucet/faucet-form";

export const metadata: Metadata = {
  title: "Faucet",
  description: "Get devnet SOL, mock USDC, mock USDT and OPEN on Solana devnet for testing.",
};

export default function FaucetPage() {
  return (
    <section className="max-w-2xl">
      <h1 className="text-xl font-semibold text-white">Faucet</h1>
      <p className="mt-1 text-sm text-gray-400">
        Sends devnet SOL, mock USDC, mock USDT and OPEN to any Solana devnet address, for testing this
        app. SOL covers transaction fees and account rent; OPEN is what a protocol role is staked with.
      </p>
      {/*
       * The top bar already carries a persistent devnet/no-value banner
       * (components/top-nav.tsx) — this doesn't repeat that wording, but
       * adds the one fact specific to this page: these are not real USDC or
       * USDT, just devnet-only mints this faucet controls, and they cannot
       * be redeemed for or converted into anything.
       */}
      <p className="mt-3 rounded-md border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs text-amber-200/90">
        These are not real USDC or USDT. They are mock tokens minted solely for testing on Solana devnet,
        redeemable for nothing, and worth nothing.
      </p>
      <p className="mt-1 text-[11px] text-gray-600">
        This faucet is a separate service from the OpenFiat protocol and node network — it only mints test
        tokens, and never touches escrow, staking, or governance.
      </p>
      <div className="mt-8">
        <FaucetForm />
      </div>
    </section>
  );
}
