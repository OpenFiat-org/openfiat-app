import type { NextConfig } from "next";

// This app is served from app.openfiat.network — that's DNS/hosting
// configuration, not application code, so no domain-specific logic lives here.
// BUILD_DIST_DIR is a verification convenience: it lets a production build
// coexist with a developer's `next dev` server (which owns ./.next).
const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir: process.env.BUILD_DIST_DIR || ".next",
};

export default nextConfig;
