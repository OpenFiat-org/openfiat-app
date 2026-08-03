"use client";

import { useEffect, useState } from "react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { useWallet } from "@solana/wallet-adapter-react";

import { connectNotice, connectPath, type ConnectNotice } from "@/lib/mobile-wallet";

/**
 * What the connect button can and cannot do in this browser, said out loud.
 *
 * # Why a button needs a paragraph
 *
 * On a phone the wallet modal has one honest outcome and it is not always
 * "connected". On Android there is a wallet app to hand off to; on iOS there
 * is not, and no amount of tapping produces one, because iOS has no Mobile
 * Wallet Adapter at all. A button that opens a modal listing nothing, or
 * offering only "Get a wallet", leaves an iOS reader with no way to tell
 * whether they did something wrong, whether the site is broken, or whether
 * the thing is simply impossible here.
 *
 * So this states which of the three it is, and — where the path is closed —
 * names the one that is open: the wallet's own in-app browser, where a
 * provider really is injected and the ordinary flow really does work.
 *
 * # Nothing is said when there is nothing to say
 *
 * A desktop browser, a browser with a wallet already reachable, and any
 * session that is already connected all get no note. The point is not to
 * decorate the button; it is to stop a connect flow that cannot work from
 * looking like one that can, and once there is a connection that question is
 * answered.
 *
 * It sits under the network banner rather than beside the button because the
 * bar is 44px tall on a phone and the shortest of these sentences does not
 * fit in it. Both bands are the same thing — a standing statement about what
 * this build is attached to.
 */
export function MobileConnectNote() {
  const { wallets, connected } = useWallet();
  const [notice, setNotice] = useState<ConnectNotice | null>(null);

  /*
   * Read after mount, never during render. `navigator` and
   * `window.isSecureContext` do not exist on the server, and a note that
   * differed between the server's HTML and the browser's first render would
   * be a hydration mismatch on every page carrying the nav.
   */
  useEffect(() => {
    /*
     * "A wallet is already reachable" is asked of the adapter's own
     * discovery rather than by sniffing `window.solana` — that global is one
     * wallet's, and several wallets that work here never set it. `Installed`
     * is precisely "this wallet has announced itself in this page", which is
     * what an in-app browser does and what an extension does.
     *
     * `Loadable` is deliberately not counted: the Mobile Wallet Adapter is
     * `Loadable` on Android, and treating it as an injected provider would
     * suppress the one note that explains what tapping it will do.
     */
    const injectedProvider = wallets.some(
      (wallet) => wallet.readyState === WalletReadyState.Installed,
    );
    setNotice(
      connectNotice(
        connectPath({
          userAgent: navigator.userAgent,
          secureContext: window.isSecureContext,
          injectedProvider,
        }),
      ),
    );
  }, [wallets]);

  if (notice === null || connected) return null;

  return (
    <div
      data-testid="mobile-connect-note"
      data-workable={notice.workable}
      className={`border-t ${
        // Red for a path that is closed, neutral for one that is open. The
        // difference is the whole message: one is an instruction, the other
        // is a dead end with a way round it.
        notice.workable
          ? "border-white/5 bg-white/[0.02]"
          : "border-red-400/15 bg-red-400/[0.06]"
      }`}
    >
      <p
        className={`mx-auto max-w-7xl px-4 py-1.5 text-center text-xs leading-relaxed ${
          notice.workable ? "text-gray-400" : "text-red-200/90"
        }`}
      >
        {notice.text}
      </p>
    </div>
  );
}
