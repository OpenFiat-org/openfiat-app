"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { formatDateShortMs } from "@/lib/format";
import {
  fetchScreening,
  isExpired,
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
  const t = useTranslations("explorer");
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
    return <p className="text-xs text-gray-500">{t("screening")}</p>;
  }

  if (failed || !screening) {
    return (
      <p className="text-xs text-amber-300">
        {t("screeningFailed")}
      </p>
    );
  }

  const { highestSeverity, activeFlags, history, registeredProviders, screenedAt } = screening;

  return (
    <div className="space-y-3">
      {highestSeverity ? (
        <>
          <p className={`text-sm font-medium ${SEVERITY_TONE[highestSeverity]}`}>
            {t("flagged", { severity: t(`severity.${highestSeverity}`) })}
          </p>
          <p className="text-xs leading-relaxed text-gray-500">
            {t("flaggedNote", { note: t(`severityNote.${highestSeverity}`) })}
          </p>
          <ul className="space-y-2">
            {activeFlags.map((record) => (
              <RecordRow key={record.id} record={record} at={screenedAt} />
            ))}
          </ul>
        </>
      ) : registeredProviders === 0 ? (
        <p className="text-xs leading-relaxed text-gray-400">
          {t.rich("nothingScreening", { b: (c) => <span className="text-gray-200">{c}</span> })}
        </p>
      ) : history.length === 0 ? (
        <p className="text-xs leading-relaxed text-gray-400">
          {t("neverReported", { providers: registeredProviders })}
        </p>
      ) : (
        <p className="text-xs leading-relaxed text-gray-400">
          {t.rich("noCurrentFlag", { b: (c) => <span className="text-gray-200">{c}</span> })}
        </p>
      )}

      {history.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-gray-500 hover:text-gray-300">
            {t("everyRecord", { count: history.length })}
          </summary>
          <ul className="mt-2 space-y-2">
            {history.map((record) => (
              <RecordRow key={record.id} record={record} at={screenedAt} />
            ))}
          </ul>
        </details>
      )}

      <p className="text-[11px] leading-relaxed text-gray-600">
        {t("riskFooter")}
      </p>
    </div>
  );
}

/** One record, attributed to whoever signed it. An unattributed flag is worthless. */
function RecordRow({ record, at }: { record: RiskRecord; at: number }) {
  const t = useTranslations("explorer");
  // Judged against the instant the screening was taken, not this render's
  // clock — see `Screening.screenedAt`.
  const expired = isExpired(record, at);
  return (
    <li className="rounded-md border border-white/10 px-3 py-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span
          className={record.outcome === "Cleared" ? "text-emerald-400" : SEVERITY_TONE[record.severity]}
        >
          {record.outcome === "Cleared" ? t("cleared") : t(`severity.${record.severity}`)}
        </span>
        <span className="text-gray-500">{record.category}</span>
        <span className="text-gray-600">{t("confidenceWord")} {record.confidence}</span>
        <span className="ml-auto text-gray-600">{formatDateShortMs(record.publishedAt)}</span>
      </div>
      <p className="mt-1 leading-relaxed text-gray-300">{record.reason}</p>
      <p className="mt-1 font-mono text-[11px] text-gray-600" title={record.provider}>
        {t("byWord")} {shortPeerId(record.provider)}
        {expired && <span className="ml-2 font-sans text-gray-500">· {t("expiredWord")}</span>}
      </p>
      {record.evidence.length > 0 && (
        <p className="mt-1 break-all text-[11px] leading-relaxed text-gray-600">
          {/* References to evidence, per §10 — case numbers and transaction
              hashes, never the evidence itself. Not rendered as links: the
              provider chose these strings and a live link would let them
              decide where a reader is sent. */}
          {t("evidenceRefs")} {record.evidence.join(" · ")}
        </p>
      )}
    </li>
  );
}
