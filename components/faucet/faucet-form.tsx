"use client";

import { useEffect, useState } from "react";
import { Panel } from "@/components/panel";
import { shortSig } from "@/lib/format";
import {
  currentSigner,
  readWalletConnection,
  WALLET_CHANGED_EVENT,
  type WalletConnection,
} from "@/lib/wallet-connection";
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
  | { phase: "signing" }
  | { phase: "requesting" }
  | { phase: "done"; signature: string; amounts: Partial<Record<FaucetAssetSymbol, number>> }
  | { phase: "error"; message: string };

/**
 * Requests SOL, mock USDC, mock USDT and OPEN from `openfiat-faucet` (a
 * separate, non-protocol service — see NEXT_PUBLIC_FAUCET_URL in
 * lib/faucet-config.ts) for the **connected wallet**.
 *
 * It used to accept any address typed into a box. It cannot any more: the
 * faucet now requires a signature over a challenge it issues, so a grant only
 * goes to a wallet whose holder is present to sign. That is the point rather
 * than a side effect — funding addresses nobody could prove they held was how
 * a script could cycle through wallets and drain the finite OPEN stash while
 * the per-wallet daily cap counted them all as strangers.
 *
 * All four assets are selected by default: that is the set a newcomer needs to
 * complete onboarding, and deselecting SOL or OPEN is the choice that strands
 * them later.
 */
export function FaucetForm() {
  const [wallet, setWallet] = useState<WalletConnection | null>(null);
  const [selected, setSelected] = useState<FaucetAssetSymbol[]>(["SOL", "USDC", "USDT", "OPEN"]);
  const [state, setState] = useState<RequestState>({ phase: "idle" });

  useEffect(() => {
    const sync = () => setWallet(readWalletConnection());
    sync();
    window.addEventListener(WALLET_CHANGED_EVENT, sync);
    return () => window.removeEventListener(WALLET_CHANGED_EVENT, sync);
  }, []);

  function toggleAsset(symbol: FaucetAssetSymbol) {
    setSelected((current) =>
      current.includes(symbol) ? current.filter((s) => s !== symbol) : [...current, symbol],
    );
  }

  const busy = state.phase === "signing" || state.phase === "requesting";
  const canSubmit = wallet !== null && selected.length > 0 && !busy;

  async function handleSubmit() {
    if (!wallet) return;
    const signer = currentSigner(wallet);
    if (!signer) {
      setState({
        phase: "error",
        message: "Your wallet is not available to sign. Reconnect it and try again.",
      });
      return;
    }
    // Two phases so the button can say which one the user is waiting on: the
    // wallet prompt is theirs to act on, the request afterwards is not.
    setState({ phase: "signing" });
    try {
      const result = await requestFaucetDrip(wallet.address, signer, selected, () =>
        setState({ phase: "requesting" }),
      );
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
          <p className={labelCls}>Wallet</p>
          {wallet ? (
            <>
              <p className={`${inputCls} truncate`}>{wallet.address}</p>
              <p className="mt-1.5 text-[11px] text-gray-600">
                Tokens go to the wallet you have connected. You will be asked to sign a short message
                proving you control it — no transaction is created, and nothing leaves your wallet.
              </p>
            </>
          ) : (
            <p className="rounded-md border border-white/10 px-3 py-2 text-sm text-gray-400">
              Connect a wallet to request test tokens.
            </p>
          )}
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
            {state.phase === "signing"
              ? "Check your wallet…"
              : state.phase === "requesting"
                ? "Requesting…"
                : wallet
                  ? "Sign and send test tokens"
                  : "Connect a wallet first"}
          </button>
          <p className="mt-2 text-center text-[11px] text-gray-600">
            Fixed amount per request, rate-limited per wallet and per IP address — not user-adjustable.
          </p>
        </div>
      </div>
    </Panel>
  );
}
