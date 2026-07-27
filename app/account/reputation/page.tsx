import type { Metadata } from "next";
import { IDENTITY_CLAIMS, REPUTATION } from "@/lib/data/identity";
import { CURRENT_USER } from "@/lib/data/merchants";
import { shortAddress } from "@/lib/format";
import { CopyButton } from "@/components/copy-button";
import { PageHero } from "@/components/page-hero";
import { MerchantAvatar } from "@/components/merchant-avatar";
import { Panel } from "@/components/panel";
import { TierBadge } from "@/components/tier-badge";

export const metadata: Metadata = {
  title: "Reputation",
  description: "Your OpenFiat reputation — wallet-bound, portable, built on 8 objective dimensions.",
};

/** Per-dimension guidance: how to increase each dimension as a merchant/buyer. */
const GUIDANCE: Record<string, string> = {
  "Settlement Speed": "Approve fiat payments within 15 minutes of receipt — speed is measured per release.",
  "Trade Success Rate": "Never cancel after escrow locks. Only reserve what you can settle.",
  "Dispute Rate": "Respond in trade chat and resolve issues before they escalate to arbitration.",
  "Trade Volume": "Grow through consistent, always-on advertisements across active markets.",
  "Average Ticket Size": "Raise your limits as your liquidity vault and merchant bond grow.",
  "Merchant Age": "Reputation accrues with account age — keep your wallet active over time.",
  Availability: "Stay Online; use Vacation mode instead of going offline when away.",
  "Payment Accuracy": "Verify amounts and references before approving every payment.",
};

const TIER_LADDER: Array<{ tier: string; unlocks: string }> = [
  { tier: "Explorer", unlocks: "1 ad slot · standard visibility · 5,000 OPEN bond" },
  { tier: "Verified", unlocks: "2 ad slots · verified badge in the order book" },
  { tier: "Professional", unlocks: "4 ad slots · priority placement · 5% bond discount" },
  { tier: "Elite", unlocks: "7 ad slots · top-of-book placement · 10% bond discount" },
  { tier: "Institutional", unlocks: "10 ad slots · API market-making tier · 20% bond discount" },
];

export default function ReputationPage() {
  return (
    <section>
      <PageHero
        title="Reputation"
        description="No star ratings — reputation is a set of objective, on-chain-verifiable dimensions, bound to your wallet and portable across every OpenFiat application."
      />

      {/* Current standing */}
      <div className="mt-8 flex flex-wrap items-center gap-5">
        <MerchantAvatar name={CURRENT_USER.name} tier={CURRENT_USER.tier} size="md" />
        <div>
          <div className="flex items-center gap-2.5">
            <span className="text-lg font-semibold text-white">{REPUTATION.tier}</span>
            <TierBadge tier={REPUTATION.tier} />
          </div>
          <p className="mt-1 flex items-center gap-2 font-mono text-xs text-gray-500">
            {shortAddress(CURRENT_USER.wallet)}
            <CopyButton value={CURRENT_USER.wallet} />
          </p>
        </div>
        <div className="min-w-64 flex-1">
          <div className="flex justify-between text-xs text-gray-500">
            <span>{REPUTATION.tier}</span>
            <span>{REPUTATION.nextTier}</span>
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-white/10">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-brand to-brand-teal"
              style={{ width: `${REPUTATION.progressPct}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs tabular-nums text-gray-500">
            {REPUTATION.progressPct}% of the way to {REPUTATION.nextTier}
          </p>
        </div>
      </div>

      {/* Dimensions with guidance */}
      <div className="mt-10">
        <Panel title="Reputation dimensions — and how to increase them">
          <ol className="divide-y divide-white/5">
            {REPUTATION.dimensions.map((d) => (
              <li key={d.label} className="px-4 py-4">
                <div className="flex items-center gap-4 text-sm">
                  <span className="w-44 shrink-0 text-gray-200">{d.label}</span>
                  <span className="h-1 flex-1 rounded-full bg-white/10">
                    <span className="block h-1 rounded-full bg-brand" style={{ width: `${d.score}%` }} />
                  </span>
                  <span className="w-44 shrink-0 text-right text-xs tabular-nums text-gray-500">{d.display}</span>
                </div>
                <p className="mt-1.5 text-xs text-gray-500">
                  <span className="mr-1.5 text-brand-teal">↗</span>
                  {GUIDANCE[d.label]}
                </p>
              </li>
            ))}
          </ol>
        </Panel>
      </div>

      {/* Tier ladder */}
      <div className="mt-8">
        <Panel title="Tier ladder — what each tier unlocks">
          <ol className="divide-y divide-white/5">
            {TIER_LADDER.map((t) => {
              const current = t.tier === REPUTATION.tier;
              return (
                <li key={t.tier} className={`flex items-center gap-4 px-4 py-3.5 text-sm ${current ? "bg-brand/5" : ""}`}>
                  <span className={`w-32 shrink-0 font-medium ${current ? "text-brand-hover" : "text-gray-300"}`}>
                    {t.tier}
                    {current && <span className="ml-2 text-xs text-gray-500">← you</span>}
                  </span>
                  <span className="text-gray-400">{t.unlocks}</span>
                </li>
              );
            })}
          </ol>
        </Panel>
      </div>

      <p className="mt-6 text-xs text-gray-500">
        {IDENTITY_CLAIMS[2].title} verified. Reputation events (SettlementCompleted, DisputeResolved, …) are emitted as
        signed protocol events and aggregate into these dimensions on every OpenFiat app you use.
      </p>
    </section>
  );
}
