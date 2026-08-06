"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Panel } from "@/components/panel";
import { CopyButton } from "@/components/copy-button";
import { shortAddress } from "@/lib/format";
import { fetchReputation, type LiveReputation } from "@/lib/live-reputation";
import { readWalletConnection, WALLET_CHANGED_EVENT } from "@/lib/wallet-connection";

/**
 * The connected wallet's reputation, read from the node.
 *
 * The panel this replaced showed a fixed "Professional" tier, a 72%
 * progress bar toward "Elite", and eight scored dimensions including
 * "412,000 USDT lifetime" — to every visitor, including one whose wallet
 * had never traded. There are no tiers and no 0-100 scores in the protocol;
 * that ladder existed only in the fixture.
 */
export function LiveReputationPanel() {
  const t = useTranslations("identity");
  const [wallet, setWallet] = useState<string | null>(null);
  const [data, setData] = useState<LiveReputation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const read = () => setWallet(readWalletConnection()?.address ?? null);
    read();
    window.addEventListener(WALLET_CHANGED_EVENT, read);
    return () => window.removeEventListener(WALLET_CHANGED_EVENT, read);
  }, []);

  useEffect(() => {
    if (!wallet) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchReputation(wallet)
      .then((r) => !cancelled && setData(r))
      .catch(() => !cancelled && setError(t("nodeUnreachable")))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [wallet, t]);

  if (!wallet) {
    return (
      <Panel title={t("repTitle")}>
        <p className="px-4 py-10 text-center text-sm text-gray-500">
          {t("repConnect")}
        </p>
      </Panel>
    );
  }

  return (
    <Panel title={t("repTitle")}>
      <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3 font-mono text-xs text-gray-500">
        {shortAddress(wallet)}
        <CopyButton value={wallet} />
      </div>

      {loading && <p className="px-4 py-10 text-center text-sm text-gray-500">{t("readingNode")}</p>}
      {error && <p className="px-4 py-10 text-center text-sm text-amber-300">{error}</p>}

      {data && data.empty && (
        <p className="px-4 py-10 text-center text-sm text-gray-500">
          {t("repEmpty")}
        </p>
      )}

      {data && !data.empty && (
        <ol className="divide-y divide-white/5">
          <Row label={t("tradesStarted")} value={String(data.tradesStarted)} />
          <Row label={t("tradesCompleted")} value={String(data.tradesCompleted)} />
          <Row label={t("tradesCancelled")} value={String(data.tradesCancelled)} />
          <Row
            label={t("completionRate")}
            value={data.completionRate === null ? "—" : `${(data.completionRate * 100).toFixed(1)}%`}
            note={data.completionRate === null ? t("noTradesYet") : undefined}
          />
          <Row
            label={t("meanSettlement")}
            value={
              data.medianSettlementMs === null
                ? "—"
                : t("minutes", { n: Math.round(data.medianSettlementMs / 60000) })
            }
            // Named a mean because that is what it is: the node returns a
            // duration sum and a count, which cannot produce a median.
            note={t("meanNote")}
          />
          <Row label={t("disputesInvolved")} value={String(data.disputesInvolved)} />
          <Row label={t("disputesLost")} value={String(data.disputesLost)} />
          <Row label={t("paymentDiscrepancies")} value={String(data.paymentDiscrepancies)} />
          <Row label={t("reservationsMissed")} value={String(data.reservationsMissed)} />
        </ol>
      )}

      <p className="border-t border-white/10 px-4 py-2.5 text-[11px] text-gray-600">
        {t("repFooter")}
      </p>
    </Panel>
  );
}

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <li className="flex items-baseline justify-between px-4 py-3 text-sm">
      <span className="text-gray-300">{label}</span>
      <span className="text-right">
        <span className="tabular-nums text-white">{value}</span>
        {note && <span className="ml-2 text-[11px] text-gray-600">{note}</span>}
      </span>
    </li>
  );
}
