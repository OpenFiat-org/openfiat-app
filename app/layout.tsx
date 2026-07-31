import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { TopNav } from "@/components/top-nav";
import { AppWalletProvider } from "@/components/wallet/wallet-provider";
import { Footer } from "@/components/footer";
import { NetworkNotice } from "@/components/network-notice";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jbmono", display: "swap" });

/*
 * Every description here said "escrow enforced by audited Solana programs".
 * No external audit has been performed. OFS-4200 §Status puts one ahead of
 * mainnet as a gate — "Mainnet deployment is a separate future phase gated on
 * an external security audit" — so the programs are pre-audit by the
 * specification's own account, and `components/top-nav.tsx` already tells
 * visitors they are unaudited.
 *
 * The word is dropped rather than softened. "Audited" is the single strongest
 * safety signal a protocol can put next to the word escrow, and this is
 * metadata: it is what a search result shows and what an OpenGraph card
 * carries into a timeline, read by people who will never see the banner that
 * contradicts it. What is left is true — escrow is enforced on chain and
 * OpenFiat takes custody of nothing — and that was always the load-bearing
 * part of the sentence.
 */
export const metadata: Metadata = {
  metadataBase: new URL("https://app.openfiat.network"),
  title: { default: "OpenFiat — P2P Stablecoin Exchange", template: "%s · OpenFiat" },
  description:
    "Buy and sell stablecoins for local fiat on OpenFiat — the decentralized P2P marketplace protocol with escrow enforced by Solana programs.",
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
  /*
   * There was no openGraph or twitter metadata anywhere in the app, so every
   * link shared from it previewed as a bare URL — no title, no description, no
   * image. Declared once here and inherited by every route; a route with its
   * own opengraph-image overrides only the image.
   */
  openGraph: {
    type: "website",
    siteName: "OpenFiat",
    locale: "en",
    url: "/",
    title: "OpenFiat — P2P Stablecoin Exchange",
    description:
      "Buy and sell stablecoins for local fiat on OpenFiat — the decentralized P2P marketplace protocol with escrow enforced by Solana programs.",
  },
  twitter: {
    card: "summary_large_image",
    title: "OpenFiat — P2P Stablecoin Exchange",
    description:
      "Buy and sell stablecoins for local fiat, peer to peer. Escrow enforced by Solana programs; disputes decided by staked arbitrators.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen antialiased">
        {/* Wraps everything: the nav's connect button and every signing
            surface below it read the same adapter state. */}
        <AppWalletProvider>
          <TopNav />
          {/*
            * Full width, and the only thing that clips horizontally. It exists
            * so `PageHero`'s `w-screen` escape has something to be trimmed
            * against — 100vw exceeds the document width by the scrollbar on
            * platforms that reserve space for one. The nav and footer sit
            * outside it on purpose: see `.full-bleed-clip` in
            * `app/globals.css` for what putting this on `body` cost.
            */}
          <div className="full-bleed-clip">
            <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
          </div>
          <Footer />
          <NetworkNotice />
        </AppWalletProvider>
      </body>
    </html>
  );
}
