import { CATEGORY_ORDER } from "@/lib/governance";
import type { DecodedProposal } from "@/lib/onchain-decode";
import type { ProposalCategory } from "@/lib/types";

const DECIMALS = 1_000_000_000; // OPEN has 9 decimals (OFS-4100 §1)

export function toOpen(raw: bigint): number {
  return Number(raw) / DECIMALS;
}

/** On-chain `category` is the enum's declaration index (Borsh's own tag
 *  convention) — `CATEGORY_ORDER` already lists the 6 categories in that
 *  exact order, so indexing into it is the whole mapping. */
export function categoryLabel(category: number): ProposalCategory {
  return CATEGORY_ORDER[category] ?? "Informational";
}

/** A short hex fingerprint of an on-chain hash — the closest honest
 *  stand-in for a title/summary this app can show (see `Proposal`'s own
 *  doc: it stores hashes, never the real text — no off-chain↔on-chain id
 *  correlation exists to look the real text up). */
export function hashFingerprint(bytes: Uint8Array): string {
  return Buffer.from(bytes.slice(0, 8)).toString("hex");
}

export function votePercentages(p: DecodedProposal): { forPct: number; againstPct: number } {
  const total = p.votesFor + p.votesAgainst;
  if (total === 0n) return { forPct: 0, againstPct: 0 };
  return {
    forPct: Number((p.votesFor * 10000n) / total) / 100,
    againstPct: Number((p.votesAgainst * 10000n) / total) / 100,
  };
}

export function turnoutPct(p: DecodedProposal): number {
  if (p.quorumSnapshot === 0n) return 0;
  const total = p.votesFor + p.votesAgainst;
  return Number((total * 10000n) / p.quorumSnapshot) / 100;
}

const STATUS_LABEL: Record<DecodedProposal["state"], string> = {
  Draft: "Draft",
  Voting: "Active",
  Accepted: "Passed",
  Rejected: "Rejected",
};

export function statusLabel(p: DecodedProposal): string {
  return STATUS_LABEL[p.state];
}

/** A translator scoped to the `governance` namespace, as the caller passes it. */
type GovT = (key: string, values?: Record<string, string | number>) => string;

function secondsUntil(t: GovT, unixSecs: bigint): string {
  const nowSecs = BigInt(Math.floor(Date.now() / 1000));
  const diff = unixSecs - nowSecs;
  if (diff <= 0n) return t("ended");
  const days = diff / 86400n;
  const hours = (diff % 86400n) / 3600n;
  if (days > 0n) return t("endsInDays", { days: Number(days), hours: Number(hours) });
  const minutes = (diff % 3600n) / 60n;
  return t("endsInHours", { hours: Number(hours), minutes: Number(minutes) });
}

export function votingEndsLabel(t: GovT, p: DecodedProposal): string {
  if (p.state !== "Voting") return t("votingClosedLabel");
  return secondsUntil(t, p.votingEndsAt);
}
