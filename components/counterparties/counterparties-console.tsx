"use client";

import { useTranslations } from "next-intl";
import { CopyButton } from "@/components/copy-button";
import { Panel } from "@/components/panel";
import { useCounterparties } from "@/components/counterparties/use-counterparties";
import {
  formatPeerId,
  suggested,
  tradedCount,
  type CounterpartySummary,
} from "@/lib/counterparties";
import { formatDateShort } from "@/lib/format";
import bs58 from "bs58";

/**
 * The people you trade with, read from a live node against your own wallet.
 *
 * Everything on this screen is derived from settlements the connected wallet
 * was itself a party to. There is no lookup for anyone else's relationships,
 * by design — see `lib/counterparties.ts`.
 */
export function CounterpartiesConsole() {
  const t = useTranslations("counterparties");
  const { status, summaries, error, read } = useCounterparties();

  if (status === "no-wallet") {
    return (
      <Panel title={t("title")}>
        <p className="px-4 py-6 text-sm text-gray-400">
          {t("connectPrompt")}
        </p>
      </Panel>
    );
  }

  const regulars = suggested(summaries);

  return (
    <div className="space-y-6">
      <Panel
        title={t("title")}
        action={
          <button
            type="button"
            onClick={read}
            disabled={status === "loading"}
            className="text-xs text-gray-400 hover:text-white disabled:text-gray-600"
          >
            {status === "loading"
              ? t("waitingSignature")
              : status === "loaded"
                ? t("refresh")
                : t("readHistory")}
          </button>
        }
      >
        {error && <p className="px-4 py-4 text-sm text-amber-400">{error}</p>}

        {status === "ready" && !error && (
          <p className="px-4 py-6 text-sm text-gray-400">
            {t("signPrompt")}
          </p>
        )}

        {status === "loaded" && regulars.length === 0 && (
          <p className="px-4 py-6 text-sm text-gray-400">
            {t("noCompleted")}
          </p>
        )}

        {regulars.length > 0 && (
          <ul className="divide-y divide-white/5">
            {regulars.map((summary) => (
              <CounterpartyRow key={formatPeerId(summary.counterparty)} summary={summary} />
            ))}
          </ul>
        )}
      </Panel>

      {status === "loaded" && summaries.length > regulars.length && (
        <Panel title={t("startedNeverTitle")}>
          <p className="px-4 pt-4 text-xs text-gray-500">
            {t("startedNeverIntro")}
          </p>
          <ul className="mt-2 divide-y divide-white/5">
            {summaries
              .filter((summary) => summary.trades === 0)
              .map((summary) => (
                <CounterpartyRow key={formatPeerId(summary.counterparty)} summary={summary} />
              ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function CounterpartyRow({ summary }: { summary: CounterpartySummary }) {
  const t = useTranslations("counterparties");
  const full = bs58.encode(Uint8Array.from(summary.counterparty));
  const count = tradedCount(summary);
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
      <div>
        <p className="flex items-center gap-2 font-mono text-sm text-white">
          {formatPeerId(summary.counterparty)}
          <CopyButton value={full} />
        </p>
        <p className="mt-1 text-xs text-gray-500">
          {count === null ? t("noCompletedTrades") : t("tradedTimes", { count })}
          {summary.last_traded_at !== null && (
            <> · {t("lastOn", { date: formatDateShort(new Date(summary.last_traded_at).toISOString()) })}</>
          )}
        </p>
      </div>
      <div className="flex items-center gap-4 text-xs tabular-nums text-gray-400">
        <Count label={t("countTrades")} value={summary.trades} tone="text-white" />
        {summary.in_progress > 0 && <Count label={t("countInProgress")} value={summary.in_progress} />}
        {summary.abandoned > 0 && <Count label={t("countCalledOff")} value={summary.abandoned} />}
        {summary.disputed > 0 && (
          <Count label={t("countDisputed")} value={summary.disputed} tone="text-amber-400" />
        )}
      </div>
    </li>
  );
}

function Count({ label, value, tone = "" }: { label: string; value: number; tone?: string }) {
  return (
    <span className="text-right">
      <span className={`block text-sm ${tone}`}>{value}</span>
      <span className="block text-[10px] uppercase tracking-wider text-gray-600">{label}</span>
    </span>
  );
}
