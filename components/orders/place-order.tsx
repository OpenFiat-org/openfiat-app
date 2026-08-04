"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";

import { assetLabel, type LiveAd } from "@/lib/live-advertisements";
import { formatCrypto } from "@/lib/format";
import { toWireAmount } from "@/lib/merchant-ads";
import { releasableMint } from "@/lib/trade-escrow";
import { explainTradeRefusal } from "@/lib/trade-refusal";
import {
  initiateSettlement,
  newReservationId,
  submitReservation,
  tradeIdentity,
} from "@/lib/trade-flow";
import {
  WALLET_CHANGED_EVENT,
  currentSigner,
  readWalletConnection,
  type WalletConnection,
} from "@/lib/wallet-connection";

/**
 * The button that actually places an order.
 *
 * Two signatures, in this order, and the split is not cosmetic:
 *
 *  1. `sendReservationRequest` — the taker's claim on the merchant's
 *     liquidity, valid for the 30-minute validation window and swept by every
 *     node once it lapses.
 *  2. `sendSettlementInitiate` — the record naming both parties, which is
 *     what every later action verifies against.
 *
 * The reservation is what expires and what holds inventory, so it is signed
 * first; if the second prompt is declined the reservation still stands and
 * the trade room offers the settlement on its own. The reverse order would
 * create a settlement no reservation backs — `apply_initiate` does not check
 * for one, so nothing downstream would notice.
 *
 * # The release warning
 *
 * `release_escrow` pays the settlement fee into the four treasuries
 * `FeeConfig` names, and those are token accounts for one specific mint. A
 * trade in any other mint runs the whole way to `Approved` and then cannot be
 * released. That is checked against the chain here, before anybody signs
 * anything, because the alternative is discovering it with the merchant's
 * tokens locked.
 */
