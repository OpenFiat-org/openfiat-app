import type { Metadata } from "next";
import Link from "next/link";
import { OPEN_BALANCE, OPEN_BOND_REQUIRED } from "@/lib/data/wallet";
import { formatNumber } from "@/lib/format";
import { PageHero } from "@/components/page-hero";
import { StepList } from "@/components/guide/step-list";

export const metadata: Metadata = {
  title: { absolute: "How to Become a Merchant — Post Ads on OpenFiat P2P | OpenFiat" },
  description:
    "Become an OpenFiat merchant: bond OPEN, fund a liquidity vault, and publish advertisements buyers and sellers can trade against. No application and no approval — the bond is the qualification.",
  alternates: { canonical: "/guide/merchant" },
};

const STEPS: Array<[string, string]> = [
  [
    "Bond OPEN",
    `A merchant stakes OPEN as accountability, not as a fee — it stays yours unless a protocol penalty applies. ${formatNumber(OPEN_BOND_REQUIRED, 0)} OPEN buys one advertisement slot, and each further slot costs the same again. This is what replaces an application form: nobody approves you, but you have something at risk.`,
  ],
  [
    "Fund a liquidity vault",
    "A sell advertisement is backed by inventory you have already deposited, per stablecoin. Reservations move balances from Available to Reserved, and settlement moves them to Settled — a buyer can see the funds exist before committing, which is why your ads get taken.",
  ],
  [
    "Decide your market",
    "Direction, asset and fiat currency. Pick a corridor you can actually service: you need a payment account in that currency, and you need to be awake when its buyers are.",
  ],
  [
    "Set a price",
    "Fixed, or floating as a premium over the oracle mid. Floating tracks the market without you watching it; fixed is predictable but goes stale. Tighter pricing wins more orders and earns less per order.",
  ],
  [
    "Set limits you will honour",
    "Minimum and maximum per trade. A maximum above what you can settle promptly costs you settlement speed, which is a reputation dimension buyers filter on.",
  ],
  [
    "Declare payment methods and terms",
    "Only rails you can genuinely receive on. Your terms are where you state whose name must be on the transfer, what reference to use, and which hours you settle — those conditions are what disputes turn on, so put them here rather than explaining them in chat afterwards.",
  ],
  [
    "Publish and stay responsive",
    "Availability and response time are scored and decay with inactivity, so a stale ad quietly stops appearing. Pause your ads rather than leaving them up when you cannot settle.",
  ],
];

const OBLIGATIONS = [
  "Your bond is slashable. Failing to settle a trade you accepted, or losing a dispute, has a cost — that is the point of it.",
  "Every completed trade updates eight reputation dimensions. Dispute rate and settlement speed are the two buyers look at hardest.",
  "You are the counterparty, not a platform. Nobody escrows on your behalf — the Solana escrow program does, and it releases on the outcome, not on your say-so.",
  "Release only after you have verified the money in your own account. A screenshot is not a payment.",
  "Keep every message in the trade chat. It is the evidence an arbitrator reads, and conversations moved elsewhere cannot be produced later.",
];

export default function MerchantGuidePage() {
  const shortfall = Math.max(0, OPEN_BOND_REQUIRED - OPEN_BALANCE);

  return (
    <section>
      <PageHero
        variant="bloom"
        title="How to become a merchant"
        description="Merchants are the liquidity on OpenFiat: they post the advertisements everyone else trades against, quote the prices, and settle the fiat leg. There is no application and no approval — you bond OPEN, fund a vault, and publish. What follows is what that actually commits you to."
      />

      <div className="mt-10 max-w-3xl">
        {/* Where the reader stands right now, rather than an abstract
            requirement they have to go and check for themselves. */}
        <div
          className={`rounded-md border px-4 py-3 text-sm ${
            shortfall > 0
              ? "border-amber-400/40 bg-amber-400/[0.04] text-amber-100"
              : "border-brand-teal/40 bg-brand-teal/[0.04] text-gray-200"
          }`}
        >
          {shortfall > 0 ? (
            <>
              You hold {formatNumber(OPEN_BALANCE, 0)} OPEN and need{" "}
              {formatNumber(OPEN_BOND_REQUIRED, 0)} to bond your first advertisement slot —{" "}
              {formatNumber(shortfall, 0)} short.{" "}
              <Link href="/open" className="underline decoration-amber-400/50 underline-offset-4">
                Buy OPEN in the presale
              </Link>
              .
            </>
          ) : (
            <>
              You hold {formatNumber(OPEN_BALANCE, 0)} OPEN — enough to bond{" "}
              {Math.floor(OPEN_BALANCE / OPEN_BOND_REQUIRED)} advertisement slot
              {Math.floor(OPEN_BALANCE / OPEN_BOND_REQUIRED) === 1 ? "" : "s"} at{" "}
              {formatNumber(OPEN_BOND_REQUIRED, 0)} OPEN each.{" "}
              <Link href="/staking" className="underline decoration-brand-teal/50 underline-offset-4">
                Bond it on the staking page
              </Link>
              .
            </>
          )}
        </div>

        <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-gray-400">
          Step by step
        </h2>
        <div className="mt-3">
          <StepList steps={STEPS} />
        </div>

        <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-gray-400">
          What you are taking on
        </h2>
        <ul className="mt-3 space-y-2.5">
          {OBLIGATIONS.map((o) => (
            <li key={o} className="border-l-2 border-amber-400/50 pl-3 text-sm text-gray-300">
              {o}
            </li>
          ))}
        </ul>

        <div className="mt-10 flex flex-wrap gap-6 border-t border-white/10 pt-6 text-sm">
          <Link href="/ads/new" className="text-brand hover:text-brand-hover">
            Post your first advertisement →
          </Link>
          <Link href="/staking" className="text-brand hover:text-brand-hover">
            Bond OPEN →
          </Link>
          <Link href="/wallet" className="text-brand hover:text-brand-hover">
            Fund a liquidity vault →
          </Link>
        </div>
      </div>
    </section>
  );
}
