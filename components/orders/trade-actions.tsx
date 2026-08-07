"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { PublicKey } from "@solana/web3.js";

import { getConnection } from "@/lib/onchain-config";
import { addressForPeerId } from "@/lib/peer-id";
import { formatBaseUnits } from "@/lib/live-vaults";
import type { LiveAd } from "@/lib/live-advertisements";
import type { Trade } from "@/lib/live-trades";
import type { DecodedTradeEscrow } from "@/lib/onchain-decode";
import {
  tradeSituation,
  type TradeAction,
  type TradeActionKind,
  type TradeSide,
} from "@/lib/trade-actions";
import { escrowIdFor } from "@/lib/trade-flow";
import {
  buildTransaction,
  cancelInstructions,
  fetchFeeConfig,
  fetchTradeEscrow,
  lockEscrowInstructions,
  releaseInstructions,
  relayRelease,
  tokenProgramForMint,
  type EscrowParties,
} from "@/lib/trade-escrow";
import { explainTradeRefusal } from "@/lib/trade-refusal";
import {
  approveSettlement,
  cancelReservation,
  cancelSettlement,
  initiateSettlement,
  openDispute,
  rejectSettlement,
  reversePayment,
  submitPayment,
  tradeIdentity,
  type PaymentDiscrepancy,
} from "@/lib/trade-flow";
import { escrow as escrowProgram } from "@/lib/onchain-config";
import {
  currentSigner,
  type SolanaProvider,
  type WalletConnection,
} from "@/lib/wallet-connection";

/**
 * Every action a party can take on a trade, and what they are waiting on
 * when they cannot take one.
 *
 * The rules live in `lib/trade-actions.ts` as a pure function, so what is
 * here is only the doing: collecting the one piece of input an action needs,
 * putting up the wallet prompts in the right order, and reporting what
 * happened without overstating it.
 *
 * # Nothing here reports an on-chain step as confirmed
 *
 * A signature coming back from a wallet means the transaction was accepted
 * for submission. The trade room's own record of "has it landed" stays the
 * node's `escrow_release_signature`, which is set only when a node has
 * independently observed the confirmation — see `lib/trade-escrow.ts` on why
 * the release is relayed through the node rather than broadcast. So a
 * successful release here says the node has it, and the panel above keeps
 * saying "not yet confirmed on-chain" until the node's own answer changes.
 */

type Phase = { kind: "idle" } | { kind: "busy"; what: string } | { kind: "note"; text: string; bad: boolean };

/**
 * `PaymentDiscrepancy`'s variants, in wire order. The words a merchant reads
 * are copy, resolved from the `tradeActions` catalogue by variant; these are
 * OFS-2300 §14's own categories and are what reputation counts. `Other` is
 * last and stays last — it is the one value that records no fault against the
 * buyer, so it must not read as the safe default.
 */
const DISCREPANCIES: PaymentDiscrepancy[] = [
  "IncorrectAmount",
  "WrongReference",
  "DuplicatePayment",
  "IncorrectAccount",
  "Other",
];

