"use client";

import { Link } from "@/i18n/navigation";
import { useCallback, useEffect, useState } from "react";
import bs58 from "bs58";
import { peerIdFromPublicKey } from "@openfiat/sdk";
import {
  WALLET_CHANGED_EVENT,
  currentSigner,
  readWalletConnection,
  type WalletConnection,
} from "@/lib/wallet-connection";
import { AdStatusControl, AdTermsDialog } from "@/components/ads/ad-controls";
import type { MerchantIdentity } from "@/lib/merchant-ads";
import { fetchAdsByMerchant, type LiveAd } from "@/lib/live-advertisements";
import { formatNumber } from "@/lib/format";
import { AssetLabel, TradeLimits } from "@/components/asset-label";
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
 *
 * # It can change things now
 *
 * The table was read-only, and the status cell said why: pausing an
 * advertisement is a signed event the node did not expose. It does, so the
 * status control and the terms editor here are real — one wallet signature
 * each, straight to the selected node. See `lib/merchant-ads.ts`.
 */
export function MerchantConsole() {
  const [wallet, setWallet] = useState<WalletConnection | null>(null);
  const [ads, setAds] = useState<LiveAd[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<LiveAd | null>(null);

  useEffect(() => {
    const update = () => setWallet(readWalletConnection());
    update();
    window.addEventListener(WALLET_CHANGED_EVENT, update);
    return () => window.removeEventListener(WALLET_CHANGED_EVENT, update);
  }, []);

  const load = useCallback(async (address: string) => {
    setError(null);
    try {
      // base58, because that is what `LiveAd.merchantPeerId` is.
      //
      // This hex-encoded the peer id and compared it against a base58
      // field, so the filter matched nothing — for every wallet, always.
      // The console had been reporting "no advertisements published" to
      // merchants who had published plenty, and the empty state is
      // indistinguishable from the true one, so nothing on screen said
      // otherwise.
      setAds(await fetchAdsByMerchant(bs58.encode(peerIdFromPublicKey(bs58.decode(address)))));
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

  /*
   * Null whenever anything needed to sign is missing — no wallet, or a
   * wallet whose provider has gone away. The controls disable themselves
   * on null rather than failing at the click, so nothing offers an action
   * it cannot carry out.
   */
  const signer = currentSigner(wallet);
  const who: MerchantIdentity | null =
    wallet && signer ? { provider: signer, publicKey: bs58.decode(wallet.address) } : null;

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
  /*
   * Counted, not summed. `availableLiquidity` is denominated in the ad's
   * own asset, so adding it across ads produced a figure that put SOL and
   * USDC in the same total — the "sum across assets" the sub-label used to
   * admit to. A number that has to apologise for itself is not a number.
   * The per-asset figures are in the table below, where they belong.
   */
  const mints = new Set(ads.map((a) => a.assetMint));

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
            label: "Tokens advertised",
            value: String(mints.size),
            sub: "liquidity is per asset — see the table",
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
          minWidth={1120}
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
              <Th right>Terms</Th>
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
              {/* In the asset, not in `fiatCurrency` — see `LiveAd.minTrade`. */}
              <Td right num className="text-gray-400">
                <TradeLimits ad={ad} />
              </Td>
              <Td right num className="text-gray-300">
                <span className="inline-flex items-baseline gap-1.5">
                  {formatNumber(ad.availableLiquidity)}
                  <AssetLabel ad={ad} />
                </span>
              </Td>
              <Td className="whitespace-nowrap text-xs text-gray-400">
                <span className="flex items-center gap-1.5" title={ad.paymentMethods.join(", ")}>
                  {ad.paymentMethodLabels[0] ?? "—"}
                  {ad.paymentMethods.length > 1 && (
                    <span className="shrink-0 rounded border border-white/10 px-1.5 py-0.5 text-[11px] text-gray-500">
                      +{ad.paymentMethods.length - 1}
                    </span>
                  )}
                </span>
              </Td>
              <Td right>
                {/*
                  * Reloaded from the node after every change rather than
                  * patched locally. The node is what other people read, and
                  * a row that shows "Paused" because this tab believes it
                  * is exactly the fiction the old simulated control was.
                  */}
                <AdStatusControl ad={ad} who={who} onDone={() => void load(wallet.address)} />
              </Td>
              <Td right>
                <button
                  type="button"
                  disabled={!who || ad.status === "Deleted"}
                  onClick={() => setEditing(ad)}
                  className="rounded border border-white/15 px-2 py-0.5 text-[11px] font-medium text-gray-300 transition-colors hover:bg-white/5 disabled:opacity-40"
                >
                  Edit terms
                </button>
              </Td>
            </Tr>
          ))}
        </DataTable>
      )}

      {editing && (
        <AdTermsDialog
          ad={editing}
          who={who}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load(wallet.address);
          }}
        />
      )}
    </div>
  );
}
