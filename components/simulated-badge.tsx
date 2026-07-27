"use client";

/** Floating "Simulated data" label — bottom-left, subtle, hover for details. */
export function SimulatedBadge() {
  return (
    <span
      title="Demo data — not connected to a live node"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300 backdrop-blur"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
      Simulated data
    </span>
  );
}
