"use client";

import { useCallback, useEffect, useState } from "react";

import { formatDateShortMs } from "@/lib/format";
import {
  fetchScreening,
  isExpired,
  SEVERITY_NOTE,
  SEVERITY_TONE,
  type RiskRecord,
  type Screening,
} from "@/lib/live-risk";
import { NODE_CHANGED_EVENT, readNodeSelection } from "@/lib/node-preference";
import { shortPeerId } from "@/lib/peer-id";

/**
 * What registered risk intelligence providers have published about one
 * wallet (OFS-7100), on the page whose whole job is answering about a
 * wallet.
 *
 * # Why here and nowhere else
 *
 * The explorer is where somebody goes to look a stranger up, and it is
 * deliberately not a step in a trade. A screening verdict wired into a
 * checkout reads as a gate — "this counterparty is approved" — which is a
 * claim nobody in this system is making. Here it is what it actually is:
 * something registered providers said, attributable to them, that a reader
 * can weigh.
 *
 * # "No flags" is the hardest thing on this page to render honestly
 *
 * Three different situations arrive as an absence, and they are worth
 * completely different amounts:
 *
 * 1. **No provider is registered at all.** Then no record could exist, and a
 *    clean screening says nothing whatsoever about the wallet. This is the
 *    devnet's state today, and it is stated first and plainly, because it is
 *    the reading a green tick would destroy.
 * 2. **Providers exist and none has ever reported on this wallet.** Nobody
 *    has looked. Also not a clean bill of health.
 * 3. **Somebody reported and it no longer stands** — superseded by a
 *    `Cleared` record, or expired. That is a real finding, and a stronger
 *    statement than either of the above.
 *
 * The screening call alone cannot tell them apart: `highest_severity` is
 * `null` in all three. §14 keeps every record for audit, so the history read
 * beside it recovers the distinction — which is the same discipline this app
 * applies to an unreachable node, one level further in.
 */
export function AddressRisk({ peerId }: { peerId: string }) {
  const [screening, setScreening] = useState<Screening | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      setScreening(await fetchScreening(readNodeSelection().url, peerId));
    } catch {
      setScreening(null);
      setFailed(true);
    }
    setLoading(false);
  }, [peerId]);

  useEffect(() => {
    void load();
    window.addEventListener(NODE_CHANGED_EVENT, load);
    return () => window.removeEventListener(NODE_CHANGED_EVENT, load);
  }, [load]);

  if (loading) {
    return <p className="text-xs text-gray-500">Screening…</p>;
  }

  if (failed || !screening) {
    return (
      <p className="text-xs text-amber-300">
        Your access node did not answer the screening methods. That is not a clean result — it is
        no result.
      </p>
    );
  }

  const { highestSeverity, activeFlags, history, registeredProviders, screenedAt } = screening;

  return (
    <div className="space-y-3">
      {highestSeverity ? (
        <>
          <p className={`text-sm font-medium ${SEVERITY_TONE[highestSeverity]}`}>
            Flagged · {highestSeverity}
          </p>
          <p className="text-xs leading-relaxed text-gray-500">
            {SEVERITY_NOTE[highestSeverity]} This is the worst severity among the current,
            unsuperseded flags below — one provider&apos;s finding, not a verdict of the network.
          </p>
          <ul className="space-y-2">
            {activeFlags.map((record) => (
              <RecordRow key={record.id} record={record} at={screenedAt} />
            ))}
          </ul>
        </>
      ) : registeredProviders === 0 ? (
        <p className="text-xs leading-relaxed text-gray-400">
          <span className="text-gray-200">Nothing is screening this network.</span> Your access
          node has no risk intelligence provider on file, and only a registered one may publish a
          record (OFS-7100 §5) — so no wallet could be flagged here, including one that should be.
          The absence of a flag says nothing at all about this address.
        </p>
      ) : history.length === 0 ? (
        <p className="text-xs leading-relaxed text-gray-400">
          No provider has ever published a record about this wallet.{" "}
          {registeredProviders === 1 ? "One provider is" : `${registeredProviders} providers are`}{" "}
          registered on this node, so somebody could have — nobody has. That means nobody has
          looked, which is not the same as looking and finding nothing.
        </p>
      ) : (
        <p className="text-xs leading-relaxed text-gray-400">
          <span className="text-gray-200">No current flag.</span> This wallet has been reported on
          before and the finding no longer stands — superseded by a later record, or expired.
          Records are never deleted (§14), so the history is below.
        </p>
      )}

      {history.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-gray-500 hover:text-gray-300">
            Every record ever published about this wallet ({history.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {history.map((record) => (
              <RecordRow key={record.id} record={record} at={screenedAt} />
            ))}
          </ul>
        </details>
      )}

      <p className="text-[11px] leading-relaxed text-gray-600">
        Read from your access node, which answers from what has replicated to it. This app never
        publishes a risk record: doing so is a registered provider&apos;s action, and the
        governance approval that would gate it is not built.
      </p>
    </div>
  );
}

/** One record, attributed to whoever signed it. An unattributed flag is worthless. */
function RecordRow({ record, at }: { record: RiskRecord; at: number }) {
  // Judged against the instant the screening was taken, not this render's
  // clock — see `Screening.screenedAt`.
  const expired = isExpired(record, at);
  return (
    <li className="rounded-md border border-white/10 px-3 py-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span
          className={record.outcome === "Cleared" ? "text-emerald-400" : SEVERITY_TONE[record.severity]}
        >
          {record.outcome === "Cleared" ? "Cleared" : record.severity}
        </span>
        <span className="text-gray-500">{record.category}</span>
        <span className="text-gray-600">confidence {record.confidence}</span>
        <span className="ml-auto text-gray-600">{formatDateShortMs(record.publishedAt)}</span>
      </div>
      <p className="mt-1 leading-relaxed text-gray-300">{record.reason}</p>
      <p className="mt-1 font-mono text-[11px] text-gray-600" title={record.provider}>
        by {shortPeerId(record.provider)}
        {expired && <span className="ml-2 font-sans text-gray-500">· expired</span>}
      </p>
      {record.evidence.length > 0 && (
        <p className="mt-1 break-all text-[11px] leading-relaxed text-gray-600">
          {/* References to evidence, per §10 — case numbers and transaction
              hashes, never the evidence itself. Not rendered as links: the
              provider chose these strings and a live link would let them
              decide where a reader is sent. */}
          Evidence references: {record.evidence.join(" · ")}
        </p>
      )}
    </li>
  );
}
