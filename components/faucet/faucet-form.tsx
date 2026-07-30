"use client";

import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { Panel } from "@/components/panel";
import { shortSig } from "@/lib/format";
import { readWalletConnection, WALLET_CHANGED_EVENT } from "@/lib/wallet-connection";
import { requestFaucetDrip, FaucetRequestError, type FaucetAssetSymbol } from "@/lib/faucet-client";

const inputCls =
  "w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm text-white outline-none focus:border-brand/50 font-mono";
const labelCls = "mb-1 block text-xs text-gray-500";

/**
 * Every asset the faucet dispenses, each with what it is actually *for* —
 * a tester who takes only the stablecoins gets stuck several steps later
 * with no idea why, so the reason belongs next to the checkbox.
 */
const ASSET_OPTIONS: Array<{ symbol: FaucetAssetSymbol; label: string; why: string }> = [
  { symbol: "SOL", label: "SOL", why: "transaction fees and account rent" },
  { symbol: "USDC", label: "mock USDC", why: "trade and settle" },
  { symbol: "USDT", label: "mock USDT", why: "trade and settle" },
  { symbol: "OPEN", label: "OPEN", why: "stake into a role" },
];

type RequestState =
  | { phase: "idle" }
  | { phase: "requesting" }
  | { phase: "done"; signature: string; amounts: Partial<Record<FaucetAssetSymbol, number>> }
  | { phase: "error"; message: string };

/** Requests SOL, mock USDC, mock USDT and OPEN from `openfiat-faucet` (a
 *  separate, non-protocol service — see NEXT_PUBLIC_FAUCET_URL in
 *  lib/faucet-config.ts) to any Solana address, defaulting to the connected
 *  wallet's own address. All four are selected by default: that is the set a
 *  newcomer needs to complete onboarding, and deselecting SOL or OPEN is the
 *  choice that strands them later. */
export function FaucetForm() {
  const [address, setAddress] = useState("");
  const [selected, setSelected] = useState<FaucetAssetSymbol[]>(["SOL", "USDC", "USDT", "OPEN"]);
  const [state, setState] = useState<RequestState>({ phase: "idle" });

  useEffect(() => {
    const fillFromWallet = () => {
      const wallet = readWalletConnection();
      if (wallet) setAddress((current) => current || wallet.address);
    };
    fillFromWallet();
    window.addEventListener(WALLET_CHANGED_EVENT, fillFromWallet);
    return () => window.removeEventListener(WALLET_CHANGED_EVENT, fillFromWallet);
  }, []);

  function toggleAsset(symbol: FaucetAssetSymbol) {
    setSelected((current) =>
      current.includes(symbol) ? current.filter((s) => s !== symbol) : [...current, symbol],
    );
  }

  // Client-side check is a courtesy (fast, friendly feedback) — the faucet
  // service re-validates from scratch and is the only check that matters
  // for safety; see openfiat-faucet/src/validate.ts.
  const addressLooksValid = (() => {
    try {
      return new PublicKey(address.trim()).toBase58().length > 0;
    } catch {
      return false;
    }
  })();

  const canSubmit = addressLooksValid && selected.length > 0 && state.phase !== "requesting";

  async function handleSubmit() {
    setState({ phase: "requesting" });
    try {
      const result = await requestFaucetDrip(address.trim(), selected);
      setState({ phase: "done", signature: result.signature, amounts: result.amounts });
    } catch (err) {
      const message =
        err instanceof FaucetRequestError
          ? err.message
          : "Could not reach the faucet service. Try again shortly.";
      setState({ phase: "error", message });
    }
  }

  if (state.phase === "done") {
    return (
      <Panel>
        <div className="px-4 py-14 text-center">
          <p className="text-2xl text-emerald-400">✓</p>
          <h2 className="mt-3 text-lg font-semibold text-white">Sent</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-400">
            {Object.entries(state.amounts)
              .map(([symbol, amount]) => `${amount} ${symbol}`)
              .join(" and ")}{" "}
            sent to your address on devnet.
          </p>
          <a
            href={`https://explorer.solana.com/tx/${state.signature}?cluster=devnet`}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block font-mono text-xs text-brand-teal hover:underline"
          >
            {shortSig(state.signature)}
          </a>
          <div>
            <button
              onClick={() => setState({ phase: "idle" })}
              className="mt-6 inline-block rounded-md bg-brand px-6 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
            >
              Request more
            </button>
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Request test tokens">
      <div className="divide-y divide-white/5">
        <div className="px-4 py-6">
          <label htmlFor="faucet-address" className={labelCls}>
            Solana address
          </label>
          <input
            id="faucet-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Paste any devnet wallet address"
            className={inputCls}
          />
          {address.length > 0 && !addressLooksValid && (
            <p className="mt-1.5 text-xs text-amber-300">Not a valid Solana address.</p>
          )}
          <p className="mt-1.5 text-[11px] text-gray-600">
            Pre-filled from your connected wallet if one is connected — paste a different address to fund
            another wallet instead.
          </p>
        </div>

        <div className="px-4 py-6">
          <p className={labelCls}>Assets</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {ASSET_OPTIONS.map((opt) => (
              <button
                key={opt.symbol}
                onClick={() => toggleAsset(opt.symbol)}
                className={`rounded-md border px-3.5 py-2 text-left text-sm transition-colors ${
                  selected.includes(opt.symbol)
                    ? "border-brand/50 bg-brand/10 text-white"
                    : "border-white/10 text-gray-400 hover:text-white"
                }`}
              >
                <span className="block">{opt.label}</span>
                <span className="block text-[11px] text-gray-500">{opt.why}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-gray-600">
            SOL pays transaction fees and account rent, and OPEN is what a role is staked with — without
            both, onboarding stops partway. OPEN comes from a finite stash rather than being minted, so it
            can run out.
          </p>
        </div>

        <div className="px-4 py-6">
          {state.phase === "error" && <p className="mb-2 text-center text-xs text-red-300">{state.message}</p>}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full rounded-md bg-brand py-2.5 text-sm font-semibold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {state.phase === "requesting" ? "Requesting…" : "Send test tokens"}
          </button>
          <p className="mt-2 text-center text-[11px] text-gray-600">
            Fixed amount per request, rate-limited per wallet and per IP address — not user-adjustable.
          </p>
        </div>
      </div>
    </Panel>
  );
}
