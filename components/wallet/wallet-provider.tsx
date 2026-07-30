"use client";

import { useEffect, useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import type { Transaction } from "@solana/web3.js";

import { DEVNET_RPC_ENDPOINT } from "@/lib/onchain-config";
import {
  registerAdapterSigner,
  writeWalletConnection,
  type SolanaProvider,
} from "@/lib/wallet-connection";

import "@solana/wallet-adapter-react-ui/styles.css";

/**
 * The standard Solana wallet stack.
 *
 * # What this replaced, and why the rest of the app did not change
 *
 * The app had a hand-rolled connect modal listing four wallets it knew about
 * by name, each read off a hardcoded `window` global. That misses every
 * wallet not on the list, misses mobile deep links, and re-implements
 * detection, ordering and reconnection that the ecosystem already agrees on.
 *
 * `WalletProvider` with an empty adapter list is deliberate, not an
 * oversight: every current wallet registers itself through the Wallet
 * Standard, and the adapter discovers those automatically. Naming adapters
 * explicitly would *shrink* the list back to whatever this file happens to
 * enumerate — the exact failure being fixed.
 *
 * Twenty components already read the wallet through `lib/wallet-connection`.
 * Rewriting all of them to `useWallet()` would touch every signing surface
 * in one change, so instead `WalletBridge` below keeps that module as the
 * app's internal interface and feeds it from the adapter. The connect
 * experience becomes standard; nothing downstream has to know.
 */
export function AppWalletProvider({ children }: { children: React.ReactNode }) {
  const endpoint = useMemo(() => DEVNET_RPC_ENDPOINT, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      {/* autoConnect restores the previous session the way every other
          Solana app does, rather than through this app's own localStorage
          record — the adapter owns that state now. */}
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>
          <WalletBridge />
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

/**
 * Mirrors adapter state into `lib/wallet-connection`.
 *
 * Renders nothing. Its whole job is to keep one source of truth: the adapter
 * decides what is connected, and every existing consumer keeps reading the
 * API it already uses.
 */
function WalletBridge() {
  const { publicKey, connected, wallet, signMessage, sendTransaction } = useWallet();
  const { connection } = useConnection();

  useEffect(() => {
    if (!connected || !publicKey) {
      registerAdapterSigner(null);
      writeWalletConnection(null);
      return;
    }

    const provider: SolanaProvider = {
      connect: async () => ({ publicKey: { toString: () => publicKey.toBase58() } }),
      // Raw Ed25519 over arbitrary bytes — what OpenFiat's off-chain events
      // are verified against. Wallets may omit it, so the absence is
      // surfaced as a clear error rather than a silent no-op.
      signMessage: signMessage
        ? async (message: Uint8Array) => ({ signature: await signMessage(message) })
        : undefined,
      signAndSendTransaction: async (transaction: Transaction) => {
        const signature = await sendTransaction(transaction, connection);
        return { signature };
      },
    };

    registerAdapterSigner(provider);
    writeWalletConnection({
      wallet: wallet?.adapter.name ?? "Wallet",
      address: publicKey.toBase58(),
    });
  }, [connected, publicKey, wallet, signMessage, sendTransaction, connection]);

  return null;
}
