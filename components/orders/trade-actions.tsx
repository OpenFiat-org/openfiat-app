"use client";

import { useCallback, useEffect, useState } from "react";
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
import {
  approveSettlement,
  explainTradeRefusal,
  initiateSettlement,
  openDispute,
  submitPayment,
  tradeIdentity,
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
  const [escrow, setEscrow] = useState<DecodedTradeEscrow | null | undefined>(undefined);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
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

  const run = useCallback(
    async (what: string, work: (provider: SolanaProvider, address: string) => Promise<string>) => {
      const provider = currentSigner(wallet);
      if (!wallet || !provider) {
        setPhase({
          kind: "note",
          text: "This wallet connection cannot sign — reconnect it and try again.",
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
          text: explainTradeRefusal(err instanceof Error ? err.message : String(err)),
          bad: true,
        });
      }
    },
    [wallet, onChanged, readEscrow],
  );

  /** The four fixed facts every on-chain step needs, read rather than assumed. */
  const partiesFor = useCallback(
    async (merchantAddress: string, buyerAddress: string): Promise<EscrowParties> => {
      if (escrowId === null) {
        throw new Error(
          "This reservation's id is not a number, so it addresses no escrow account. Reservations placed by this app are; one from another client may not be.",
        );
      }
      if (!ad) {
        throw new Error(
          "This trade's advertisement could not be read, and it is the only record of which mint the escrow settles in. Nothing on chain can be built without it.",
        );
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
    [escrowId, trade.reservation.amount, ad],
  );

  const handlers: Record<TradeActionKind, () => void> = {
    initiate: () =>
      void run("Opening the settlement", async (provider, address) => {
        if (!ad) {
          throw new Error(
            "This trade's advertisement could not be read, and the settlement has to name the merchant's own public key from it.",
          );
        }
        await initiateSettlement(tradeIdentity(provider, address), {
          settlementId: crypto.randomUUID(),
          reservationId: trade.reservation.id,
          seller: ad.merchantPeerId,
          sellerPublicKey: ad.merchantPublicKey,
          amount: trade.reservation.amount,
        });
        return "The settlement is open. The merchant can now lock the tokens in escrow.";
      }),

    "lock-escrow": () =>
      void run("Locking the escrow", async (provider, address) => {
        const settlement = trade.settlement;
        if (!settlement) throw new Error("There is no settlement to lock an escrow against.");
        const buyerAddress = addressForPeerId(settlement.buyer);
        if (!buyerAddress) {
          throw new Error("The buyer's peer id carries no Solana address, so no escrow can name them.");
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
        return `Escrow funded. Transaction ${signature}.`;
      }),

    "declare-paid": () =>
      void run("Recording the payment", async (provider, address) => {
        const settlement = trade.settlement;
        if (!settlement) throw new Error("There is no settlement to declare a payment on.");
        await submitPayment(
          tradeIdentity(provider, address),
          settlement.id,
          reference.trim() === "" ? null : reference.trim(),
        );
        return "The merchant has been told the payment is on its way.";
      }),

    approve: () =>
      void run("Approving", async (provider, address) => {
        const settlement = trade.settlement;
        if (!settlement) throw new Error("There is no settlement to approve.");
        // The node first: it is the record every party reads, and an
        // on-chain approval with no protocol record behind it is a state
        // nothing in the app can explain.
        await approveSettlement(tradeIdentity(provider, address), settlement.id);
        const buyerAddress = addressForPeerId(settlement.buyer);
        if (!buyerAddress) {
          return "Approved on the node. The on-chain approval could not be built: the buyer's peer id carries no Solana address.";
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
        return `Approved, on the node and on chain. Transaction ${signature}. Either party can now release the escrow.`;
      }),

    release: () =>
      void run("Releasing", async (provider, address) => {
        const settlement = trade.settlement;
        if (!settlement) throw new Error("There is no settlement to release.");
        if (!provider.signTransaction) {
          throw new Error(
            "This wallet cannot sign a transaction without also broadcasting it. The release has to reach Solana through the node so the network records the confirmation, so it cannot be completed from this wallet.",
          );
        }
        const merchantAddress = addressForPeerId(settlement.seller);
        const buyerAddress = addressForPeerId(settlement.buyer);
        if (!merchantAddress || !buyerAddress) {
          throw new Error("A party's peer id carries no Solana address, so no release can be built.");
        }
        const parties = await partiesFor(merchantAddress, buyerAddress);
        const fees = await fetchFeeConfig();
        const payer = new PublicKey(address);
        const plan = releaseInstructions(parties, fees, payer);
        const { transaction } = await buildTransaction(payer, plan.instructions);
        const signed = await provider.signTransaction(transaction);
        await relayRelease(signed, settlement.id);
        return plan.unwrapping
          ? "The release is with the node. It will be recorded on this trade once the node has seen it confirmed for itself — the wrapped SOL is unwrapped in the same transaction, so what arrives is SOL."
          : "The release is with the node. It will be recorded on this trade once the node has seen it confirmed for itself.";
      }),

    "cancel-escrow": () =>
      void run("Returning the tokens", async (provider, address) => {
        const settlement = trade.settlement;
        if (!settlement) throw new Error("There is no escrow to cancel.");
        const merchantAddress = addressForPeerId(settlement.seller);
        const buyerAddress = addressForPeerId(settlement.buyer);
        if (!merchantAddress || !buyerAddress) {
          throw new Error("A party's peer id carries no Solana address, so no cancellation can be built.");
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
        return `The tokens are back in the merchant's vault. Transaction ${signature}. The reservation itself stays on the node until its 30-minute window lapses — no node exposes a way to cancel one.`;
      }),

    dispute: () =>
      void run("Opening the dispute", async (provider, address) => {
        const settlement = trade.settlement;
        if (!settlement) throw new Error("There is no settlement to dispute.");
        if (reason.trim() === "") throw new Error("Say what went wrong — an arbitrator reads this.");
        const id = await openDispute(tradeIdentity(provider, address), settlement.id, reason.trim());
        return `Dispute ${id} is open. Arbitrators join it from the arbitration desk.`;
      }),
  };

  const needsInput: Partial<Record<TradeActionKind, React.ReactNode>> = {
    "declare-paid": (
      <label className="block">
        <span className="block text-xs text-gray-500">
          Payment reference (optional)
        </span>
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="What your bank or wallet put on the transfer"
          className="mt-1 w-full rounded-md border border-white/10 bg-[#0a0e14]/70 px-3 py-2 text-sm text-white outline-none focus:border-brand/50"
        />
        <span className="mt-1 block text-xs text-gray-500">
          Whatever you type here is stored on the settlement and readable by the merchant and by
          any arbitrator — it is dropped from the public view for that reason, so keep it to the
          reference itself.
        </span>
      </label>
    ),
    dispute: (
      <label className="block">
        <span className="block text-xs text-gray-500">What went wrong</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-md border border-white/10 bg-[#0a0e14]/70 px-3 py-2 text-sm text-white outline-none focus:border-brand/50"
        />
      </label>
    ),
  };

  return (
    <div className="rounded-md border border-white/10 px-5 py-5">
      <h2 className="text-sm font-semibold text-gray-200">What you can do</h2>

      {escrowId === null && (
        <p className="mt-3 text-xs leading-relaxed text-amber-300">
          This reservation&apos;s id is not a number, so it addresses no escrow account on chain —
          the escrow program finds a trade escrow at a PDA seeded with the id as a{" "}
          <code className="font-mono">u64</code>. Nothing on chain can be created, read or
          released for it. Reservations placed by this app always can be.
        </p>
      )}

      {escrow !== undefined && escrow !== null && (
        <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
          <EscrowFact label="On-chain escrow" value={escrow.state} />
          <EscrowFact
            label="Held"
            value={`${formatBaseUnits(escrow.amount, trade.reservation.amount.decimals)}`}
          />
          <EscrowFact label="Merchant approved" value={escrow.approved ? "Yes" : "Not yet"} />
          <EscrowFact
            label="Escrow account"
            value={escrowProgram.tradeEscrowPda(escrow.reservationId)[0].toBase58()}
            mono
          />
        </dl>
      )}
      {escrow === undefined && escrowId !== null && (
        <p className="mt-3 text-xs text-gray-500">
          Reading the escrow from the cluster… If this does not resolve, the cluster could not be
          reached — which is not the same as there being no escrow.
        </p>
      )}
      {escrow === null && escrowId !== null && (
        <p className="mt-3 text-xs text-gray-500">
          No escrow exists on chain for this reservation yet.
        </p>
      )}

      {waitingOn && (
        <p className="mt-4 border-l-2 border-white/15 pl-3 text-sm leading-relaxed text-gray-400">
          {waitingOn}
        </p>
      )}

      {actions.length > 0 && (
        <ul className="mt-4 space-y-3">
          {actions.map((item) => (
            <li key={item.kind}>
              <ActionRow
                action={item}
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
        <p className="mt-4 text-xs text-gray-400">{phase.what}… approve the prompt in your wallet.</p>
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
  expanded,
  onToggle,
  onRun,
  busy,
  input,
}: {
  action: TradeAction;
  expanded: boolean;
  onToggle: () => void;
  onRun: () => void;
  busy: boolean;
  input: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-white/10 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-white">{action.label}</span>
        {action.onchain && (
          <span
            className="rounded-sm bg-brand/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-brand"
            title="Moves value on Solana, and costs a network fee"
          >
            On chain
          </span>
        )}
        <button
          type="button"
          onClick={onToggle}
          className="ml-auto text-xs text-gray-500 hover:text-gray-300"
        >
          {expanded ? "Close" : "Details"}
        </button>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-gray-500">{action.detail}</p>
      {expanded && input && <div className="mt-3">{input}</div>}
      <button
        type="button"
        onClick={() => (input && !expanded ? onToggle() : onRun())}
        disabled={busy}
        className="mt-3 w-full rounded-md bg-brand py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-brand/40"
      >
        {input && !expanded ? `${action.label}…` : action.label}
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
