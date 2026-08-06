"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { fetchReputationForPeerId, type LiveReputation } from "@/lib/live-reputation";

/**
 * A merchant's conduct, as `crates/reputation` computes it from settlement,
 * dispute and reservation state.
 *
 * Every figure is a counter or a ratio of counters. There is no score, no tier
 * and no rating, because the node returns none: `getReputation` serializes
 * `ReputationProfile`'s fields, and its `tier()` is a method whose thresholds
 * the crate itself marks as placeholders pending governance. A wallet with no
 * history says so rather than rendering zeroes, which read as a bad record
 * instead of an absent one.
 *
 * Shared by the directory's expanded row and `/merchants/<peerId>` so the two
 * cannot describe the same wallet differently — the profile page's previous
 * incarnation scored eight invented dimensions out of 100 beside a directory
 * that correctly refused to score anything.
 */
export function TradingRecord({ peerId }: { peerId: string }) {
  const t = useTranslations("merchants");
  const [data, setData] = useState<LiveReputation | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      setData(await fetchReputationForPeerId(peerId));
    } catch {
      setError(true);
    }
  }, [peerId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
        {t("recTitle")}
      </h3>
      {error ? (
        <p className="mt-3 text-xs text-amber-300">
          {t("recNodeError")}
        </p>
      ) : !data ? (
        <p className="mt-3 text-xs text-gray-500">{t("recReading")}</p>
      ) : data.empty ? (
        <p className="mt-3 text-xs leading-relaxed text-gray-500">
          {t("recEmpty")}
        </p>
      ) : (
        <dl className="mt-3 divide-y divide-white/5 text-xs">
          <Fact label={t("recTradesStarted")} value={String(data.tradesStarted)} />
          <Fact label={t("recCompleted")} value={String(data.tradesCompleted)} />
          <Fact
            label={t("recCompletionRate")}
            value={data.completionRate === null ? "—" : percent(data.completionRate)}
            hint={t("recCompletionHint")}
          />
          <Fact label={t("recCancelled")} value={String(data.tradesCancelled)} />
          <Fact
            label={t("recDisputes")}
            value={t("recDisputesValue", { involved: data.disputesInvolved, lost: data.disputesLost })}
          />
          <Fact
            label={t("recAnsweredClaims")}
            value={data.responseRate === null ? t("recNeverAsked") : percent(data.responseRate)}
            hint={t("recAnsweredHint")}
          />
          <Fact
            label={t("recMeanAnswer")}
            value={data.meanResponseMs === null ? "—" : duration(data.meanResponseMs)}
            hint={t("recMeanAnswerHint")}
          />
          <Fact
            label={t("recMeanSettlement")}
            value={data.medianSettlementMs === null ? "—" : duration(data.medianSettlementMs)}
          />
          <Fact
            label={t("recMissedReservations")}
            value={String(data.reservationsMissed)}
            hint={t("recMissedHint")}
          />
          <Fact
            label={t("recFirstTraded")}
            value={
              data.firstActiveAt === null
                ? "—"
                : new Date(data.firstActiveAt).toLocaleDateString()
            }
          />
        </dl>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-gray-600">
        {t("recFooter")}
      </p>
    </div>
  );
}

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <dt className={`text-gray-500 ${hint ? "cursor-help" : ""}`} title={hint}>
        {label}
      </dt>
      <dd className="text-right tabular-nums text-gray-200">{value}</dd>
    </div>
  );
}

function percent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

function duration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 90) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 36 ? `${hours} h` : `${Math.round(hours / 24)} d`;
}
