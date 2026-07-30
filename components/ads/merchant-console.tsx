"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import bs58 from "bs58";
import { peerIdFromPublicKey } from "@openfiat/sdk";
import { WALLET_CHANGED_EVENT, readWalletConnection, type WalletConnection } from "@/lib/wallet-connection";
import { fetchAdsByMerchant, type LiveAd } from "@/lib/live-advertisements";
import { formatFiat, formatNumber } from "@/lib/format";
import { AssetLabel } from "@/components/asset-label";
import { DataTable, Td, Th, Tr } from "@/components/data-table";
import { MetricStrip } from "@/components/metrics";

/**
 * Merchant console, reading this wallet's real advertisements from a node.
 *
 * # What this replaced, and why it mattered
 *
 * It read `MY_ADS` from `lib/data/ads.ts` — a constant. Every visitor saw
 * the same advertisements, including one with no wallet connected at all,
 * and the "30d volume" metric was hardcoded with the subtitle "simulated".
 * The Online/Paused control mutated local state and its own tooltip said
 * "(simulated)".
 *
 * So the page could not fail. That is the problem: a console that shows
 * five healthy ads whether or not you have published anything, whether or
 * not you have a wallet, and whether or not the network is reachable, tells
 * you nothing about any of them.
 *
 * # A merchant is a PeerId
 *
 * The protocol identifies a merchant by PeerId, derived from their Ed25519
 * public key — which is what a Solana address is. So a connected wallet
 * maps to exactly one merchant identity with no registration step and no
 * lookup table.
 */
export function MerchantConsole() {
  const [wallet, setWallet] = useState<WalletConnection | null>(null);
  const [ads, setAds] = useState<LiveAd[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setWallet(readWalletConnection());
    update();
    window.addEventListener(WALLET_CHANGED_EVENT, update);
    return () => window.removeEventListener(WALLET_CHANGED_EVENT, update);
  }, []);

  const load = useCallback(async (address: string) => {
    setError(null);
    try {
      const peerId = peerIdFromPublicKey(bs58.decode(address));
      const hex = Array.from(peerId)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      setAds(await fetchAdsByMerchant(hex));
    } catch (err) {
      // Surfaced rather than swallowed into an empty table: "no ads" and
      // "could not reach a node" are different facts, and a merchant
      // deciding whether to re-publish needs to know which one they are
      // looking at.
      setError(err instanceof Error ? err.message : String(err));
      setAds(null);
    }
  }, []);

  useEffect(() => {
    if (wallet) void load(wallet.address);
    else setAds(null);
  }, [wallet, load]);

  if (!wallet) {
    return (
      <p className="rounded-lg border border-white/10 bg-white/[0.02] p-6 text-sm text-gray-400">
        Connect a wallet to see the advertisements published under it. Your wallet key
        <em> is </em> your merchant identity — there is no separate account to create.
      </p>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/[0.04] p-6">
        <p className="text-sm font-medium text-red-300">Could not read advertisements from the node</p>
        <p className="mt-1 font-mono text-xs text-red-400/80">{error}</p>
        <button
          onClick={() => void load(wallet.address)}
          className="mt-4 rounded-md border border-white/15 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-white/5"
        >
          Retry
        </button>
      </div>
    );
  }

  if (ads === null) {
    return <p className="p-6 text-sm text-gray-500">Reading advertisements…</p>;
  }

  const activeCount = ads.filter((a) => a.status === "Active").length;
  const totalLiquidity = ads.reduce((sum, a) => sum + a.availableLiquidity, 0);

  return (
    <div>
      {/*
        * Three metrics, not four. The fourth was a hardcoded "30d volume"
        * labelled "simulated" — real volume needs this merchant's settled
        * trades, which is `/orders`' job and is not derivable from the
        * advertisement book alone. An absent metric is better than a
        * confident wrong one.
        */}
      <MetricStrip
        items={[
          { label: "Active ads", value: String(activeCount), sub: `${ads.length} published` },
          {
            label: "Advertised liquidity",
            value: formatNumber(totalLiquidity, 0),
            sub: "sum across assets",
          },
          {
            label: "Merchant",
            value: ads[0]?.merchantShort ?? "—",
            sub: "PeerId suffix",
          },
        ]}
      />

      <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
        <h2 className="text-sm font-semibold text-white">
          Your advertisements
          <span className="ml-2 font-normal text-gray-500">{ads.length}</span>
        </h2>
        <Link
          href="/ads/new"
          className="shrink-0 whitespace-nowrap rounded-md bg-brand px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
        >
          Post advertisement
        </Link>
      </div>

      {ads.length === 0 ? (
        <p className="py-8 text-sm text-gray-500">
          This wallet has published no advertisements on the node you are connected to.
        </p>
      ) : (
        <DataTable
          minWidth={960}
          head={
            <tr>
              <Th>Ad</Th>
              <Th>Direction</Th>
              <Th>Pair</Th>
              <Th right>Price</Th>
              <Th right>Limits</Th>
              <Th right>Liquidity</Th>
              <Th>Payment methods</Th>
              <Th right>Status</Th>
            </tr>
          }
        >
          {ads.map((ad) => (
            <Tr key={ad.id}>
              <Td className="whitespace-nowrap font-mono font-medium text-gray-200">{ad.id}</Td>
              <Td
                className={`whitespace-nowrap font-medium ${
                  ad.direction === "Sell" ? "text-orange-400" : "text-emerald-400"
                }`}
              >
                {ad.direction}
              </Td>
              <Td className="text-gray-300">
                <span className="flex items-baseline gap-1">
                  <AssetLabel ad={ad} icon />
                  <span>/{ad.fiatCurrency}</span>
                </span>
              </Td>
              <Td right num>
                <span className="text-gray-200">
                  {ad.price === null ? "—" : formatNumber(ad.price)}
                </span>
                <span className="block text-[11px] text-gray-600">
                  {ad.pricingKind === "Floating"
                    ? `Floating ${(ad.premiumBps ?? 0) >= 0 ? "+" : ""}${((ad.premiumBps ?? 0) / 100).toFixed(2)}%`
                    : "Fixed"}
                </span>
              </Td>
              <Td right num className="text-gray-400">
                {formatFiat(ad.minTrade, ad.fiatCurrency, 0)} – {formatFiat(ad.maxTrade, ad.fiatCurrency, 0)}
              </Td>
              <Td right num className="text-gray-300">
                <span className="inline-flex items-baseline gap-1.5">
                  {formatNumber(ad.availableLiquidity)}
                  <AssetLabel ad={ad} />
                </span>
              </Td>
              <Td className="whitespace-nowrap text-xs text-gray-400">
                <span className="flex items-center gap-1.5" title={ad.paymentMethods.join(", ")}>
                  {ad.paymentMethods[0] ?? "—"}
                  {ad.paymentMethods.length > 1 && (
                    <span className="shrink-0 rounded border border-white/10 px-1.5 py-0.5 text-[11px] text-gray-500">
                      +{ad.paymentMethods.length - 1}
                    </span>
                  )}
                </span>
              </Td>
              {/*
                * Read-only. The old control flipped local state and admitted
                * as much in its tooltip. Pausing an advertisement for real is
                * a signed `AdvertisementUpdated` event, which the node's RPC
                * surface does not yet expose — so this shows the node's
                * status and does not pretend to change it.
                */}
              <Td right>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    ad.status === "Active"
                      ? "bg-emerald-500/10 text-emerald-300"
                      : "bg-gray-500/10 text-gray-400"
                  }`}
                >
                  {ad.status}
                </span>
              </Td>
            </Tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}
