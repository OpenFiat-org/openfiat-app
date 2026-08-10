/**
 * Source-chain wallet connectors for the cross-chain "pay from another
 * chain" flow (SP-B Task 3): EVM/BSC and TRON, behind one small shared
 * interface so `components/open/pay-cross-chain.tsx` never has to branch on
 * which chain it's talking to.
 *
 * # Why TRON gets its own adapter instead of reusing the EVM one
 *
 * TRON exposes an EVM-shaped VM (TVM) but not an EVM-shaped wallet API:
 * TronLink injects `window.tronLink`/`window.tronWeb`, not an EIP-1193
 * `window.ethereum` provider, its addresses are base58Check rather than
 * `0x`-hex, and its signing flow is TronWeb's own. Reusing the EVM path
 * would mean an EVM adapter with TRON-shaped branches threaded through it —
 * this keeps the two isolated instead, exactly as the brief asks.
 *
 * # SP-C Task 2 widened the EVM side to "EVM majors"
 *
 * SP-B Task 3 only ever needed Ethereum and BSC (the presale's own
 * "pay from another chain" chain list). SP-C's stablecoin bridge panel
 * offers the same chains `@openfiat/sdk`'s `debridge.CHAIN_STABLECOIN_TOKENS`
 * covers, so `EVM_CHAIN_ID`/`SourceChainKey` grew Polygon, Arbitrum,
 * Optimism, Avalanche and Base alongside Ethereum and BSC — same
 * `window.ethereum` EIP-1193 connector, just more `chainId`s it knows how to
 * ask a wallet to switch to. Nothing about the connector itself changed.
 *
 * # No `wagmi`/`viem`
 *
 * Nothing in this app depends on either today (`package.json` has neither),
 * despite the SP-B plan's brief assuming an existing wagmi/viem stack to
 * build on. Standing one up — provider tree, chain config, a query client —
 * is a real architectural addition this task's actual deliverable (order-build
 * and validation logic, unit-tested; live submission gated for Task 4) does
 * not need to carry. `connectEvmWallet` below talks to `window.ethereum`
 * directly via EIP-1193 (`eth_requestAccounts`), which is the same thing
 * wagmi's injected connector does underneath — sufficient for "get an
 * address to build an order against," which is as far as this task's scope
 * goes. Wiring wagmi/viem, if the app wants their multi-wallet discovery and
 * chain-switching UX later, is separate work.
 */

export type EvmSourceChainKey =
  | "ethereum"
  | "bsc"
  | "polygon"
  | "arbitrum"
  | "optimism"
  | "avalanche"
  | "base";

export type SourceChainKey = EvmSourceChainKey | "tron";

export interface SourceWalletConnection {
  chain: SourceChainKey;
  /** `0x`-hex for EVM chains, base58Check for TRON. Never validated here — this module only reports what the wallet handed back. */
  address: string;
}

/** The one thing every source-chain connector has to do for this flow: produce an address to build the order's `srcChainOrderAuthorityAddress` from. */
export interface SourceWalletAdapter {
  chain: SourceChainKey;
  /** Whether a compatible wallet is even injected — lets the UI grey out an option instead of offering a connect button that can only fail. */
  isAvailable(): boolean;
  connect(): Promise<SourceWalletConnection>;
}

interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

interface TronLinkProvider {
  request(args: { method: string }): Promise<unknown>;
}

interface TronWebLike {
  defaultAddress?: { base58?: string };
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
    tronLink?: TronLinkProvider;
    tronWeb?: TronWebLike;
  }
}

/** EVM chain ids (real ones — MetaMask/`eth_requestAccounts` speak these, not deBridge's internal ids in `lib/debridge-order.ts`/`lib/bridge-funds.ts`). */
const EVM_CHAIN_ID: Record<EvmSourceChainKey, string> = {
  ethereum: "0x1",
  bsc: "0x38",
  polygon: "0x89",
  arbitrum: "0xa4b1",
  optimism: "0xa",
  avalanche: "0xa86a",
  base: "0x2105",
};

/** Human-readable chain names for the one error message below that needs one. */
const EVM_CHAIN_NAME: Record<EvmSourceChainKey, string> = {
  ethereum: "Ethereum",
  bsc: "BNB Chain",
  polygon: "Polygon",
  arbitrum: "Arbitrum",
  optimism: "Optimism",
  avalanche: "Avalanche",
  base: "Base",
};

/**
 * `window.ethereum`-based connector for Ethereum or BSC.
 *
 * Requests account access and asks the wallet to switch to the target
 * chain (`wallet_switchEthereumChain`) so the address returned is one the
 * wallet will actually sign a transaction on that chain with. A chain a
 * wallet has never added fails the switch with a specific, surfaced error
 * rather than silently returning an address on the wrong network — this
 * flow builds a `srcChainId`-specific order, and a mismatched network is
 * exactly the class of mistake that strands funds.
 */
export function evmWalletAdapter(chain: EvmSourceChainKey): SourceWalletAdapter {
  return {
    chain,
    isAvailable(): boolean {
      return typeof window !== "undefined" && window.ethereum !== undefined;
    },
    async connect(): Promise<SourceWalletConnection> {
      if (typeof window === "undefined" || !window.ethereum) {
        throw new Error("No EVM wallet found (window.ethereum is not injected).");
      }
      const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const address = accounts[0];
      if (!address) {
        throw new Error("The connected EVM wallet returned no account.");
      }
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: EVM_CHAIN_ID[chain] }],
        });
      } catch (error) {
        throw new Error(
          `Connected, but the wallet would not switch to ${EVM_CHAIN_NAME[chain]}: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
      return { chain, address };
    },
  };
}

/**
 * TronLink connector.
 *
 * TronLink's own `tron_requestAccounts` triggers the approval prompt but —
 * unlike EIP-1193's `eth_requestAccounts` — doesn't return the address in
 * its result; the address is read off `window.tronWeb.defaultAddress`
 * afterward, which TronLink populates once the user approves. Both objects
 * are checked because a page can observe `tronLink` injected before the
 * user has ever approved a site, in which case `tronWeb` isn't populated
 * yet.
 */
export function tronWalletAdapter(): SourceWalletAdapter {
  return {
    chain: "tron",
    isAvailable(): boolean {
      return typeof window !== "undefined" && window.tronLink !== undefined;
    },
    async connect(): Promise<SourceWalletConnection> {
      if (typeof window === "undefined" || !window.tronLink) {
        throw new Error("No TronLink wallet found (window.tronLink is not injected).");
      }
      await window.tronLink.request({ method: "tron_requestAccounts" });
      const address = window.tronWeb?.defaultAddress?.base58;
      if (!address) {
        throw new Error("TronLink did not approve an account.");
      }
      return { chain: "tron", address };
    },
  };
}

/** One adapter per supported source chain, keyed the same way `lib/debridge-order.ts`'s `SOURCE_CHAIN_IDS` and `lib/bridge-funds.ts`'s `DEBRIDGE_CHAIN_IDS` are. */
export function sourceWalletAdapters(): Record<SourceChainKey, SourceWalletAdapter> {
  return {
    ethereum: evmWalletAdapter("ethereum"),
    bsc: evmWalletAdapter("bsc"),
    polygon: evmWalletAdapter("polygon"),
    arbitrum: evmWalletAdapter("arbitrum"),
    optimism: evmWalletAdapter("optimism"),
    avalanche: evmWalletAdapter("avalanche"),
    base: evmWalletAdapter("base"),
    tron: tronWalletAdapter(),
  };
}
