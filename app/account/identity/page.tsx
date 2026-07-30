import type { Metadata } from "next";

import { IdentityClaimsPanel } from "@/components/account/identity-claims";
import { LiveReputationPanel } from "@/components/account/live-reputation";
import { PageHero } from "@/components/page-hero";
import { Panel } from "@/components/panel";

export const metadata: Metadata = {
  title: "Identity & Reputation",
  description:
    "The identity claims your wallet has actually published, and the reputation counters a node records for it. Both are read live; neither is stored as a score or a level.",
};

/**
 * Identity levels as OFS-5000 §8 defines them — a description of what a
 * wallet has chosen to publish, and nothing else.
 *
 * This is documentation, not a claim about the reader. Nothing here is
 * presented as their standing, because no level is stored anywhere: see
 * `components/account/identity-claims.tsx` for what the registry does hold
 * and what the table this replaced was inventing.
 *
 * The wording of each level follows the specification closely on purpose.
 * The previous version paraphrased it into requirements — a company
 * registration number and a beneficial-owner check at Level 2, an uptime
 * percentage and a token bond at Level 3 — none of which the specification
 * asks for and none of which anything in this codebase performs.
 */
const LEVELS = [
  {
    level: "Level 0",
    title: "Wallet identity",
    body: "A valid wallet, authenticated. This is the minimum to use OpenFiat, and §8 is explicit that participation never requires going further than this.",
  },
  {
    level: "Level 1",
    title: "Verified contact",
    body: "One or more communication channels — email, phone, Telegram, Discord, X — published as claims. The specification pairs these with OTP verification; that flow is the wallet application's to run and no node performs it, so a claim marked verified is the publisher saying so.",
  },
  {
    level: "Level 2",
    title: "Merchant identity",
    body: "A display name, business name, brand logo and support contacts, self-published and signed. §8's own caveat is worth repeating: these improve confidence but do not imply regulatory approval, and nobody checks them against a registry.",
  },
  {
    level: "Level 3",
    title: "Infrastructure provider",
    body: "Operational details an infrastructure operator may publish — organisation name, documentation, support and incident contacts — so other operators can identify them. There is no threshold to meet and no bond to post; the specification names no requirement of either kind.",
  },
];

export default function IdentityPage() {
  return (
    <section>
      <PageHero
        title="Identity & Reputation"
        description="What your wallet has published about itself, and what the network has recorded about how it trades. Both are bound to your key rather than to an account, and both travel with it to every OpenFiat application."
      />

      <div className="mt-8">
        <IdentityClaimsPanel />
      </div>

      <div className="mt-8">
        <LiveReputationPanel />
      </div>

      <div className="mt-8">
        <Panel title="What the levels mean">
          <ol className="divide-y divide-white/5">
            {LEVELS.map((level) => (
              <li key={level.level} className="px-4 py-4">
                <p className="text-sm text-gray-200">
                  <span className="text-gray-500">{level.level}</span> · {level.title}
                </p>
                <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gray-500">{level.body}</p>
              </li>
            ))}
          </ol>
          <p className="border-t border-white/10 px-4 py-2.5 text-[11px] text-gray-600">
            No level is stored against your wallet, and nothing in the protocol is gated on one. A
            level describes which kinds of claim a wallet has published, so it is something a
            reader concludes from the list above rather than a status anybody grants.
          </p>
        </Panel>
      </div>
    </section>
  );
}
