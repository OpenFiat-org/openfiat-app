"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";

import { DEVNET_OPEN_MINT } from "@/lib/onchain-config";
import { fetchTokenBalance } from "@/lib/live-token-balances";
import { formatBaseUnits } from "@/lib/live-vaults";

/**
 * Wallet connection, using the standard Solana wallet modal.
 *
 * # What the hand-rolled version did
 *
 * It listed four wallets by name, each read off a hardcoded `window`
 * global, and — much worse — it faked a connection. `connect()` defaulted
 * the address to `CURRENT_USER.wallet`, a fixture, and fell back to it both
 * when no wallet was installed AND when the user rejected the prompt:
 *
 *     let address = CURRENT_USER.wallet;
 *     ...
 *     } else { await new Promise(r => setTimeout(r, 700)); }  // "simulated"
 *     } catch { ... }                                          // rejected
 *
 * So declining the wallet prompt still left the app showing you as
 * connected, to a wallet you do not control. Everything downstream —
 * staking, vaults, reputation, the faucet's prefilled address — then
 * operated against that address. A user could have requested faucet tokens
 * to a stranger's wallet and watched it succeed.
 *
 * `WalletMultiButton` cannot do any of that: it reflects adapter state, and
 * a rejected connection stays disconnected.
 *
 * Loaded with `ssr: false` because the modal reads `window` during render;
 * without it, hydration mismatches on every page that shows the nav.
 */
const WalletMultiButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false },
);

export function WalletConnect() {
  const { publicKey, connected } = useWallet();
  const [openBalance, setOpenBalance] = useState<{ amount: bigint; decimals: number } | null>(null);

  useEffect(() => {
    if (!connected || !publicKey) {
      setOpenBalance(null);
      return;
    }
    let cancelled = false;
    fetchTokenBalance(publicKey, new PublicKey(DEVNET_OPEN_MINT))
      .then((b) => !cancelled && setOpenBalance(b ? { amount: b.amount, decimals: b.decimals } : null))
      // A balance that cannot be read stays null and renders nothing. It is
      // not shown as zero: "we could not reach the RPC" and "this wallet
      // holds no OPEN" are different facts, and only one of them means the
      // user cannot stake.
      .catch(() => !cancelled && setOpenBalance(null));
    return () => {
      cancelled = true;
    };
  }, [connected, publicKey]);

  return (
    <div className="flex items-center gap-3">
      {connected && openBalance !== null && (
        <span className="hidden rounded-full border border-white/10 px-3 py-1.5 text-xs tabular-nums text-gray-300 sm:inline">
          {formatBaseUnits(openBalance.amount, openBalance.decimals)} OPEN
        </span>
      )}
      <WalletMultiButton />
    </div>
  );
}
