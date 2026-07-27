/**
 * Shared pieces for generated Open Graph cards.
 *
 * The app had no OG metadata and no card generation at all, so every link
 * shared from it — a country market, a merchant, a dispute — previewed as a
 * bare URL. Cards are generated per route with `next/og` rather than shipped as
 * static images, because the useful thing to show is the page's own content:
 * which country, which currency, which merchant.
 */

export const OG_SIZE = { width: 1200, height: 630 };

export const BRAND = {
  bg: "#0a0e14",
  panel: "#10151d",
  line: "rgba(255,255,255,0.10)",
  blue: "#0070f8",
  blueLight: "#2b8fff",
  teal: "#00b098",
  text: "#f4f6f8",
  muted: "#8b95a3",
  faint: "#5c6673",
};

/**
 * A country flag emoji cannot be drawn by `next/og` without bundling an emoji
 * font — Satori has no glyph for regional indicator pairs and would render
 * tofu. The two letters of the ISO code in a tinted plate carry the same
 * information and always render.
 */
export function flagPlateLetters(countryCode: string): string {
  return countryCode.slice(0, 2).toUpperCase();
}
