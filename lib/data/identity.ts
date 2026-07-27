import type { IdentityClaim, ReputationProfile } from "@/lib/types";
import { CURRENT_USER_WALLET } from "@/lib/data/merchants";

/** Simulated identity claims L0–L3 for the current wallet. */
export const IDENTITY_CLAIMS: IdentityClaim[] = [
  {
    level: "L0",
    title: "Wallet Identity",
    description: "Base identity anchored to your Solana wallet keypair.",
    status: "Verified",
    details: [`Wallet ${CURRENT_USER_WALLET}`, "Registered 14 Mar 2026", "Signer: ed25519 keypair"],
  },
  {
    level: "L1",
    title: "Verified Contact",
    description: "Email and phone verified via one-time passcodes (OTP).",
    status: "Verified",
    details: ["Email t***@openwallet.ke", "Phone +254 7** *** 234", "Verified 15 Mar 2026"],
    expiry: "Renews 15 Mar 2027",
  },
  {
    // OFS-5000 §Level 2 lists exactly five things: merchant display name,
    // business name, brand logo, support email, support phone — self-published
    // and signed, then "These claims improve user confidence but do not imply
    // regulatory approval."
    //
    // This entry previously claimed a company registration number and a
    // beneficial-owner check. Neither exists in the protocol. It described KYC
    // that nobody performs and that OFS-5000 defines at no level, which is
    // exactly the wrong thing for a screen headed "Verified".
    level: "L2",
    title: "Merchant Business Profile",
    description:
      "A published trading name, brand and support contacts, signed by your own wallet. Nobody verifies these against a registry — they are how counterparties reach you, not proof of who you are.",
    status: "Verified",
    details: ["Trading as OpenWallet Ke", "support@openwallet.ke", "Published 02 Apr 2026"],
  },
  {
    level: "L3",
    title: "Trusted Infrastructure Provider",
    description: "Attestation for node operators running protocol-critical infrastructure (gateways, oracles).",
    status: "Not started",
    details: ["Requires 99.9% uptime over 90 days", "Requires 50,000 OPEN infrastructure bond"],
  },
];

/**
 * Simulated reputation profile. OpenFiat reputation has no star ratings —
 * it is a set of objective dimensions, wallet-bound and portable across all
 * OpenFiat apps.
 */
export const REPUTATION: ReputationProfile = {
  tier: "Professional",
  nextTier: "Elite",
  progressPct: 72,
  dimensions: [
    { label: "Settlement Speed", score: 88, display: "median 6 min" },
    { label: "Trade Success Rate", score: 97, display: "98.6%" },
    { label: "Dispute Rate", score: 92, display: "0.8% (lower is better)" },
    { label: "Trade Volume", score: 74, display: "412,000 USDT lifetime" },
    { label: "Average Ticket Size", score: 61, display: "350 USDT" },
    { label: "Merchant Age", score: 45, display: "4 months" },
    { label: "Availability", score: 83, display: "online 19 h/day" },
    { label: "Payment Accuracy", score: 99, display: "99.7%" },
  ],
};
