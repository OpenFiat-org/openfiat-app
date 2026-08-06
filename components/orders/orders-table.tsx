"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { WALLET_CHANGED_EVENT, readWalletConnection, type WalletConnection } from "@/lib/wallet-connection";
import { peerIdForAddress } from "@/lib/peer-id";
import {
  deriveStatus,
  MY_TRADES,
  myTrades,
  TRADE_STATUS_LABEL,
  type Trade,
} from "@/lib/live-trades";
import { useSignedRead } from "@/components/use-signed-read";
import { assetLabel, fetchAdvertisements, type LiveAd } from "@/lib/live-advertisements";
import { formatCrypto, formatDateMs } from "@/lib/format";
import { DataTable, Td, Th, Tr } from "@/components/data-table";
import { StatusPill } from "@/components/status-pill";

const FILTERS = ["All", "Active", "Completed", "Cancelled", "Disputed", "Rejected"] as const;
type Filter = (typeof FILTERS)[number];

function matches(trade: Trade, filter: Filter): boolean {
  const status = deriveStatus(trade);
  switch (filter) {
    case "All":
      return true;
    case "Active":
      return status === "EscrowLocked" || status === "AwaitingPayment" || status === "PaymentSubmitted";
    default:
      return TRADE_STATUS_LABEL[status] === filter;
  }
}


/**
 * `/orders`, reading this wallet's real trades from a node.
 *
 * Replaces a table driven by `TRADES` — a fixture where every "settlement
 * transaction" and "escrow creation transaction" shown in the trade room was
 * a deterministic fake, and every "bank account"/"M-Pesa number" a merchant
 * supposedly gave you was invented too (see `components/orders/trade-room.tsx`
 * and `lib/data/trades.ts`, both deleted).
 *
 * # It reads `getMyTrades`, and the read it replaced returned nothing
 *
 * This used to call `getTrades` and keep the rows naming this wallet. That
 * read is redacted: the requester, the buyer and the seller are not in it, so
 * the filter matched nothing and every wallet was told it had no trades. The
 * failure was invisible because "no trades" is also a perfectly ordinary
 * answer.
 *
 * `getMyTrades` answers for one wallet, behind a signature, and it costs a
 * wallet prompt — so nothing is fetched on mount. A page that pops a signing
 * prompt because you opened it trains people to approve prompts without
 * reading them, which is the argument `components/use-signed-read.ts` makes
 * at length and this screen follows.
 */
export function OrdersTable() {
  const t = useTranslations("orders");
  const [wallet, setWallet] = useState<WalletConnection | null>(null);
  const [ads, setAds] = useState<LiveAd[]>([]);
  const [filter, setFilter] = useState<Filter>("All");
  const { status, data: trades, error, read } = useSignedRead<Trade[]>(myTrades, MY_TRADES);

  useEffect(() => {
    const update = () => setWallet(readWalletConnection());
    update();
    window.addEventListener(WALLET_CHANGED_EVENT, update);
    return () => window.removeEventListener(WALLET_CHANGED_EVENT, update);
  }, []);

  // The advertisements are an open read and name the pair each trade is in.
  // Their absence is not an error for this table — a row still says what it
  // is worth in base units — so a failure here is swallowed rather than
  // taking the page down with it.
  useEffect(() => {
    fetchAdvertisements()
      .then(setAds)
      .catch(() => setAds([]));
  }, []);

  const adById = useMemo(() => new Map(ads.map((a) => [a.id, a])), [ads]);

  if (!wallet) {
    return (
      <p className="rounded-lg border border-white/10 bg-white/[0.02] p-6 text-sm text-gray-400">
        {t.rich("connectPrompt", { em: (chunks) => <em>{chunks}</em> })}
      </p>
    );
  }

  if (status === "failed") {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/[0.04] p-6">
        <p className="text-sm font-medium text-red-300">{t("readError")}</p>
        <p className="mt-1 text-xs text-red-400/80">{error}</p>
        <button
          onClick={read}
          className="mt-4 rounded-md border border-white/15 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-white/5"
        >
          {t("tryAgain")}
        </button>
      </div>
    );
  }

  if (trades === null) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-6">
        <p className="text-sm text-gray-300">
          {t("signPromptBody")}
        </p>
        <p className="mt-1.5 text-xs text-gray-500">
          {t("signPromptSub")}
        </p>
        <button
          onClick={read}
          disabled={status === "loading"}
          className="mt-4 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
        >
          {status === "loading" ? t("waitingWallet") : t("showMyTrades")}
        </button>
      </div>
    );
  }

  const myPeerId = peerIdForAddress(wallet.address) ?? "";
  const mine = trades;
  const visible = mine.filter((tr) => matches(tr, filter));

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              filter === f
                ? "border-brand/50 bg-brand/10 text-brand-hover"
                : "border-white/10 text-gray-400 hover:text-white"
            }`}
          >
            {t(`filter${f}`)}
          </button>
        ))}
      </div>

      {mine.length === 0 ? (
        <p className="mt-6 py-8 text-sm text-gray-500">
          {t("noTrades")}
        </p>
      ) : (
        <div className="mt-4">
          <DataTable
            minWidth={860}
            head={
              <tr>
                <Th>{t("colTrade")}</Th>
                <Th>{t("colPair")}</Th>
                <Th right>{t("colAmount")}</Th>
                <Th>{t("colRole")}</Th>
                <Th>{t("colStatus")}</Th>
                <Th right>{t("colUpdated")}</Th>
              </tr>
            }
          >
            {visible.map((trade) => {
              const ad = adById.get(trade.reservation.advertisement_id);
              const amount = trade.reservation.amount.base_units / 10 ** trade.reservation.amount.decimals;
              const status = deriveStatus(trade);
              // From the settlement once one exists, because that is where
              // the two sides are actually recorded; before then the
              // requester is the trade's only named party.
              const roleKey = trade.settlement
                ? trade.settlement.buyer === myPeerId
                  ? "roleBuyer"
                  : "roleMerchant"
                : trade.reservation.requester === myPeerId
                  ? "roleRequester"
                  : "roleCounterparty";
              return (
                <Tr key={trade.reservation.id}>
                  <Td py="py-5">
                    <Link href={`/orders/${trade.reservation.id}`} className="font-mono font-medium text-brand hover:text-brand-hover">
                      {trade.reservation.id}
                    </Link>
                  </Td>
                  <Td py="py-5" className="text-gray-300">
                    {ad ? `${assetLabel(ad)}/${ad.fiatCurrency}` : "—"}
                  </Td>
                  <Td py="py-5" right num className="text-gray-300">
                    {ad ? formatCrypto(amount, assetLabel(ad)) : amount}
                  </Td>
                  <Td py="py-5" className="text-gray-400">{t(roleKey)}</Td>
                  <Td py="py-5"><StatusPill status={TRADE_STATUS_LABEL[status]} label={t(`status${status}`)} /></Td>
                  <Td py="py-5" right className="text-xs text-gray-500">{formatDateMs(trade.reservation.updated_at)}</Td>
                </Tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                  {t("noTradesInState")}
                </td>
              </tr>
            )}
          </DataTable>
        </div>
      )}
    </div>
  );
}
