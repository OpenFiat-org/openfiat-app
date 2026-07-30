"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CURRENT_USER } from "@/lib/data/merchants";
import { BAND_TEXT, COMPOSITE_NOTE, compositeScore, scoreBand } from "@/lib/reputation";
import { PublicKey } from "@solana/web3.js";
import { DEVNET_OPEN_MINT } from "@/lib/onchain-config";
import { fetchTokenBalance } from "@/lib/live-token-balances";
import { formatBaseUnits } from "@/lib/live-vaults";
import { shortAddress } from "@/lib/format";
import { MerchantAvatar } from "@/components/merchant-avatar";
import {
  injectedProvider,
  readWalletConnection,
  writeWalletConnection,
  type SolanaProvider,
  type WalletConnection as Connection,
} from "@/lib/wallet-connection";

const WALLETS: Array<{ name: string; descriptor: string; provider: () => SolanaProvider | undefined }> = [
  { name: "Phantom", descriptor: "Browser extension & mobile", provider: () => injectedProvider("phantom") },
  { name: "Solflare", descriptor: "Browser extension & mobile", provider: () => injectedProvider("solflare") },
  { name: "Backpack", descriptor: "xNFT wallet", provider: () => injectedProvider("backpack") },
  { name: "Coinbase Wallet", descriptor: "Browser extension", provider: () => injectedProvider("coinbaseSolana") },
  { name: "Ledger", descriptor: "Hardware wallet via Solana app", provider: () => undefined },
];

/**
 * Solana wallet connection. Uses the real injected provider when present;
 * otherwise simulates the connection. Persists to localStorage and restores
 * post-mount (SSR always renders "Connect Wallet" — no hydration flash).
 */
export function WalletConnect() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [openBalance, setOpenBalance] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setConnection(readWalletConnection());
  }, []);

  /* The real OPEN balance for whichever wallet is connected. Deliberately
     not cached across connections: showing the previous wallet's balance
     under a new address would be a fresh version of the bug this replaced. */
  useEffect(() => {
    if (!connection) {
      setOpenBalance(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const held = await fetchTokenBalance(new PublicKey(connection.address), new PublicKey(DEVNET_OPEN_MINT));
        if (!cancelled) setOpenBalance(held ? formatBaseUnits(held.amount, held.decimals) : "0");
      } catch {
        if (!cancelled) setOpenBalance(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection]);

  // Close the wallet dropdown on outside pointer-down.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  async function connect(wallet: (typeof WALLETS)[number]) {
    setConnecting(wallet.name);
    let address = CURRENT_USER.wallet;
    try {
      const provider = wallet.provider();
      if (provider) {
        const res = await provider.connect();
        address = res.publicKey.toString();
      } else {
        await new Promise((r) => setTimeout(r, 700)); // simulated connection
      }
    } catch {
      // User rejected or provider errored — fall back to the simulated account.
      await new Promise((r) => setTimeout(r, 400));
    }
    const next = { wallet: wallet.name, address };
    setConnection(next);
    setConnecting(null);
    setModalOpen(false);
    writeWalletConnection(next);
  }

  function disconnect() {
    setConnection(null);
    setMenuOpen(false);
    writeWalletConnection(null);
  }

  const myScore = compositeScore(CURRENT_USER);

  if (connection) {
    return (
      <div className="flex items-center gap-2.5">
        {/*
         * Your own reputation, on every page. The avatar alone showed the tier
         * as a ring colour, which nobody can read as a number — the figure is
         * what a counterparty judges you on, so it is stated.
         */}
        <Link
          href="/account/reputation"
          className="flex items-center gap-2 rounded-full hover:opacity-80"
          title={`Your reputation: ${myScore}/100, ${CURRENT_USER.tier} tier. ${COMPOSITE_NOTE}`}
        >
          <MerchantAvatar name={CURRENT_USER.name} tier={CURRENT_USER.tier} size="sm" />
          <span className={`hidden text-xs tabular-nums sm:inline ${BAND_TEXT[scoreBand(myScore)]}`}>
            {myScore}
          </span>
        </Link>

        {/*
         * The connected wallet's real OPEN balance, read from its token
         * account on devnet.
         *
         * It used to render `OPEN_BALANCE`, a constant, so this badge told
         * every visitor they held 12,500 OPEN. On devnet that is not merely
         * unverified — the OPEN mint's authority is permanently unset, so no
         * wallet can obtain any and the true figure is 0 for everyone.
         *
         * `null` while the read is in flight or after it failed, and the
         * badge shows a dash rather than a zero: "we could not ask" must not
         * render as "you have none".
         */}
        <Link
          href="/open"
          className="rounded-md border border-white/10 px-2.5 py-2 font-mono text-xs tabular-nums text-gray-300 transition-colors hover:border-white/25 sm:px-3"
          title={
            openBalance === null
              ? "Your OPEN balance could not be read from devnet"
              : "Your OPEN balance on devnet"
          }
        >
          {openBalance ?? "—"}
          <span className="ml-1 text-gray-500">OPEN</span>
        </Link>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="rounded-md border border-brand-teal/40 bg-brand-teal/10 px-3.5 py-2 text-sm font-medium text-brand-teal"
          >
            {shortAddress(connection.address)}
          </button>
          {menuOpen && (
            <div className="absolute right-0 z-50 mt-1 w-64 rounded-md border border-white/15 bg-[#10151d] py-1 shadow-xl">
              <p className="border-b border-white/5 px-4 py-2.5 text-xs text-gray-500">
                Connected with {connection.wallet}
                <span className="mt-0.5 block truncate font-mono text-gray-400">{connection.address}</span>
              </p>
              <Link
                href="/wallet"
                onClick={() => setMenuOpen(false)}
                className="block px-4 py-2.5 text-sm text-gray-300 hover:bg-white/[0.04]"
              >
                Open wallet
              </Link>
              <button
                onClick={disconnect}
                className="block w-full px-4 py-2.5 text-left text-sm text-red-300 hover:bg-white/[0.04]"
              >
                Disconnect
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
      >
        Connect Wallet
      </button>
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setModalOpen(false)}>
          <div
            className="w-full max-w-sm rounded-md border border-white/15 bg-[#10151d] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-white/10 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-white">Connect wallet</h2>
                <p className="mt-0.5 text-xs text-gray-500">Solana wallets. Simulated when no provider is injected.</p>
              </div>
              <button onClick={() => setModalOpen(false)} className="text-gray-500 hover:text-white" aria-label="Close">✕</button>
            </div>
            <ul className="divide-y divide-white/5">
              {WALLETS.map((w) => (
                <li key={w.name}>
                  <button
                    onClick={() => connect(w)}
                    disabled={connecting !== null}
                    className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-white/[0.04] disabled:opacity-60"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-white/5 text-sm font-bold text-gray-300">
                      {w.name.charAt(0)}
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm font-medium text-white">{w.name}</span>
                      <span className="block text-xs text-gray-500">{w.descriptor}</span>
                    </span>
                    <span className="text-xs text-gray-500">
                      {connecting === w.name ? "Connecting…" : w.provider() ? "Detected" : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
