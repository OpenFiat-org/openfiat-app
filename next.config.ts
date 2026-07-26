import type { NextConfig } from "next";

// This app is served from two custom domains (app.openfiat.org and
// openfiat.allenhark.com) pointed at the same deployment — that's DNS/hosting
// configuration, not application code, so no domain-specific logic lives here.
const nextConfig: NextConfig = { reactStrictMode: true };

export default nextConfig;
