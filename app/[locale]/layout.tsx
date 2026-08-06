import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import "../globals.css";
import { TopNav } from "@/components/top-nav";
import { AppWalletProvider } from "@/components/wallet/wallet-provider";
import { Footer } from "@/components/footer";
import { localeDir } from "@/i18n/locales";
import { routing } from "@/i18n/routing";
import { SITE_ORIGIN, alternatesFor, localePath } from "@/lib/seo";

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
 * contradicts it.
 *
 * Per-locale titles/descriptions and `hreflang` alternates are layered on in a
 * later phase; this base metadata is inherited by every route as before.
 */
/**
 * Base metadata, now per-locale: `og:locale` reflects the active language and
 * the home page carries its full `hreflang` set, so a link shared from `/es`
 * previews as Spanish and search engines learn the site's home exists in all
 * 27 languages. Inherited by every route; a route with its own
 * `generateMetadata` (the country pages) layers its canonical over this.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "siteMeta" });
  return {
    metadataBase: new URL(SITE_ORIGIN),
    title: { default: t("title"), template: "%s · OpenFiat" },
    description: t("description"),
    icons: {
      icon: [
        { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
        { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
        { url: "/favicon.ico", sizes: "any" },
      ],
      apple: "/apple-touch-icon.png",
    },
    manifest: "/site.webmanifest",
    alternates: alternatesFor("", locale),
    openGraph: {
      type: "website",
      siteName: "OpenFiat",
      locale,
      url: localePath("", locale),
      title: t("title"),
      description: t("description"),
    },
    twitter: {
      card: "summary_large_image",
      title: t("title"),
      description: t("twitterDescription"),
    },
  };
}

/**
 * Pre-render one copy of the tree per locale at build time. Without this every
 * localized page would be forced dynamic, which for a mostly-static
 * marketing/marketplace surface would throw away the SSG the app already
 * depends on for SEO.
 */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // A path segment that is not a real locale reaches here only if it slipped
  // past the middleware (e.g. a hand-typed `/xx/…`). 404 rather than render an
  // untranslated page under a bogus `lang`.
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  // Opt this request into static rendering for `locale` — required whenever a
  // layout reads the locale before calling into `next-intl` on a statically
  // rendered page.
  setRequestLocale(locale);

  return (
    <html
      lang={locale}
      dir={localeDir(locale)}
      className={`${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen antialiased">
        {/* Messages for the active locale are provided to every client
            component below; server components read them via `getTranslations`
            and need no provider. */}
        <NextIntlClientProvider>
          {/* Wraps everything: the nav's connect button and every signing
              surface below it read the same adapter state. */}
          <AppWalletProvider>
            <TopNav />
            {/*
              * Full width, and the only thing that clips horizontally. It exists
              * so `PageHero`'s `w-screen` escape has something to be trimmed
              * against — 100vw exceeds the document width by the scrollbar on
              * platforms that reserve space for one.
              */}
            <div className="full-bleed-clip">
              <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
            </div>
            <Footer />
          </AppWalletProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