export function PlaceOrder({
  ad,
  assetAmount,
  method,
}: {
  ad: LiveAd;
  /** In the asset, which is the unit the advertisement states its limits in. */
  assetAmount: number;
  /** The rail's catalogue id, as the advertisement carries it. */
  method: string | undefined;
}) {
  const router = useRouter();
  const [wallet, setWallet] = useState<WalletConnection | null>(null);
  const [phase, setPhase] = useState<"idle" | "reserving" | "opening" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [reservationId, setReservationId] = useState<string | null>(null);
  /** `undefined` while unread, `null` when the cluster could not be asked. */
  const [releasable, setReleasable] = useState<boolean | null | undefined>(undefined);

  useEffect(() => {
    const update = () => setWallet(readWalletConnection());
    update();
    window.addEventListener(WALLET_CHANGED_EVENT, update);
    return () => window.removeEventListener(WALLET_CHANGED_EVENT, update);
  }, []);

  useEffect(() => {
    let live = true;
    releasableMint(new PublicKey(ad.assetMint))
      .then((ok) => live && setReleasable(ok))
      .catch(() => live && setReleasable(null));
    return () => {
      live = false;
    };
  }, [ad.assetMint]);

  const place = useCallback(async () => {
    const provider = currentSigner(wallet);
    if (!wallet || !provider) {
      setPhase("error");
      setMessage("Connect a wallet that can sign messages before placing an order.");
      return;
    }
    if (ad.priceAmount === null) {
      setPhase("error");
      setMessage("This advertisement has no price right now, so there is nothing to agree to.");
      return;
    }

    const who = tradeIdentity(provider, wallet.address);
    // Chosen here rather than by the node, because it is inside the bytes the
    // taker signs — and it doubles as the on-chain escrow's PDA seed.
    const id = newReservationId();

    setPhase("reserving");
    setMessage(null);
    try {
      await submitReservation(who, {
        reservationId: id,
        advertisementId: ad.id,
        amount: toWireAmount(assetAmount, ad.assetDecimals),
        // Verbatim from the node's own quote. Recomputing it from the
        // displayed price would round-trip through a float and be refused as
        // a price the advertisement's terms do not produce.
        agreedPrice: ad.priceAmount,
        agreedMid: ad.midRate,
      });
      setReservationId(id);
    } catch (err) {
      setPhase("error");
      // The whole error, not its message: which advertisement failure this
      // is — price moved, liquidity gone, amount out of limits — is in the
      // node's `error.data` and nowhere else.
      setMessage(explainTradeRefusal(err, "reserve"));
      return;
    }

    setPhase("opening");
    try {
      await initiateSettlement(who, {
        settlementId: crypto.randomUUID(),
        reservationId: id,
        seller: ad.merchantPeerId,
        sellerPublicKey: ad.merchantPublicKey,
        amount: toWireAmount(assetAmount, ad.assetDecimals),
      });
    } catch (err) {
      // The reservation is real and is holding the merchant's liquidity, so
      // this is not a failure to place the order — it is one step short, and
      // the trade room can finish it.
      setPhase("error");
      setMessage(
        `Your reservation was accepted, but opening the settlement failed: ${explainTradeRefusal(
          err,
          "initiate",
        )} You can finish it from the trade room.`,
      );
      return;
    }

    setPhase("done");
    router.push(`/orders/${id}`);
  }, [ad, assetAmount, wallet, router]);

  const ready = wallet !== null && assetAmount > 0 && ad.status === "Active" && ad.price !== null;
  const busy = phase === "reserving" || phase === "opening";

  return (
    <div className="py-4">
      {releasable === false && (
        <p className="mb-4 border-l-2 border-amber-400/60 bg-amber-400/5 px-3 py-2 text-xs leading-relaxed text-amber-200">
          This advertisement settles in a mint the escrow program&apos;s fee treasuries do not
          hold. A trade in it can be reserved, funded and approved, and then{" "}
          <span className="font-medium">cannot be released</span>: the release pays the settlement
          fee into token accounts for a different mint and the runtime rejects it. The tokens are
          not lost — either party can return them to the merchant&apos;s vault — but the trade
          cannot complete on this deployment.
        </p>
      )}
      {releasable === null && (
        <p className="mb-4 text-xs text-gray-500">
          Could not read the escrow program&apos;s fee configuration, so whether this mint can be
          released is unknown — not a claim that it cannot.
        </p>
      )}

      <button
        type="button"
        onClick={() => void place()}
        disabled={!ready || busy}
        className="w-full rounded-md bg-emerald-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-600/35 disabled:text-white/70"
      >
        {phase === "reserving"
          ? "Signing the reservation…"
          : phase === "opening"
            ? "Opening the settlement…"
            : phase === "done"
              ? "Placed"
              : `Place this order for ${formatCrypto(assetAmount, assetLabel(ad), 6)}`}
      </button>

      {!wallet && (
        <p className="mt-2 text-xs text-amber-300">
          Connect a wallet first — a reservation is a signed claim on this merchant&apos;s
          liquidity, and only your wallet can make it.
        </p>
      )}
      {wallet && ready && phase === "idle" && (
        <p className="mt-2 text-xs leading-relaxed text-gray-500">
          Two wallet prompts: the reservation, then the settlement. The reservation lapses 30
          minutes after you sign it if the trade has not moved.
          {method !== undefined && (
            <>
              {" "}
              A <code className="font-mono">ReservationRequest</code> carries no payment method,
              so the rail you picked is not recorded by this signature — the merchant sends the
              account to pay into through the trade channel once the settlement is open.
            </>
          )}
        </p>
      )}
      {message && (
        <p
          className={`mt-3 text-xs leading-relaxed ${
            reservationId ? "text-amber-300" : "text-red-300"
          }`}
        >
          {message}
        </p>
      )}
      {reservationId && phase === "error" && (
        <a
          href={`/orders/${reservationId}`}
          className="mt-2 inline-block text-xs text-brand hover:text-brand-hover"
        >
          Go to the trade room →
        </a>
      )}
    </div>
  );
}
