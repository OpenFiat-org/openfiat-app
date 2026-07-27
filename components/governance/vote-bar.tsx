import type { Proposal } from "@/lib/types";

/** Single stacked vote bar: For (emerald) / Against (red) / Abstain (gray). */
export function VoteStack({ proposal: p }: { proposal: Proposal }) {
  return (
    <span className="flex items-center gap-2">
      <span className="flex h-1.5 w-40 overflow-hidden rounded-full bg-white/10">
        <span className="bg-emerald-500" style={{ width: `${p.votesFor}%` }} />
        <span className="bg-red-400" style={{ width: `${p.votesAgainst}%` }} />
        <span className="bg-gray-500" style={{ width: `${p.votesAbstain}%` }} />
      </span>
      <span className="whitespace-nowrap text-xs tabular-nums text-gray-500">
        {p.votesFor}% · {p.votesAgainst}% · {p.votesAbstain}%
      </span>
    </span>
  );
}

/** Labeled vote bar row (used on the proposal detail page). */
export function VoteBar({ label, pct, cls }: { label: string; pct: number; cls: string }) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-14 text-gray-500">{label}</span>
      <div className="h-1.5 flex-1 rounded-full bg-white/10">
        <div className={`h-1.5 rounded-full ${cls}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 text-right tabular-nums text-gray-400">{pct}%</span>
    </div>
  );
}
