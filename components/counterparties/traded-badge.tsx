"use client";

import { useTranslations } from "next-intl";
import { peerIdForAddress, summaryFor, tradedCount } from "@/lib/counterparties";
import { useCounterparties } from "@/components/counterparties/use-counterparties";

/**
 * The inline "You have traded 6 times with this wallet" line, shown wherever
 * a counterparty appears.
 *
 * # It renders nothing far more often than it renders something
 *
 * No wallet connected, a simulated access node, a wallet whose address is not
 * a real key, a counterparty you have never traded with, or a history you
 * have not asked for yet — every one of those is silence, not an error and
 * not a placeholder. A badge that said "0 trades" would read as a warning
 * about the counterparty when it only means the two have never met, and on a
 * node that joined the network recently it might not even be true.
 *
 * # It never prompts on its own
 *
 * Reading the history costs a wallet signature. This badge only shows a
 * figure once that read has happened somewhere the user asked for it (see
 * `useCounterparties`), which in practice means the account page. Popping a
 * signing prompt because someone opened a merchant profile is how people
 * learn to approve prompts without reading them.
 */
export function TradedBadge({ wallet }: { wallet: string }) {
  const t = useTranslations("counterparties");
  const { status, summaries } = useCounterparties();
  if (status !== "loaded") return null;

  const peerId = peerIdForAddress(wallet);
  if (!peerId) return null;

  const summary = summaryFor(summaries, peerId);
  const count = tradedCount(summary);
  if (count === null || !summary) return null;

  return (
    <span
      title={
        summary.disputed > 0
          ? t("badgeDisputedTitle", { count: summary.disputed })
          : t("badgeTitle")
      }
      className="inline-flex items-center gap-1.5 rounded-full border border-brand/40 bg-brand/10 px-2.5 py-0.5 text-xs text-brand"
    >
      ⇄ {t("tradedTimes", { count })}
      {summary.disputed > 0 && (
        <span className="text-amber-400">· {t("nDisputed", { count: summary.disputed })}</span>
      )}
    </span>
  );
}
