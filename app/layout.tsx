import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { TopNav } from "@/components/top-nav";
import { AppWalletProvider } from "@/components/wallet/wallet-provider";
import { Footer } from "@/components/footer";
import { SimulatedBadge } from "@/components/simulated-badge";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jbmono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://app.openfiat.network"),
  title: { default: "OpenFiat — P2P Stablecoin Exchange", template: "%s · OpenFiat" },
  description:
    "Buy and sell stablecoins for local fiat on OpenFiat — the decentralized P2P marketplace protocol with escrow enforced by audited Solana programs.",
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
      "Buy and sell stablecoins for local fiat on OpenFiat — the decentralized P2P marketplace protocol with escrow enforced by audited Solana programs.",
  },
  twitter: {
    card: "summary_large_image",
    title: "OpenFiat — P2P Stablecoin Exchange",
    description:
      "Buy and sell stablecoins for local fiat, peer to peer. Escrow enforced by audited Solana programs; disputes decided by staked arbitrators.",
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
          <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
          <Footer />
          <SimulatedBadge />
        </AppWalletProvider>
      </body>
    </html>
  );
}
