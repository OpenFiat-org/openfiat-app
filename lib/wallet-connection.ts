/**
 * The one real (non-simulated) piece of wallet state: which injected
 * Solana provider `WalletConnect` connected to, and how any other
 * component can reach that same provider to actually sign something.
 *
 * Follows `node-preference.ts`'s own established shape exactly
 * (localStorage + a `window` `CustomEvent` for cross-component
 * reactivity) rather than introducing a React Context for this — this
 * app has no such context anywhere else, and the storage-event pattern
 * already does the job for the one other piece of cross-page connection
 * state this app has.
 */

export interface SolanaSignResult {
  signature: string;
}

/** The subset of an injected Solana wallet's API this app actually uses. */
export interface SolanaProvider {
  isPhantom?: boolean;
  connect(): Promise<{ publicKey: { toString(): string } }>;
  /**
   * The de-facto standard method across Phantom/Solflare/Backpack/Coinbase
   * for "sign this transaction and broadcast it" in one prompt — simpler
   * for a user than a separate sign-then-submit flow, and this app never
   * needs the unsigned bytes for anything else afterward.
   */
  signAndSendTransaction(
    transaction: import("@solana/web3.js").Transaction,
  ): Promise<SolanaSignResult>;
  /**
   * Raw Ed25519 signature over arbitrary bytes — no prefixing, unlike
   * Ethereum's `personal_sign`. Every wallet listed below implements it, but
   * it stays optional here because a connection can be restored from storage
   * for a provider that is no longer injected.
   *
   * This is what makes the wallet usable as a protocol identity: OpenFiat's
   * off-chain events are verified as a raw Ed25519 signature over the
   * payload's JSON bytes, against a PeerId derived from the same public key.
   * See `lib/arbitration.ts`.
   */
  signMessage?(message: Uint8Array): Promise<{ signature: Uint8Array }>;
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

export const WALLET_STORAGE_KEY = "openfiat:wallet";
export const WALLET_CHANGED_EVENT = "openfiat:wallet-changed";

export interface WalletConnection {
  wallet: string;
  address: string;
}

export type InjectedWalletKey = "phantom" | "solflare" | "backpack" | "coinbaseSolana";

export function injectedProvider(key: InjectedWalletKey): SolanaProvider | undefined {
  if (typeof window === "undefined") return undefined;
  if (key === "phantom") return window.phantom?.solana ?? window.solana;
  return window[key];
}

/** Maps a `WalletConnection.wallet` display name back to its injected key. */
const WALLET_NAME_TO_KEY: Record<string, InjectedWalletKey> = {
  Phantom: "phantom",
  Solflare: "solflare",
  Backpack: "backpack",
  "Coinbase Wallet": "coinbaseSolana",
};

/**
 * The live provider object for whatever wallet is currently connected, or
 * `undefined` if none is connected or it was a simulated connection (no
 * real extension detected at connect time — see `wallet-connect.tsx`).
 * Re-derived on every call rather than cached, since the extension itself
 * owns the actual connection lifecycle.
 */
export function currentSigner(connection: WalletConnection | null): SolanaProvider | undefined {
  if (!connection) return undefined;
  const key = WALLET_NAME_TO_KEY[connection.wallet];
  return key ? injectedProvider(key) : undefined;
}

export function readWalletConnection(): WalletConnection | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = localStorage.getItem(WALLET_STORAGE_KEY);
    return saved ? (JSON.parse(saved) as WalletConnection) : null;
  } catch {
    return null;
  }
}

export function writeWalletConnection(connection: WalletConnection | null): void {
  try {
    if (connection) {
      localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(connection));
    } else {
      localStorage.removeItem(WALLET_STORAGE_KEY);
    }
    window.dispatchEvent(new CustomEvent(WALLET_CHANGED_EVENT));
  } catch {
    /* localStorage unavailable */
  }
}
