import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/page-hero";
import { Panel } from "@/components/panel";

export const metadata: Metadata = {
  title: "How to Buy & Sell on OpenFiat P2P",
  description:
    "Step-by-step P2P trading guide: place an order, pay the seller within the time limit, and receive crypto from Solana-enforced escrow — plus safety tips.",
  alternates: { canonical: "/guide" },
};

const GLOSSARY: Array<[string, string]> = [
  ["Advertiser (Merchant)", "A verified user who posts buy/sell offers with their own price, limits, and payment methods."],
  ["Taker", "You — the user who picks an existing offer and places an order against it."],
  ["Escrow", "The seller's crypto locks in the Solana escrow program when the order is placed and releases only after payment is confirmed."],
  ["Appeal (Dispute)", "The button to press when something goes wrong — escrow freezes and an arbitrator steps in."],
  ["Payment window", "The countdown you must pay within. If it expires, the order is cancelled and escrow unlocks."],
];

const SAFETY_TIPS = [
  "Never release crypto before confirming payment in your own account.",
  "Only pay the exact account details shown in the order — never details sent in chat.",
  "Avoid third-party payments: the sender's name should match the counterparty.",
  "Use Appeal if the counterparty doesn't respond or something feels wrong.",
  "Keep all chat on-platform — it becomes evidence in a dispute.",
];

export default function GuidePage() {
  return (
    <section>
      <PageHero
        variant="flow"
        title="How to Buy & Sell on OpenFiat P2P"
        description="P2P trading lets you exchange crypto directly with other people using local currency and payment methods — every order protected by escrow on Solana."
      />

      <div className="mt-10 max-w-3xl">
        {/* On-ramp / off-ramp deep-dives */}
        <div className="divide-y divide-white/5 border-y border-white/5">
          <Link href="/guide/buy" className="group flex items-center justify-between gap-4 py-5">
            <div>
              <p className="font-medium text-white group-hover:text-brand-hover">
                How to buy crypto with fiat (on-ramp) →
              </p>
              <p className="mt-1 text-sm text-gray-400">
                Turn local currency into USDT, USDC, USD1, or SOL — M-Pesa, bank transfer, and local payment methods.
              </p>
            </div>
            <span className="text-gray-600 group-hover:text-brand-hover">→</span>
          </Link>
          <Link href="/guide/sell" className="group flex items-center justify-between gap-4 py-5">
            <div>
              <p className="font-medium text-white group-hover:text-brand-hover">
                How to sell crypto for fiat (off-ramp) →
              </p>
              <p className="mt-1 text-sm text-gray-400">
                Cash out stablecoins to your bank or mobile money — and the one rule that keeps you safe.
              </p>
            </div>
            <span className="text-gray-600 group-hover:text-brand-hover">→</span>
          </Link>
          <Link href="/guide/merchant" className="group flex items-center justify-between gap-4 py-5">
            <div>
              <p className="font-medium text-white group-hover:text-brand-hover">
                How to become a merchant →
              </p>
              <p className="mt-1 text-sm text-gray-400">
                Post the advertisements everyone else trades against — the bond, the vault, and what it commits you to.
              </p>
            </div>
            <span className="text-gray-600 group-hover:text-brand-hover">→</span>
          </Link>
        </div>

        {/* What is P2P */}
        <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-gray-400">What is P2P trading?</h2>
        <p className="mt-3 text-sm leading-relaxed text-gray-300">
          P2P trading lets you buy and sell crypto directly with other people using your local currency and payment
          methods. Instead of trusting a stranger, every order is protected by escrow: the seller's crypto locks in the
          Solana escrow program the moment the order is placed, and it is released only after the seller confirms your
          payment arrived. OpenFiat never takes custody of your fiat.
        </p>

        {/* Glossary */}
        <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-gray-400">Key terms</h2>
        <div className="mt-3">
          <Panel>
            <ol className="divide-y divide-white/5">
              {GLOSSARY.map(([term, def]) => (
                <li key={term} className="px-4 py-3.5 text-sm">
                  <span className="font-medium text-white">{term}</span>
                  <span className="mt-0.5 block text-gray-400">{def}</span>
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        {/* Safety tips */}
        <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-gray-400">Safety tips</h2>
        <ul className="mt-3 space-y-2.5">
          {SAFETY_TIPS.map((tip) => (
            <li key={tip} className="flex gap-2.5 border-l-2 border-amber-400/50 pl-3 text-sm text-gray-300">
              {tip}
            </li>
          ))}
        </ul>

        <div className="mt-10 flex flex-wrap gap-6 border-t border-white/10 pt-6 text-sm">
          <Link href="/" className="text-brand hover:text-brand-hover">Start trading →</Link>
          <Link href="/orders" className="text-brand hover:text-brand-hover">Your orders →</Link>
          <Link href="/disputes" className="text-brand hover:text-brand-hover">Appeals & disputes →</Link>
        </div>
      </div>
    </section>
  );
}
