"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AddressRisk } from "@/components/explorer/address-risk";
import { TradingRecord } from "@/components/merchants/trading-record";
import { formatNumber } from "@/lib/format";
import { assetLabel, fetchAdsByMerchant, type LiveAd } from "@/lib/live-advertisements";
import { NODE_CHANGED_EVENT } from "@/lib/node-preference";
import { peerIdForAddress, shortPeerId } from "@/lib/peer-id";

/**
 * The off-chain half of an explorer address page: what the OpenFiat node
 * knows about the wallet in the URL, as opposed to what the chain does.
 *
 * # What this replaced
 *
 * The page looked the address up in `MERCHANTS` — a fixture of invented
 * wallets — and rendered a country, an identity level, a tier, a settlement
 * speed and four scored reputation dimensions for the handful that matched.
 * Every other address, meaning every real one, got "Not found in the
 * simulated index". So the explorer answered for wallets that do not exist
 * and refused to answer for wallets that do.
 *
 * # An address is a PeerId, and that is not a lookup
 *
 * A Solana address is an Ed25519 public key, and a PeerId is that same key
 * behind a fixed multicodec prefix — `lib/peer-id.ts` derives one from the
 * other with no registry in between. So an address typed into the explorer
 * can be asked about directly: the node's `getReputation` and
 * `getAdvertisements` both key on the PeerId this derives.
 */
export function AddressProtocol({ address }: { address: string }) {
  const peerId = peerIdForAddress(address);
  const [ads, setAds] = useState<LiveAd[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!peerId) return;
    let cancelled = false;

    async function load() {
      setError(false);
      try {
        const rows = await fetchAdsByMerchant(peerId!);
        if (!cancelled) setAds(rows.filter((ad) => ad.status !== "Deleted"));
      } catch {
        if (!cancelled) setError(true);
      }
    }

    void load();
    window.addEventListener(NODE_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(NODE_CHANGED_EVENT, load);
    };
  }, [peerId]);

  if (!peerId) {
    return (
      <p className="text-sm text-gray-500">
        This is not a 32-byte Ed25519 address, so it has no protocol identity
        to ask about. On-chain state above is still read for it.
      </p>
    );
  }

  return (
    <>
    <div className="grid gap-8 lg:grid-cols-[1fr_1.3fr]">
      <TradingRecord peerId={peerId} />

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Advertisements
        </h3>
        {error ? (
          <p className="mt-3 text-xs text-amber-300">
            Your access node did not answer for this wallet.
          </p>
        ) : ads === null ? (
          <p className="mt-3 text-xs text-gray-500">Reading the book…</p>
        ) : ads.length === 0 ? (
          <p className="mt-3 text-xs leading-relaxed text-gray-500">
            This wallet has published no advertisements to this node, so it is
            not a merchant here. Publishing one is the whole of what makes a
            wallet a merchant — there is no register to be absent from.
          </p>
        ) : (
          <>
            <ul className="mt-3 space-y-2">
              {ads.map((ad) => (
                <li
                  key={ad.id}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md border border-white/10 px-3 py-2 text-xs"
                >
                  <span className={ad.direction === "Sell" ? "text-emerald-400" : "text-orange-400"}>
                    {ad.direction}
                  </span>
                  <span className="text-gray-300">
                    {assetLabel(ad)}/{ad.fiatCurrency}
                  </span>
                  <span className="font-mono tabular-nums text-gray-200">
                    {ad.price === null ? "Unpriced" : `${formatNumber(ad.price)} ${ad.fiatCurrency}`}
                  </span>
                  <span className="ml-auto text-gray-500">{ad.status}</span>
                </li>
              ))}
            </ul>
            <Link
              href={`/merchants/${peerId}`}
              className="mt-3 inline-block text-xs text-brand hover:text-brand-hover"
            >
              Full merchant profile for {shortPeerId(peerId)} →
            </Link>
          </>
        )}
      </div>
    </div>

    {/*
      * Below the trading record rather than beside it, and deliberately not
      * folded into it. A reputation figure is derived from this wallet's own
      * completed trades; a risk record is something a third party asserted
      * about it. Presenting them as two halves of one score would let an
      * accusation and a track record be read as the same kind of fact.
      */}
    <div className="mt-8">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
        Risk intelligence
      </h3>
      <div className="mt-3">
        <AddressRisk peerId={peerId} />
      </div>
    </div>
    </>
  );
}
