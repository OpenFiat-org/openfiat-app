import { describe, expect, it } from "vitest";

import {
  connectNotice,
  connectPath,
  mobileWalletAdapterSupported,
  mobileWalletChain,
} from "@/lib/mobile-wallet";

/**
 * A mobile browser could not connect a wallet at all, and said nothing.
 *
 * The app shipped browser-extension wallets only. Those are found through
 * the Wallet Standard, which needs a wallet to inject a provider into the
 * page — and no mobile browser has extensions, so nothing ever did. The
 * connect button opened a modal with nothing in it. Nothing in this app
 * works without a wallet, so that was the entire application, unusable, on
 * every phone, with no error anywhere.
 *
 * Mobile Wallet Adapter fixes Android. It cannot fix iOS, because iOS has no
 * equivalent hand-off — so what is pinned here is not "mobile works now" but
 * that each browser is told the truth about itself, including the browser
 * where the answer is "not from here, but from your wallet's own browser".
 */

/** Real strings, not invented ones. */
const UA = {
  androidChrome:
    "Mozilla/5.0 (Linux; Android 13; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
  ipadOs:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
  desktopChrome:
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

describe("which connect path a browser has", () => {
  it("hands off to a wallet app on Android over HTTPS", () => {
    expect(
      connectPath({ userAgent: UA.androidChrome, secureContext: true, injectedProvider: false }),
    ).toEqual({ kind: "android-handoff" });
  });

  /*
   * The obvious way to try this from a laptop — `next dev` on the machine's
   * LAN address, opened on a phone — is plain HTTP, and the association
   * silently cannot start there. Without this branch the Android note would
   * promise a hand-off that never happens.
   */
  it("says so on Android outside a secure context, rather than promising a hand-off", () => {
    expect(
      connectPath({ userAgent: UA.androidChrome, secureContext: false, injectedProvider: false }),
    ).toEqual({ kind: "android-insecure" });
    expect(connectNotice({ kind: "android-insecure" })?.workable).toBe(false);
  });

  it("sends iOS to the wallet's own browser, which is the one route that works", () => {
    const path = connectPath({
      userAgent: UA.iphoneSafari,
      secureContext: true,
      injectedProvider: false,
    });
    expect(path).toEqual({ kind: "ios-in-app-browser" });

    const notice = connectNotice(path);
    expect(notice?.workable).toBe(false);
    // A next step, not just a refusal. "Not supported on iOS" would be true
    // and useless, and it is what this app would have shipped by saying
    // nothing at all.
    expect(notice?.text).toMatch(/wallet's own browser/i);
  });

  /* iPadOS 13+ sends a Mac user agent. It is no more able to run an
     extension than an iPhone, and it must not be read as a desktop. */
  it("reads iPadOS as iOS despite its desktop-shaped user agent", () => {
    expect(
      connectPath({ userAgent: UA.ipadOs, secureContext: true, injectedProvider: false }),
    ).toEqual({ kind: "ios-in-app-browser" });
  });

  it("says nothing where a wallet has already announced itself", () => {
    // A wallet's in-app browser on iOS: a provider really is injected there,
    // the ordinary flow really does work, and a warning would be wrong.
    for (const userAgent of Object.values(UA)) {
      const path = connectPath({ userAgent, secureContext: true, injectedProvider: true });
      expect(path).toEqual({ kind: "injected" });
      expect(connectNotice(path)).toBeNull();
    }
  });

  it("says nothing on a desktop browser, where the modal's own copy is the answer", () => {
    const path = connectPath({
      userAgent: UA.desktopChrome,
      secureContext: true,
      injectedProvider: false,
    });
    expect(path).toEqual({ kind: "desktop" });
    expect(connectNotice(path)).toBeNull();
  });

  /*
   * The failure this whole module exists to prevent: a sentence saying a
   * path is open where the modal will not offer it. The adapter reports
   * `Unsupported` — and is filtered out of the modal — under exactly the
   * condition below, so a `workable` notice anywhere else would be the app
   * promising something the button cannot do.
   */
  it("never calls a path workable where the adapter reports itself unsupported", () => {
    for (const userAgent of Object.values(UA)) {
      for (const secureContext of [true, false]) {
        const env = { userAgent, secureContext, injectedProvider: false };
        const notice = connectNotice(connectPath(env));
        if (notice?.workable) expect(mobileWalletAdapterSupported(env)).toBe(true);
      }
    }
  });
});

describe("which chain a hand-off authorizes for", () => {
  it("names the cluster the app actually reads", () => {
    expect(mobileWalletChain("https://api.devnet.solana.com")).toBe("solana:devnet");
    expect(mobileWalletChain("https://api.testnet.solana.com")).toBe("solana:testnet");
    expect(mobileWalletChain("https://api.mainnet-beta.solana.com")).toBe("solana:mainnet");
  });

  /*
   * An unrecognised RPC host is not evidence of devnet. Guessing would mean
   * asking a wallet to authorize for a network this build is not reading,
   * and the signature that comes back would be against the wrong chain —
   * `solanaClusterOf` refuses the same guess for the same reason, and
   * `wallet-provider.tsx` offers no adapter at all on this answer.
   */
  it("refuses to guess a chain for an RPC host it cannot place", () => {
    expect(mobileWalletChain("https://rpc.example.com")).toBeNull();
    expect(mobileWalletChain("not a url")).toBeNull();
  });
});
