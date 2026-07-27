"use client";

import { useState } from "react";

/** Simulated OPEN-weighted vote — local state only. */
export function VotePanel({ status }: { status: string }) {
  const [voted, setVoted] = useState<string | null>(null);

  if (status !== "Active") {
    return <p className="text-xs text-gray-500">Voting is closed on this proposal.</p>;
  }

  if (voted) {
    return (
      <p className="text-sm text-brand-teal">
        ✓ Simulated vote recorded: <span className="font-semibold">{voted}</span> (25,000 OPEN weight).
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {(["For", "Against", "Abstain"] as const).map((v) => (
        <button
          key={v}
          onClick={() => setVoted(v)}
          className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
            v === "For"
              ? "bg-emerald-600 text-white hover:bg-emerald-500"
              : v === "Against"
                ? "bg-red-500/80 text-white hover:bg-red-500"
                : "border border-white/15 text-gray-300 hover:bg-white/5"
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}
