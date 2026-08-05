import type { ReactNode } from "react";

/**
 * Root passthrough.
 *
 * Next requires a layout at the `app/` root, but with locale-prefixed routing
 * the real document — `<html>`, `<body>`, fonts, providers — lives one level
 * down in `app/[locale]/layout.tsx`, because `<html lang>` and `<html dir>` are
 * per-locale and cannot be fixed here. This file exists only to satisfy that
 * requirement and hand every request straight to the locale layout.
 *
 * It intentionally renders no `<html>`/`<body>` of its own; doing so here would
 * produce two of each. Non-page roots that also live at `app/` — `sitemap.ts`,
 * `robots.ts`, the `/api` routes — are unaffected by this and are served once,
 * canonically, never per locale.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