export function TradeActions({
  trade,
  ad,
  side,
  wallet,
  onChanged,
}: {
  trade: Trade;
  ad: LiveAd | null;
  side: TradeSide;
  wallet: WalletConnection | null;
  /** Called after anything lands, so the page re-reads the node rather than
   *  guessing at the new state from what it just sent. */
  onChanged: () => void;
}) {
  const t = useTranslations("tradeActions");
  const R = useTranslations("refusals");
  const [escrow, setEscrow] = useState<DecodedTradeEscrow | null | undefined>(undefined);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [rejection, setRejection] = useState("");
  const [discrepancy, setDiscrepancy] = useState<PaymentDiscrepancy>("IncorrectAmount");
  const [open, setOpen] = useState<TradeActionKind | null>(null);

  const escrowId = escrowIdFor(trade.reservation.id);

  const readEscrow = useCallback(() => {
    if (escrowId === null) {
      // Not "no escrow" — there is no address to look one up at, which is a
      // different thing and the UI says so below.
      setEscrow(null);
      return;
    }
    fetchTradeEscrow(escrowId)
      .then(setEscrow)
      .catch(() => setEscrow(undefined));
  }, [escrowId]);

  useEffect(readEscrow, [readEscrow]);

  const { actions, waitingOn } = tradeSituation({ trade, side, escrow });

  /**
   * `kind` is carried through only so a refusal can be explained in terms
   * of the button that was pressed. `INVALID_SETTLEMENT_STATE` is one code
   * for every illegal transition, so "too late to cancel" and "the merchant
   * has already answered your declaration" arrive identically and are only
   * separable by knowing which was attempted.
   */
  const run = useCallback(
    async (
      kind: TradeActionKind,
      what: string,
      work: (provider: SolanaProvider, address: string) => Promise<string>,
    ) => {
      const provider = currentSigner(wallet);
      if (!wallet || !provider) {
        setPhase({
          kind: "note",
          text: t("cannotSign"),
          bad: true,
        });
        return;
      }
      setPhase({ kind: "busy", what });
      try {
        const text = await work(provider, wallet.address);
        setPhase({ kind: "note", text, bad: false });
        setOpen(null);
        readEscrow();
        onChanged();
      } catch (err) {
        setPhase({
          kind: "note",
          text: explainTradeRefusal(R, err, kind),
          bad: true,
        });
      }
    },
    [wallet, onChanged, readEscrow, t, R],
  );

  /** The four fixed facts every on-chain step needs, read rather than assumed. */
  const partiesFor = useCallback(
    async (merchantAddress: string, buyerAddress: string): Promise<EscrowParties> => {
      if (escrowId === null) {
        throw new Error(t("errNotNumericId"));
      }
      if (!ad) {
        throw new Error(t("errNoAdMint"));
      }
      const mint = new PublicKey(ad.assetMint);
      return {
        reservationId: escrowId,
        mint,
        // From the mint account's own owner. wSOL and the devnet stablecoins
        // are not all under the same token program, and a hardcoded id
        // produces a transaction the runtime rejects before the escrow
        // program is ever entered.
        tokenProgram: await tokenProgramForMint(mint),
        merchant: new PublicKey(merchantAddress),
        buyer: new PublicKey(buyerAddress),
        amount: BigInt(trade.reservation.amount.base_units),
      };
    },
    [escrowId, trade.reservation.amount, ad, t],
  );

  const handlers: Record<TradeActionKind, () => void> = {
    initiate: () =>
      void run("initiate", t("busyInitiate"), async (provider, address) => {
        if (!ad) {
          throw new Error(t("errNoAdMerchantKey"));
        }
        await initiateSettlement(tradeIdentity(provider, address), {
          settlementId: crypto.randomUUID(),
          reservationId: trade.reservation.id,
          seller: ad.merchantPeerId,
          sellerPublicKey: ad.merchantPublicKey,
          amount: trade.reservation.amount,
        });
        return t("okInitiate");
      }),

    "lock-escrow": () =>
      void run("lock-escrow", t("busyLock"), async (provider, address) => {
        const settlement = trade.settlement;
        if (!settlement) throw new Error(t("errNoSettlementLock"));
        const buyerAddress = addressForPeerId(settlement.buyer);
        if (!buyerAddress) {
          throw new Error(t("errBuyerNoAddress"));
        }
        const parties = await partiesFor(address, buyerAddress);
        const fees = await fetchFeeConfig();
        const { transaction, blockhash, lastValidBlockHeight } = await buildTransaction(
          parties.merchant,
          lockEscrowInstructions(parties, fees.timeoutSecs),
        );
        const { signature } = await provider.signAndSendTransaction(transaction);
        await getConnection().confirmTransaction(
          { signature, blockhash, lastValidBlockHeight },
          "confirmed",
        );
        return t("okLock", { signature });
      }),

    "declare-paid": () =>
      void run("declare-paid", t("busyDeclare"), async (provider, address) => {
        const settlement = trade.settlement;
        if (!settlement) throw new Error(t("errNoSettlementDeclare"));
        await submitPayment(
          tradeIdentity(provider, address),
          settlement.id,
          reference.trim() === "" ? null : reference.trim(),
        );
        return t("okDeclare");
      }),

    approve: () =>
      void run("approve", t("busyApprove"), async (provider, address) => {
        const settlement = trade.settlement;
        if (!settlement) throw new Error(t("errNoSettlementApprove"));
        // The node first: it is the record every party reads, and an
        // on-chain approval with no protocol record behind it is a state
        // nothing in the app can explain.
        await approveSettlement(tradeIdentity(provider, address), settlement.id);
        const buyerAddress = addressForPeerId(settlement.buyer);
        if (!buyerAddress) {
          return t("okApproveNodeOnly");
        }
        const parties = await partiesFor(address, buyerAddress);
        const { transaction, blockhash, lastValidBlockHeight } = await buildTransaction(
          parties.merchant,
          [escrowProgram.approveSettlementIx(parties.merchant, parties.reservationId)],
        );
        const { signature } = await provider.signAndSendTransaction(transaction);
        await getConnection().confirmTransaction(
          { signature, blockhash, lastValidBlockHeight },
          "confirmed",
        );
        return t("okApprove", { signature });
      }),

    release: () =>
      void run("release", t("busyRelease"), async (provider, address) => {
        const settlement = trade.settlement;
        if (!settlement) throw new Error(t("errNoSettlementRelease"));
        if (!provider.signTransaction) {
          throw new Error(t("errWalletBroadcasts"));
        }
        const merchantAddress = addressForPeerId(settlement.seller);
        const buyerAddress = addressForPeerId(settlement.buyer);
        if (!merchantAddress || !buyerAddress) {
          throw new Error(t("errPartyNoAddressRelease"));
        }
        const parties = await partiesFor(merchantAddress, buyerAddress);
        const fees = await fetchFeeConfig();
        const payer = new PublicKey(address);
        const plan = releaseInstructions(parties, fees, payer);
        const { transaction } = await buildTransaction(payer, plan.instructions);
        const signed = await provider.signTransaction(transaction);
        await relayRelease(signed, settlement.id);
        return plan.unwrapping ? t("okReleaseUnwrap") : t("okRelease");
      }),

    "cancel-escrow": () =>
      void run("cancel-escrow", t("busyCancelEscrow"), async (provider, address) => {
        const settlement = trade.settlement;
        if (!settlement) throw new Error(t("errNoEscrowCancel"));
        const merchantAddress = addressForPeerId(settlement.seller);
        const buyerAddress = addressForPeerId(settlement.buyer);
        if (!merchantAddress || !buyerAddress) {
          throw new Error(t("errPartyNoAddressCancel"));
        }
        const parties = await partiesFor(merchantAddress, buyerAddress);
        const signer = new PublicKey(address);
        const { transaction, blockhash, lastValidBlockHeight } = await buildTransaction(
          signer,
          cancelInstructions(signer, parties),
        );
        const { signature } = await provider.signAndSendTransaction(transaction);
        await getConnection().confirmTransaction(
          { signature, blockhash, lastValidBlockHeight },
          "confirmed",
        );
        return t("okCancelEscrow", { signature });
      }),

    "cancel-reservation": () =>
      void run("cancel-reservation", t("busyCancelReservation"), async (provider, address) => {
        await cancelReservation(tradeIdentity(provider, address), trade.reservation.id);
        return t("okCancelReservation");
      }),

    "cancel-settlement": () =>
      void run("cancel-settlement", t("busyCancelSettlement"), async (provider, address) => {
        const settlement = trade.settlement;
        if (!settlement) throw new Error(t("errNoSettlementCancel"));
        await cancelSettlement(tradeIdentity(provider, address), settlement.id);
        return t("okCancelSettlement");
      }),

    "reverse-payment": () =>
      void run("reverse-payment", t("busyReverse"), async (provider, address) => {
        const settlement = trade.settlement;
        if (!settlement) throw new Error(t("errNoDeclaration"));
        await reversePayment(tradeIdentity(provider, address), settlement.id);
        return t("okReverse");
      }),

    "reject-payment": () =>
      void run("reject-payment", t("busyReject"), async (provider, address) => {
        const settlement = trade.settlement;
        if (!settlement) throw new Error(t("errNoSettlementReject"));
        if (rejection.trim() === "") {
          throw new Error(t("errRejectEmpty"));
        }
        await rejectSettlement(
          tradeIdentity(provider, address),
          settlement.id,
          rejection.trim(),
          discrepancy,
        );
        return t("okReject");
      }),

    dispute: () =>
      void run("dispute", t("busyDispute"), async (provider, address) => {
        const settlement = trade.settlement;
        if (!settlement) throw new Error(t("errNoSettlementDispute"));
        if (reason.trim() === "") throw new Error(t("errDisputeEmpty"));
        const id = await openDispute(tradeIdentity(provider, address), settlement.id, reason.trim());
        return t("okDispute", { id });
      }),
  };

  const needsInput: Partial<Record<TradeActionKind, React.ReactNode>> = {
    "declare-paid": (
      <label className="block">
        <span className="block text-xs text-gray-500">
          {t("referenceLabel")}
        </span>
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder={t("referencePlaceholder")}
          className="mt-1 w-full rounded-md border border-white/10 bg-[#0a0e14]/70 px-3 py-2 text-sm text-white outline-none focus:border-brand/50"
        />
        <span className="mt-1 block text-xs text-gray-500">
          {t("referenceHelp")}
        </span>
      </label>
    ),
    dispute: (
      <label className="block">
        <span className="block text-xs text-gray-500">{t("disputeLabel")}</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-md border border-white/10 bg-[#0a0e14]/70 px-3 py-2 text-sm text-white outline-none focus:border-brand/50"
        />
      </label>
    ),
    "reject-payment": (
      <div className="space-y-3">
        <label className="block">
          <span className="block text-xs text-gray-500">{t("rejectWhatWrong")}</span>
          <select
            value={discrepancy}
            onChange={(e) => setDiscrepancy(e.target.value as PaymentDiscrepancy)}
            className="mt-1 w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm text-white outline-none focus:border-brand/50 [&>option]:bg-[#10151d]"
          >
            {DISCREPANCIES.map((value) => (
              <option key={value} value={value}>
                {t(`discrepancy.${value}`)}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs leading-relaxed text-gray-500">
            {t("rejectDiscrepancyHelp")}
          </span>
        </label>
        <label className="block">
          <span className="block text-xs text-gray-500">{t("rejectOwnWords")}</span>
          <textarea
            value={rejection}
            onChange={(e) => setRejection(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-md border border-white/10 bg-[#0a0e14]/70 px-3 py-2 text-sm text-white outline-none focus:border-brand/50"
          />
          <span className="mt-1 block text-xs leading-relaxed text-gray-500">
            {t("rejectOwnWordsHelp")}
          </span>
        </label>
      </div>
    ),
    "reverse-payment": (
      <p className="text-xs leading-relaxed text-amber-300">
        {t.rich("reverseWarning", { b: (chunks) => <span className="font-semibold">{chunks}</span> })}
      </p>
    ),
    "cancel-settlement": (
      <p className="text-xs leading-relaxed text-amber-300">
        {t("cancelSettlementWarning")}
      </p>
    ),
    "cancel-reservation": (
      <p className="text-xs leading-relaxed text-gray-500">
        {t("cancelReservationNote")}
      </p>
    ),
  };

  return (
    <div className="rounded-md border border-white/10 px-5 py-5">
      <h2 className="text-sm font-semibold text-gray-200">{t("heading")}</h2>

      {escrowId === null && (
        <p className="mt-3 text-xs leading-relaxed text-amber-300">
          {t.rich("notNumericIdNote", {
            code: (chunks) => <code className="font-mono">{chunks}</code>,
          })}
        </p>
      )}

      {escrow !== undefined && escrow !== null && (
        <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
          <EscrowFact label={t("factOnchainEscrow")} value={t(`vaultState.${escrow.state}`)} />
          <EscrowFact
            label={t("factHeld")}
            value={`${formatBaseUnits(escrow.amount, trade.reservation.amount.decimals)}`}
          />
          <EscrowFact label={t("factApproved")} value={escrow.approved ? t("yes") : t("notYet")} />
          <EscrowFact
            label={t("factEscrowAccount")}
            value={escrowProgram.tradeEscrowPda(escrow.reservationId)[0].toBase58()}
            mono
          />
        </dl>
      )}
      {escrow === undefined && escrowId !== null && (
        <p className="mt-3 text-xs text-gray-500">
          {t("escrowReading")}
        </p>
      )}
      {escrow === null && escrowId !== null && (
        <p className="mt-3 text-xs text-gray-500">
          {t("escrowNone")}
        </p>
      )}

      {waitingOn && (
        <p className="mt-4 border-l-2 border-white/15 pl-3 text-sm leading-relaxed text-gray-400">
          {t(`waiting.${waitingOn}`)}
        </p>
      )}

      {actions.length > 0 && (
        <ul className="mt-4 space-y-3">
          {actions.map((item) => (
            <li key={item.kind}>
              <ActionRow
                action={item}
                label={t(`action.${item.kind}.label`)}
                detail={t(`action.${item.kind}.detail`)}
                onchainLabel={t("onChain")}
                onchainTitle={t("onChainTitle")}
                closeLabel={t("close")}
                detailsLabel={t("details")}
                expanded={open === item.kind}
                onToggle={() => setOpen(open === item.kind ? null : item.kind)}
                onRun={handlers[item.kind]}
                busy={phase.kind === "busy"}
                input={needsInput[item.kind]}
              />
            </li>
          ))}
        </ul>
      )}

      {phase.kind === "busy" && (
        <p className="mt-4 text-xs text-gray-400">{t("busyPrompt", { what: phase.what })}</p>
      )}
      {phase.kind === "note" && (
        <p
          className={`mt-4 break-words text-xs leading-relaxed ${
            phase.bad ? "text-red-300" : "text-emerald-300"
          }`}
        >
          {phase.text}
        </p>
      )}
    </div>
  );
}

function ActionRow({
  action,
  label,
  detail,
  onchainLabel,
  onchainTitle,
  closeLabel,
  detailsLabel,
  expanded,
  onToggle,
  onRun,
  busy,
  input,
}: {
  action: TradeAction;
  label: string;
  detail: string;
  onchainLabel: string;
  onchainTitle: string;
  closeLabel: string;
  detailsLabel: string;
  expanded: boolean;
  onToggle: () => void;
  onRun: () => void;
  busy: boolean;
  input: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-white/10 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-white">{label}</span>
        {action.onchain && (
          <span
            className="rounded-sm bg-brand/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-brand"
            title={onchainTitle}
          >
            {onchainLabel}
          </span>
        )}
        <button
          type="button"
          onClick={onToggle}
          className="ml-auto text-xs text-gray-500 hover:text-gray-300"
        >
          {expanded ? closeLabel : detailsLabel}
        </button>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-gray-500">{detail}</p>
      {expanded && input && <div className="mt-3">{input}</div>}
      <button
        type="button"
        onClick={() => (input && !expanded ? onToggle() : onRun())}
        disabled={busy}
        className={`mt-3 w-full rounded-md py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${
          action.destructive
            ? "border border-red-400/40 text-red-200 hover:bg-red-500/10 disabled:opacity-40"
            : "bg-brand text-white hover:bg-brand-hover disabled:bg-brand/40"
        }`}
      >
        {input && !expanded ? `${label}…` : label}
      </button>
    </div>
  );
}

function EscrowFact({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3 border-t border-white/5 pt-1.5">
      <dt className="text-gray-500">{label}</dt>
      <dd className={`min-w-0 truncate text-right text-gray-200 ${mono ? "font-mono" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
