import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { PageHero } from "@/components/page-hero";
import { StepList } from "@/components/guide/step-list";

export const metadata: Metadata = {
  title: { absolute: "How to Buy Crypto with Fiat — Fiat On-Ramp | OpenFiat" },
  /*
   * No asset tickers and no payment rails in this description.
   *
   * It used to name "USDT, USDC, USD1, or SOL" and "M-Pesa" — a list this
   * app was in no position to make. `USD1` names no mint on this deployment
   * at all, and `SOL` is called `wSOL` by every node that answers, so two of
   * the four tokens advertised here to search engines did not exist. Which
   * tokens and rails a market carries is the node's answer and the book's,
   * and a meta description is the one part of a page that travels without
   * it — so it cannot carry a claim the page itself would have to hedge.
   */
  description:
    "Fiat on-ramp made simple: buy stablecoins peer-to-peer with local payment methods on the OpenFiat P2P exchange — escrow-protected on Solana.",
  alternates: { canonical: "/guide/buy" },
};

const STEPS: Array<[string, string]> = [
  ["Choose Buy + asset + your currency + payment method", "The asset pills, the currency list and the payment-method filter are all read from your access node and from the live book — so they show what is genuinely on offer where you are, rather than a list written into this page."],
  // "Check each advertiser's completion rate and order count" stood here.
  // The protocol carries neither: an advertisement is a merchant peer id, a
  // mint, a price and limits, and `getReputation` serializes no completion
  // rate. Telling a buyer to check a figure that does not exist teaches them
  // to trust whatever number an interface shows them next.
  ["Compare offers", "Compare price, available liquidity and per-order limits — the three things every row on the book actually carries."],
  ["Click Buy and enter an amount", "Enter how much fiat you want to spend (or how much crypto you want) — within the advertiser's limits."],
  ["Place the order", "The seller's crypto locks in the Solana escrow program immediately, so it is guaranteed for you before you pay anything."],
  ["Pay the seller within the time window", "Transfer fiat using exactly the account details shown in the order — every field is copyable. If the window expires, the order cancels and escrow unlocks."],
  ["Click “Transferred, notify seller”", "Only after you have actually sent the money. This tells the seller to check their account."],
  ["Seller confirms — crypto arrives in your wallet", "The seller verifies your payment and escrow releases the crypto to your wallet. Order completed."],
];

const GOOD_TO_KNOW = [
  "Escrow protects you: the seller's crypto is locked on Solana before you pay — they cannot disappear with it.",
  "What you pay is the advertiser's price. Protocol fees live on chain in the escrow program's fee config and are governance-updatable, so no page here quotes a rate it has not read.",
  "Every order has a payment window; if you can't pay in time, cancel instead of letting it expire.",
  "If the seller doesn't respond or confirm, open an Appeal — escrow freezes and an arbitrator steps in.",
];

export default function BuyGuidePage() {
  return (
    <section>
      <PageHero
        variant="flow"
        title="How to Buy Crypto with Fiat — Fiat On-Ramp"
        description="Turn your local currency into stablecoins in minutes. Which tokens, currencies and payment methods are on offer comes from your access node and the live order book — every order protected by escrow on Solana."
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
