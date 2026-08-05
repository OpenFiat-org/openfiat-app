import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Wires the request-scoped i18n config (locale + messages) into every render.
// Points at the non-default location of that file; see i18n/request.ts.
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// This app is served from app.openfiat.network — that's DNS/hosting
// configuration, not application code, so no domain-specific logic lives here.
// BUILD_DIST_DIR is a verification convenience: it lets a production build
// coexist with a developer's `next dev` server (which owns ./.next).
const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir: process.env.BUILD_DIST_DIR || ".next",

  /*
   * The country index and its pages moved from /p2p to /countries and
   * /country/<slug>. Permanent redirects rather than deletions: every country
   * page is an indexed SEO surface, and /p2p links exist in the sitemap
   * already submitted.
   */
  async redirects() {
    return [
      { source: "/p2p", destination: "/countries", permanent: true },
      { source: "/p2p/:slug", destination: "/country/:slug", permanent: true },
    ];
  },
};

export default withNextIntl(nextConfig);
