"use client";

import { useEffect, useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  SolanaMobileWalletAdapter,
  createDefaultAddressSelector,
  createDefaultAuthorizationResultCache,
  createDefaultWalletNotFoundHandler,
} from "@solana-mobile/wallet-adapter-mobile";
import type { Adapter } from "@solana/wallet-adapter-base";
import type { Transaction } from "@solana/web3.js";

import { mobileWalletChain } from "@/lib/mobile-wallet";
import { SOLANA_RPC_ENDPOINT } from "@/lib/onchain-config";
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
 * Browser-extension wallets are still never named here: every one of them
 * registers itself through the Wallet Standard, and the adapter discovers
 * those automatically. Naming them explicitly would *shrink* the list back
 * to whatever this file happens to enumerate — the exact failure being
 * fixed.
 *
 * # Mobile Wallet Adapter is the one adapter that has to be named
 *
 * It is also the one that cannot be discovered. Wallet Standard discovery
 * works by a wallet injecting a provider into the page, and on a phone
 * nothing does: there are no extensions, so an empty adapter list on mobile
 * meant an empty wallet modal and an application nobody could use. MWA is a
 * protocol rather than an injected object — the page starts a local
 * association and Android hands off to a wallet app — so it exists only if
 * this file constructs it.
 *
 * It reports itself `Unsupported` off Android, and `@solana/wallet-adapter-react`
 * drops unsupported adapters before the modal renders. So naming it does not
 * put a dead entry in a desktop or iOS list: it appears exactly where it
 * works. `components/wallet/mobile-connect-note.tsx` says what to do where
 * it does not.
 *
 * Twenty components already read the wallet through `lib/wallet-connection`.
 * Rewriting all of them to `useWallet()` would touch every signing surface
 * in one change, so instead `WalletBridge` below keeps that module as the
 * app's internal interface and feeds it from the adapter. The connect
 * experience becomes standard; nothing downstream has to know.
 */
export function AppWalletProvider({ children }: { children: React.ReactNode }) {
  const endpoint = useMemo(() => SOLANA_RPC_ENDPOINT, []);
  const wallets = useMemo(() => mobileWallets(), []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      {/* autoConnect restores the previous session the way every other
          Solana app does, rather than through this app's own localStorage
          record — the adapter owns that state now. */}
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <WalletBridge />
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

/**
 * The Mobile Wallet Adapter, where this build is entitled to offer one.
 *
 * Two conditions, and both are refusals rather than defaults:
 *
 * - No `window`. The constructor is safe during SSR, but the authorization
 *   cache it is given is browser storage, and a server render has no user
 *   whose session it could be restoring.
 * - No identifiable cluster. MWA authorizes for a *named* chain and the
 *   wallet signs against that name, so a build pointed at an RPC host this
 *   app cannot place would be asking a wallet to approve on a network it
 *   only guessed at. `mobileWalletChain` returns `null` there, and no
 *   adapter is offered — the modal is then honestly empty rather than
 *   offering a hand-off that would authorize the wrong chain.
 *
 * `createDefaultWalletNotFoundHandler` is the adapter's own: on an Android
 * device with no MWA-capable wallet installed it opens the Solana Mobile
 * wallet list. That is a better answer than anything this app could invent,
 * and it is the wallet ecosystem's own page rather than a link this repo
 * would have to keep current.
 */
function mobileWallets(): Adapter[] {
  if (typeof window === "undefined") return [];
  const chain = mobileWalletChain();
  if (chain === null) return [];

  return [
    new SolanaMobileWalletAdapter({
      addressSelector: createDefaultAddressSelector(),
      appIdentity: {
        name: "OpenFiat",
        uri: window.location.origin,
        // Relative to `uri`, as the MWA spec requires — an absolute URL on
        // another origin is rejected by wallets that check it.
        icon: "logo-mark.png",
      },
      authorizationResultCache: createDefaultAuthorizationResultCache(),
      chain,
      onWalletNotFound: createDefaultWalletNotFoundHandler(),
    }),
  ];
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
