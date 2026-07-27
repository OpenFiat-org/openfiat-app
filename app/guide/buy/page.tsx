import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/page-hero";
import { StepList } from "@/components/guide/step-list";

export const metadata: Metadata = {
  title: { absolute: "How to Buy Crypto with Fiat — Fiat On-Ramp | OpenFiat" },
  description:
    "Fiat on-ramp made simple: buy USDT, USDC, USD1, or SOL with M-Pesa, bank transfer, and local payment methods on the OpenFiat P2P exchange — escrow-protected on Solana.",
  alternates: { canonical: "/guide/buy" },
};

const STEPS: Array<[string, string]> = [
  ["Choose Buy + asset + your currency + payment method", "Pick what you want to buy (USDT, USDC, USD1, SOL), the fiat you're paying with (KES, NGN, USD, and 40+ more), and how you want to pay — M-Pesa, bank transfer, and local methods."],
  ["Compare offers", "Check the price, limits, and each advertiser's completion rate and order count before choosing who to buy from."],
  ["Click Buy and enter an amount", "Enter how much fiat you want to spend (or how much crypto you want) — within the advertiser's limits."],
  ["Place the order", "The seller's crypto locks in the Solana escrow program immediately, so it is guaranteed for you before you pay anything."],
  ["Pay the seller within the time window", "Transfer fiat using exactly the account details shown in the order — every field is copyable. If the window expires, the order cancels and escrow unlocks."],
  ["Click “Transferred, notify seller”", "Only after you have actually sent the money. This tells the seller to check their account."],
  ["Seller confirms — crypto arrives in your wallet", "The seller verifies your payment and escrow releases the crypto to your wallet. Order completed."],
];

const GOOD_TO_KNOW = [
  "Escrow protects you: the seller's crypto is locked on Solana before you pay — they cannot disappear with it.",
  "0% platform trading fee for takers in this demo — you pay only the advertiser's price.",
  "Every order has a payment window; if you can't pay in time, cancel instead of letting it expire.",
  "If the seller doesn't respond or confirm, open an Appeal — escrow freezes and an arbitrator steps in.",
];

export default function BuyGuidePage() {
  return (
    <section>
      <PageHero
        variant="flow"
        title="How to Buy Crypto with Fiat — Fiat On-Ramp"
        description="Turn your local currency into stablecoins in minutes. Buy USDT, USDC, USD1, or SOL with M-Pesa, bank transfer, and dozens of local payment methods — every order protected by escrow on Solana."
      />

      <div className="mt-10 max-w-3xl">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Step by step</h2>
        <div className="mt-3">
          <StepList steps={STEPS} />
        </div>

        <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-gray-400">Good to know</h2>
        <ul className="mt-3 space-y-2.5">
          {GOOD_TO_KNOW.map((tip) => (
            <li key={tip} className="flex gap-2.5 border-l-2 border-brand-teal/60 pl-3 text-sm text-gray-300">
              {tip}
            </li>
          ))}
        </ul>

        <div className="mt-10 flex flex-wrap gap-6 border-t border-white/10 pt-6 text-sm">
          <Link href="/" className="text-brand hover:text-brand-hover">Start buying →</Link>
          <Link href="/guide/sell" className="text-brand hover:text-brand-hover">Selling instead? How to sell →</Link>
        </div>
      </div>
    </section>
  );
}
