"use client";

import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  WALLET_CHANGED_EVENT,
  readWalletConnection,
  type WalletConnection,
} from "@/lib/wallet-connection";
import { TradeActions } from "@/components/orders/trade-actions";
import { TradeChannelPanel } from "@/components/orders/trade-channel-panel";
import { tradeSide } from "@/lib/trade-actions";
import { peerIdForAddress, shortPeerId } from "@/lib/peer-id";
import { PeerIdentity } from "@/components/peer-identity";
import {
  deriveStatus,
  MY_TRADES,
  myTrades,
  TRADE_STATUS_LABEL,
  type PublicTrade,
  type Trade,
} from "@/lib/live-trades";
import { useSignedRead, type SignedReadStatus } from "@/components/use-signed-read";
import {
  assetLabel,
  type LiveAd,
  unpriceableLabel,
} from "@/lib/live-advertisements";
import type { SettlementStatus } from "@/lib/types";
import { formatCrypto, formatDateMs, shortSig } from "@/lib/format";
import { CopyButton } from "@/components/copy-button";
import { ReservationSteps } from "@/components/orders/reservation-steps";
import { SettlementSteps } from "@/components/orders/settlement-steps";
import { Panel } from "@/components/panel";
import { ReviewForm } from "@/components/reviews/review-form";
import { TradeAttachments } from "@/components/orders/trade-attachments";
import { StatusPill } from "@/components/status-pill";

const TERMINAL = new Set<SettlementStatus>([
  "Completed",
  "Cancelled",
  "Rejected",
  "Disputed",
]);


/**
 * Trade room, reading one real trade (a `getTrade`-joined reservation +
 * settlement) from a node.
 *
 * # What this replaced
 *
 * Every action here — "Transferred, notify seller", "Buyer paid (simulated)",
 * "Seller confirms (simulated)", cancel, appeal — mutated local React state
 * only; nothing was ever sent to a node. Two things it showed were worse
 * than inert: `trade.paymentFields` was a fabricated bank account number, IBAN,
 * or M-Pesa number generated deterministically from the trade id and
 * presented as the counterparty's real payment details with a copy button,
 * and `trade.txSig`/`trade.escrowSig` were fabricated 88-char base58 strings
 * presented as "Settlement tx"/"Escrow creation tx" with their own copy
 * buttons. Sending real money to the fabricated account, or trusting the
 * fabricated signature as proof of an on-chain release, would have been
 * acting on values nobody ever recorded anywhere.
 *
 * This shows only what the node reports: the reservation, the settlement if
 * one exists, and — the one real transaction signature a trade can carry —
 * `settlement.escrow_release_signature`, shown when the node has one and
 * plainly marked absent when it does not.
 *
 * # It now acts, and the distinction it drew still holds
 *
 * `components/orders/trade-actions.tsx` submits the real signed events and
 * the real on-chain transactions. What has not changed is what this page
 * treats as true: a signature returned by a wallet means a transaction was
 * accepted for submission, and nothing here promotes that to "confirmed".
 * The escrow-release row below still reads from the node's own record, which
 * is set only once a node has observed the confirmation for itself.
 *
 * # Two reads, because a trade has two audiences
 *
 * The page renders from `getTrade`, which is redacted: amounts, states and
 * timing, with neither party named. That is all anybody is entitled to, and
 * it is enough to show what happened.
 *
 * Everything that depends on *who you are* — which side you are on, what you
 * can sign, the trade channel — needs the unredacted record, and that comes
 * from `getMyTrades` behind a wallet signature, on request. Deriving a side
 * from the redacted view is not possible and was not merely imprecise: this
 * component used to compare a peer id against `reservation.requester`, a
 * field that stopped arriving when the read was redacted, so every visitor
 * silently read as "not the requester" and no amount of copy downstream fixed
 * it.
 */
