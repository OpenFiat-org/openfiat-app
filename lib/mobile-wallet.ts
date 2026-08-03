import { SOLANA_RPC_URL, solanaClusterOf } from "@/lib/node-endpoint";

/**
 * What a wallet connection can actually do in the browser it is running in.
 *
 * # Why this exists at all
 *
 * The app shipped only browser-extension wallets. Those are discovered
 * through the Wallet Standard, which needs a wallet to have injected a
 * provider into the page — and a mobile browser has no extensions, so
 * nothing injects one. The connect button was therefore not "broken" on a
 * phone: it was structurally incapable of connecting, and it looked exactly
 * the same as one that worked. Every screen in this app needs a wallet, so
 * that was the whole application, unavailable, without saying so.
 *
 * Mobile Wallet Adapter closes half of the gap. It is an Android protocol:
 * the page starts a local association and the OS hands off to a wallet app
 * over an intent. There is no iOS equivalent — Apple has no equivalent
 * hand-off — and on iOS the practical path is the wallet's own in-app
 * browser, which *does* inject a provider, so the ordinary Wallet Standard
 * discovery works there and nothing special is needed except knowing to go
 * there.
 *
 * So the environment decides which of three different true sentences to
 * say, and this module is where that decision lives, as data rather than as
 * JSX, so it can be tested against user-agent strings without a browser.
 */

/**
 * The predicate the adapter itself uses, restated.
 *
 * `@solana-mobile/wallet-adapter-mobile`'s `getIsSupported()` is
 * `window.isSecureContext && /android/i.test(navigator.userAgent)`, and an
 * adapter that reports `Unsupported` is filtered out of the wallet modal by
 * `@solana/wallet-adapter-react` before a user ever sees it. If the sentence
 * this app prints and the list the modal renders came from two different
 * tests they would eventually disagree, and the failure mode is the one this
 * whole module exists to remove: a screen saying a path is available when
 * the button cannot offer it.
 *
 * Restated rather than imported because the adapter does not export it.
 * `tests/mobile-wallet.test.ts` pins both halves.
 */
export function mobileWalletAdapterSupported(env: ConnectEnvironment): boolean {
  return env.secureContext && /android/i.test(env.userAgent);
}

/** Everything the decision depends on, passed in so it can be tested. */
export interface ConnectEnvironment {
  userAgent: string;
  /**
   * `window.isSecureContext`. Mobile Wallet Adapter's local association is
   * refused outside one, and `http://` on a phone's own IP — the obvious way
   * to try this from a laptop dev server — is not a secure context, while
   * `localhost` is.
   */
  secureContext: boolean;
  /**
   * Whether some wallet has already injected a Solana provider into this
   * page. True inside a wallet's in-app browser, and true on desktop with an
   * extension installed. When it is true there is nothing to explain: the
   * ordinary connect flow works.
   */
  injectedProvider: boolean;
}

/**
 * Which connect story applies here.
 *
 * Ordered by specificity, and every branch is a fact about the browser
 * rather than a guess about the user.
 */
export type ConnectPath =
  /** A provider is injected — extension, or a wallet's own in-app browser. */
  | { kind: "injected" }
  /** Android over HTTPS: Mobile Wallet Adapter hands off to a wallet app. */
  | { kind: "android-handoff" }
  /** Android, but not a secure context, so the association cannot start. */
  | { kind: "android-insecure" }
  /** iOS: no Mobile Wallet Adapter exists. The wallet's browser is the path. */
  | { kind: "ios-in-app-browser" }
  /** Some other phone or tablet with nothing injected and no MWA. */
  | { kind: "mobile-unsupported" }
  /** A desktop browser with no extension yet — the modal's own copy covers it. */
  | { kind: "desktop" };

/** iOS, including iPadOS, which reports itself as a Mac with touch points. */
function isIos(userAgent: string): boolean {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return true;
  // iPadOS 13+ sends a desktop Safari user agent. `Version/… Safari` with
  // `Macintosh` and no `Chrome` is Safari on either, and the two behave
  // identically for this purpose — neither can run an extension.
  return /Macintosh/.test(userAgent) && /Mobile\//.test(userAgent);
}

function isMobile(userAgent: string): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(userAgent);
}

export function connectPath(env: ConnectEnvironment): ConnectPath {
  if (env.injectedProvider) return { kind: "injected" };
  if (/android/i.test(env.userAgent)) {
    return env.secureContext ? { kind: "android-handoff" } : { kind: "android-insecure" };
  }
  if (isIos(env.userAgent)) return { kind: "ios-in-app-browser" };
  return isMobile(env.userAgent) ? { kind: "mobile-unsupported" } : { kind: "desktop" };
}

/** A sentence to print beside the connect button, or nothing to say. */
export interface ConnectNotice {
  /** Whether pressing Connect can lead anywhere in this browser. */
  workable: boolean;
  text: string;
}

/**
 * What to tell someone about the connect button in front of them.
 *
 * `null` where there is nothing to add — a working extension, or a desktop
 * browser where the modal's own "you'll need a wallet" copy is already the
 * right answer and a second sentence would just be noise.
 *
 * The iOS text names the route rather than gesturing at it. "Not supported
 * on iOS" leaves a reader with no next step and is the sentence this repo
 * would otherwise have shipped by omission; "open this page in your wallet's
 * browser" is a thing they can actually do, and it works today.
 */
export function connectNotice(path: ConnectPath): ConnectNotice | null {
  switch (path.kind) {
    case "injected":
    case "desktop":
      return null;
    case "android-handoff":
      return {
        workable: true,
        text: "On Android, choose Mobile Wallet Adapter — your wallet app opens to approve, then returns here.",
      };
    case "android-insecure":
      return {
        workable: false,
        text: "Mobile Wallet Adapter needs a secure context, and this page is not served over HTTPS, so no wallet app can be reached from here.",
      };
    case "ios-in-app-browser":
      return {
        workable: false,
        text: "iOS has no Mobile Wallet Adapter, so this browser cannot reach a wallet app. Open this page inside your wallet's own browser — Phantom and Solflare both have one — and Connect will work there.",
      };
    case "mobile-unsupported":
      return {
        workable: false,
        text: "This browser has no wallet extension and no Mobile Wallet Adapter, so there is nothing for Connect to reach. Open this page inside your wallet's own browser.",
      };
  }
}

/**
 * The chain a Mobile Wallet Adapter authorization is requested for, or
 * `null` when this build cannot say which one it is on.
 *
 * MWA authorizes for a named chain, and the wallet signs against that name.
 * Naming the wrong one is not a cosmetic error — it is asking a wallet to
 * approve on a network the app is not reading — so an unrecognised RPC host
 * yields `null` and the adapter is not offered at all, rather than being
 * offered against a guess. `solanaClusterOf` already refuses to guess for
 * exactly the same reason; this is that refusal carried one step further.
 */
export function mobileWalletChain(
  rpcUrl: string = SOLANA_RPC_URL,
): "solana:devnet" | "solana:testnet" | "solana:mainnet" | null {
  switch (solanaClusterOf(rpcUrl)) {
    case "Devnet":
      return "solana:devnet";
    case "Testnet":
      return "solana:testnet";
    case "Mainnet":
      return "solana:mainnet";
    default:
      return null;
  }
}
