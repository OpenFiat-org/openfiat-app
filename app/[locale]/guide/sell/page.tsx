import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { PageHero } from "@/components/page-hero";
import { StepList } from "@/components/guide/step-list";

export const metadata: Metadata = {
  title: { absolute: "How to Sell Crypto for Fiat — Fiat Off-Ramp | OpenFiat" },
  // See `app/guide/buy/page.tsx` on why this names no tokens and no rails.
  description:
    "Fiat off-ramp made simple: sell stablecoins peer-to-peer and cash out through local payment methods on the OpenFiat P2P exchange — escrow-protected on Solana.",
  alternates: { canonical: "/guide/sell" },
};

const STEPS: Array<[string, string]> = [
  ["Choose Sell", "Pick the token you want to sell and the fiat currency you want to receive. Both lists come from your access node, not from this page."],
  // "check completion rate and order count" stood here — see the same note
  // in the buy guide. Neither figure exists on anything this app can read.
  ["Pick an offer matching your amount", "Compare buyer prices, available liquidity and per-order limits the same way buyers compare sellers."],
  ["Enter the amount and place the order", "Your crypto locks in the Solana escrow program — the buyer can see it is guaranteed for them."],
  ["Wait for the buyer's payment", "The buyer transfers fiat to your bank or mobile-money account within the time window."],
  ["Verify the funds in YOUR account", "Log in to your own bank or mobile-money account and confirm the money actually arrived — never trust screenshots alone."],
  ["Click “Payment received” and release", "Only after verifying. Escrow releases your crypto to the buyer instantly."],
  ["Order completed", "Fiat is in your account, the buyer has their crypto, and both reputations update."],
];

const GOOD_TO_KNOW = [
  "Never release crypto before confirming payment in your own account — this is the one rule that matters.",
  "Screenshots prove nothing: buyers can fake payment proofs. Check your own balance.",
  "Beware of third-party payments: the sender's name should match the buyer.",
  "If the buyer marks paid but nothing arrived, don't release — open an Appeal and an arbitrator will review.",
  "Keep all chat on-platform so it can serve as evidence in a dispute.",
];

export default function SellGuidePage() {
  return (
    <section>
      <PageHero
        variant="flow-rev"
        title="How to Sell Crypto for Fiat — Fiat Off-Ramp"
        description="Cash out your stablecoins to local currency safely. Which tokens and payment methods are on offer comes from your access node and the live order book — escrow-protected on Solana."
      />

      <div className="mt-10 max-w-3xl">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Step by step</h2>
        <div className="mt-3">
          <StepList steps={STEPS} />
        </div>

        <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-gray-400">Stay safe when selling</h2>
        <ul className="mt-3 space-y-2.5">
          {GOOD_TO_KNOW.map((tip) => (
            <li key={tip} className="flex gap-2.5 border-l-2 border-amber-400/50 pl-3 text-sm text-gray-300">
              {tip}
            </li>
          ))}
        </ul>

        <div className="mt-10 flex flex-wrap gap-6 border-t border-white/10 pt-6 text-sm">
          <Link href="/" className="text-brand hover:text-brand-hover">Start selling →</Link>
          <Link href="/guide/buy" className="text-brand hover:text-brand-hover">Buying instead? How to buy →</Link>
        </div>
      </div>
    </section>
  );
}