export function TradeRoom({
  publicTrade,
  ad,
}: {
  publicTrade: PublicTrade;
  ad: LiveAd | null;
}) {
  const router = useRouter();
  const [wallet, setWallet] = useState<WalletConnection | null>(null);
  const [myPeerId, setMyPeerId] = useState<string | null>(null);
  const {
    status: mineStatus,
    data: mine,
    error: mineError,
    read: readMine,
    forget: forgetMine,
  } = useSignedRead<Trade[]>(myTrades, MY_TRADES);

  useEffect(() => {
    const update = () => {
      const connection = readWalletConnection();
      setWallet(connection);
      setMyPeerId(connection ? peerIdForAddress(connection.address) : null);
    };
    update();
    window.addEventListener(WALLET_CHANGED_EVENT, update);
    return () => window.removeEventListener(WALLET_CHANGED_EVENT, update);
  }, []);

  /**
   * This wallet's own copy of this one trade, once it has asked for it.
   *
   * `null` covers three different situations and the UI keeps them apart: not
   * asked yet, asked and this wallet is not a party, and asked and the node
   * refused.
   */
  const trade =
    mine?.find((t) => t.reservation.id === publicTrade.reservation.id) ?? null;

  /**
   * Re-read the node rather than patching local state from what was just
   * sent: the node is the authority on where the trade got to, and a client
   * that advanced its own copy would show a state the network may have
   * refused.
   *
   * The gated read is dropped and immediately taken again, because it is what
   * carries the settlement whose state just moved. That costs a second wallet
   * prompt for every action, which is a real cost and the honest one — the
   * alternative is showing the state this app *asked* for rather than the one
   * the network recorded.
   */
  const refresh = useCallback(() => {
    forgetMine();
    readMine();
    router.refresh();
  }, [router, forgetMine, readMine]);

  const reservation = trade?.reservation ?? publicTrade.reservation;
  const settlement = trade?.settlement ?? publicTrade.settlement;
  const status = deriveStatus({ reservation, settlement });
  const statusLabel = TRADE_STATUS_LABEL[status];
  const terminal = TERMINAL.has(statusLabel);
  const escrowLocked = reservation.state === "EscrowLocked";

  const amount =
    reservation.amount.base_units / 10 ** reservation.amount.decimals;
  const amountLabel = ad
    ? formatCrypto(amount, assetLabel(ad))
    : String(amount);

  const parties = trade?.settlement ?? null;
  const iAmRequester = trade !== null && myPeerId !== null
    ? trade.reservation.requester === myPeerId
    : false;
  const iAmBuyer = myPeerId !== null && parties !== null && parties.buyer === myPeerId;
  const iAmSeller = myPeerId !== null && parties !== null && parties.seller === myPeerId;

  // Best-effort only: a settlement's own buyer/seller is authoritative; before
  // one exists, the advertisement's direction is the next best signal, and
  // failing that this just picks a side for the stepper's copy to read.
  const buy = parties ? iAmBuyer : ad ? ad.direction === "Sell" : true;

  const label = (peer: string, meFlag: boolean) => (
    <PeerIdentity peer={peer} isYou={meFlag} />
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
      <div className="space-y-6">
        <div className="rounded-md border border-white/10 px-5 py-5">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <p className="text-xs text-gray-500">Status</p>
              <p className="mt-0.5 text-lg font-semibold text-white">
                {statusLabel}
              </p>
            </div>
            <div className="ml-auto">
              <StatusPill status={statusLabel} />
            </div>
          </div>

          {escrowLocked ? (
            <>
              <ReservationSteps />
              <SettlementSteps
                status={settlement ? statusLabel : "Escrow Locked"}
                counterpartyName={
                  parties
                    ? shortPeerId(iAmBuyer ? parties.seller : parties.buyer)
                    : "the merchant"
                }
                buy={buy}
                terminal={terminal}
              />
            </>
          ) : (
            <p className="mt-4 border-t border-white/5 pt-4 text-sm text-gray-400">
              This reservation ended as{" "}
              <span className="font-medium text-gray-200">
                {reservation.state}
              </span>{" "}
              before escrow ever locked — no settlement exists for it.
            </p>
          )}
        </div>

        {trade ? (
          <TradeActions
            trade={trade}
            ad={ad}
            side={tradeSide(trade, myPeerId)}
            wallet={wallet}
            onChanged={refresh}
          />
        ) : (
          <PartyView
            status={mineStatus}
            error={mineError}
            asked={mine !== null}
            onRead={readMine}
          />
        )}

        {status === "Disputed" && (
          <Link
            href="/disputes"
            className="inline-block rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
          >
            View disputes →
          </Link>
        )}

        <Panel title="Reservation">
          <div className="divide-y divide-white/5 px-4">
            <Row label="Reservation ID" value={reservation.id} mono />
            <Row
              label="Advertisement"
              value={reservation.advertisement_id}
              mono
              copy={reservation.advertisement_id}
            />
            {trade ? (
              <Row
                label="Requester"
                value={label(trade.reservation.requester, iAmRequester)}
              />
            ) : (
              <Row
                label="Requester"
                value={
                  <span className="text-gray-500">
                    Not named in the public record
                  </span>
                }
              />
            )}
            <Row label="Amount" value={amountLabel} />
            <Row label="State" value={reservation.state} />
            <Row
              label="Requested"
              value={formatDateMs(reservation.requested_at)}
            />
            <Row label="Updated" value={formatDateMs(reservation.updated_at)} />
            <Row label="Expires" value={formatDateMs(reservation.expires_at)} />
          </div>
        </Panel>

        {settlement && (
          <Panel title="Settlement">
            <div className="divide-y divide-white/5 px-4">
              <Row label="Settlement ID" value={settlement.id} mono />
              {parties && (
                <>
                  <Row label="Buyer" value={label(parties.buyer, iAmBuyer)} />
                  <Row label="Seller" value={label(parties.seller, iAmSeller)} />
                </>
              )}
              <Row label="State" value={settlement.state} />
              {parties?.payment_reference && (
                <Row
                  label="Payment reference"
                  value={parties.payment_reference}
                />
              )}
              {settlement.payment_submitted_at !== null && (
                <Row
                  label="Payment submitted"
                  value={formatDateMs(settlement.payment_submitted_at)}
                />
              )}
              {settlement.merchant_responded_at !== null && (
                <Row
                  label="Merchant responded"
                  value={formatDateMs(settlement.merchant_responded_at)}
                />
              )}
              {settlement.payment_discrepancy && (
                <Row
                  label="Discrepancy"
                  value={settlement.payment_discrepancy}
                />
              )}
              <Row
                label="Created"
                value={formatDateMs(settlement.created_at)}
              />
              <Row
                label="Updated"
                value={formatDateMs(settlement.updated_at)}
              />
              <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
                <span className="shrink-0 text-gray-500">
                  Escrow release tx
                </span>
                {settlement.escrow_release_signature ? (
                  <span className="flex min-w-0 items-center gap-2 text-right text-gray-200">
                    <span className="truncate font-mono text-xs">
                      {shortSig(settlement.escrow_release_signature)}
                    </span>
                    <CopyButton value={settlement.escrow_release_signature} />
                  </span>
                ) : (
                  <span className="text-xs text-gray-500">
                    Not yet confirmed on-chain
                  </span>
                )}
              </div>
            </div>
          </Panel>
        )}
      </div>

      <div className="space-y-6">
        {settlement && (
          <Panel title="Your review">
            <ReviewForm
              settlementId={settlement.id}
              counterparty={parties ? (iAmBuyer ? parties.seller : parties.buyer) : null}
              myPeerId={myPeerId}
              wallet={wallet}
              // `Approved` and `Completed` both count — see
              // `openfiat_reviews::is_settled` on why gating on `Completed`
              // alone would make the same review visible on some nodes and
              // invisible on others.
              settled={settlement.state === "Approved" || settlement.state === "Completed"}
              // Three-valued on purpose. `null` is "this wallet has not
              // proved which trades are its own yet", which is a different
              // answer from "the node answered and this is not one of them"
              // — and only the second is grounds for saying there is nothing
              // here to review.
              isParty={mine === null ? null : trade !== null}
            />
          </Panel>
        )}

        {parties && (
          <Panel title="Trade channel">
            <TradeChannelPanel
              settlement={parties}
              adMethods={ad?.paymentMethods ?? []}
              wallet={wallet}
              myPeerId={myPeerId}
            />
          </Panel>
        )}

        <Panel title="Attachments">
          <div className="px-4 py-4">
            <TradeAttachments settlementId={settlement?.id ?? null} />
          </div>
        </Panel>

        {ad && (
          <Panel title="Advertisement">
            <div className="divide-y divide-white/5 px-4">
              <Row
                label="Pair"
                value={`${assetLabel(ad)}/${ad.fiatCurrency}`}
              />
              <Row label="Merchant direction" value={ad.direction} />
              <Row
                label="Price"
                value={
                  ad.price === null
                    ? unpriceableLabel(ad.unpriceableReason ?? "NoOracleData")
                    : `${ad.price} ${ad.fiatCurrency}`
                }
              />
              <Row
                label="Payment methods"
                value={ad.paymentMethodLabels.join(", ") || "—"}
              />
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  copy,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  copy?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <span className="shrink-0 text-gray-500">{label}</span>
      <span className="flex min-w-0 items-center gap-2 text-right text-gray-200">
        <span className={`truncate ${mono ? "font-mono text-xs" : ""}`}>
          {value}
        </span>
        {copy && <CopyButton value={copy} />}
      </span>
    </div>
  );
}

/**
 * The stand-in for the action panel, before this wallet has proved who it is.
 *
 * Four states, kept apart on purpose. "Nobody is connected", "connected and
 * you have not asked", "asked and the node refused", and "asked, answered,
 * and this wallet is not a party to this trade" are four different things,
 * and collapsing the last two would tell a party their own trade is somebody
 * else's the first time a node is briefly unreachable.
 */
function PartyView({
  status,
  error,
  asked,
  onRead,
}: {
  status: SignedReadStatus;
  error: string | null;
  asked: boolean;
  onRead: () => void;
}) {
  if (status === "no-wallet") {
    return (
      <div className="rounded-md border border-white/10 px-5 py-5">
        <p className="text-sm text-gray-300">
          Connect the wallet that is party to this trade to act on it.
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-gray-500">
          What is above is the public record — amounts, states and timing, with
          neither party named. Who is in a trade is readable only by the people
          in it.
        </p>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="rounded-md border border-red-500/30 bg-red-500/[0.04] px-5 py-5">
        <p className="text-sm font-medium text-red-300">
          Could not read your copy of this trade
        </p>
        <p className="mt-1 text-xs text-red-400/80">{error}</p>
        <button
          type="button"
          onClick={onRead}
          className="mt-3 rounded-md border border-white/15 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-white/5"
        >
          Try again
        </button>
      </div>
    );
  }

  if (asked) {
    return (
      <div className="rounded-md border border-white/10 px-5 py-5">
        <p className="text-sm text-gray-300">
          The node answered, and this wallet is not a party to this trade.
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-gray-500">
          That is a different answer from &ldquo;could not ask&rdquo;: the read
          succeeded and returned your trades, and this is not one of them.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-white/10 px-5 py-5">
      <p className="text-sm text-gray-300">
        Sign once to load your own copy of this trade, and act on it.
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-gray-500">
        The public record above names nobody. Which side you are on, what you
        can sign, and the trade channel all need the unredacted record, which
        the node hands only to a party who proves the wallet.
      </p>
      <button
        type="button"
        onClick={onRead}
        disabled={status === "loading"}
        className="mt-3 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
      >
        {status === "loading" ? "Waiting for your wallet…" : "Load my copy of this trade"}
      </button>
    </div>
  );
}
