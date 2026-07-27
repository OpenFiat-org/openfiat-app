import { reputationFor } from "@/lib/data/merchants";
import {
  BAND_TEXT,
  COMPOSITE_NOTE,
  compositeScore,
  scoreBand,
} from "@/lib/reputation";
import type { Merchant } from "@/lib/types";

/**
 * The reputation figure, with an explanation on hover.
 *
 * The explanation is a native `title` rather than a positioned panel. A DOM
 * panel gets clipped here: `DataTable` wraps its table in `overflow-x-auto`,
 * and per CSS an `auto` on one axis makes the other `auto` too, so any
 * absolutely-positioned child that escapes the row is cut off — which is
 * exactly what happened on the first rows of the order book. A native tooltip
 * is never clipped by an ancestor, needs no client bundle, and is read out by
 * assistive tech without extra wiring.
 *
 * The full eight-dimension breakdown lives on the merchant's page, which is
 * where there is room to lay it out properly.
 */
export function ReputationScore({ merchant }: { merchant: Merchant }) {
  const score = compositeScore(merchant);
  const dims = reputationFor(merchant);

  const breakdown = dims
    .map((d) => `  ${d.label}: ${d.display}`)
    .join("\n");

  return (
    <span
      title={`Reputation ${score}/100 — ${merchant.tier} tier\n\n${COMPOSITE_NOTE}\n\nAll eight dimensions:\n${breakdown}`}
      className={`cursor-help border-b border-dotted border-current/40 text-xs tabular-nums ${BAND_TEXT[scoreBand(score)]}`}
    >
      {score}
      <span className="text-gray-600">/100</span>
    </span>
  );
}
