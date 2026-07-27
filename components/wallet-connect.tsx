"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CURRENT_USER } from "@/lib/data/merchants";
import { OPEN_BALANCE, OPEN_BOND_REQUIRED } from "@/lib/data/wallet";
import { formatNumber, shortAddress } from "@/lib/format";
import { MerchantAvatar } from "@/components/merchant-avatar";

interface SolanaProvider {
  isPhantom?: boolean;
  connect(): Promise<{ publicKey: { toString(): string } }>;
}

declare global {
  interface Window {
    solana?: SolanaProvider;
    phantom?: { solana?: SolanaProvider };
    solflare?: SolanaProvider;
    backpack?: SolanaProvider;
    coinbaseSolana?: SolanaProvider;
  }
}

const WALLET_STORAGE_KEY = "openfiat:wallet";

interface Connection {
  wallet: string;
  address: string;
}

function injected(key: "solana" | "phantom" | "solflare" | "backpack" | "coinbaseSolana"): SolanaProvider | undefined {
  if (typeof window === "undefined") return undefined;
  if (key === "phantom") return window.phantom?.solana ?? window.solana;
  return window[key];
}

const WALLETS: Array<{ name: string; descriptor: string; provider: () => SolanaProvider | undefined }> = [
  { name: "Phantom", descriptor: "Browser extension & mobile", provider: () => injected("phantom") },
  { name: "Solflare", descriptor: "Browser extension & mobile", provider: () => injected("solflare") },
  { name: "Backpack", descriptor: "xNFT wallet", provider: () => injected("backpack") },
  { name: "Coinbase Wallet", descriptor: "Browser extension", provider: () => injected("coinbaseSolana") },
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
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(WALLET_STORAGE_KEY);
      if (saved) setConnection(JSON.parse(saved) as Connection);
    } catch {
      /* localStorage unavailable */
    }
  }, []);

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
    try {
      localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* localStorage unavailable */
    }
  }

  function disconnect() {
    setConnection(null);
    setMenuOpen(false);
    try {
      localStorage.removeItem(WALLET_STORAGE_KEY);
    } catch {
      /* localStorage unavailable */
    }
  }

  const shortOfBond = OPEN_BALANCE < OPEN_BOND_REQUIRED;

  if (connection) {
    return (
      <div className="flex items-center gap-2.5">
        {/* Reputation chip — compact tier-ringed avatar, always visible once connected */}
        <Link
          href="/account/reputation"
          className="flex items-center rounded-full hover:opacity-80"
          title={`Your reputation: ${CURRENT_USER.tier} tier`}
        >
          <MerchantAvatar name={CURRENT_USER.name} tier={CURRENT_USER.tier} size="sm" />
        </Link>

        {/*
         * OPEN balance — visible on every page and at every width, not just
         * from `sm` up. It is the number that decides whether you can publish
         * an advertisement at all, so hiding it on a phone hides the reason
         * the ad wizard will refuse. Amber below the merchant bond, since at
         * that point the balance is a blocker rather than a readout.
         */}
        <Link
          href="/open"
          className={`rounded-md border px-2.5 py-2 font-mono text-xs tabular-nums transition-colors sm:px-3 ${
            shortOfBond
              ? "border-amber-400/40 text-amber-200 hover:border-amber-400/70"
              : "border-white/10 text-gray-300 hover:border-white/25"
          }`}
          title={
            shortOfBond
              ? `${formatNumber(OPEN_BALANCE, 0)} OPEN — below the ${formatNumber(OPEN_BOND_REQUIRED, 0)} OPEN merchant bond. Buy more in the presale.`
              : "Your OPEN balance — buy more in the presale"
          }
        >
          {formatNumber(OPEN_BALANCE, 0)}
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
