import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { BRAND_HEX, CHASSIS_HEX, placeholderAvatarUri } from "@/lib/placeholder-avatar";

const WALLET = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";

/** WCAG 2.1 relative luminance of a bare six-digit hex. */
function luminance(hex: string): number {
  const channel = (offset: number) => {
    const srgb = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter! + 0.05) / (darker! + 0.05);
}

describe("the placeholder avatar", () => {
  /*
   * The whole point of generating rather than fetching: a wallet's robot is a
   * pure function of its key, so it is the same on every device, every visit
   * and every page, with no request and nothing cached across sessions.
   */
  it("draws the same robot for the same wallet, every time", () => {
    expect(placeholderAvatarUri(WALLET)).toBe(placeholderAvatarUri(WALLET));
  });

  it("draws a different robot for a different wallet", () => {
    expect(placeholderAvatarUri(WALLET)).not.toBe(placeholderAvatarUri(`${WALLET}x`));
  });

  /*
   * A seed differing by one character must not collide. Cheap to check and
   * the failure would be quiet — two merchants sharing a face in an order
   * book is exactly the confusion this is supposed to remove.
   */
  it("does not collapse near-identical seeds onto one robot", () => {
    const drawings = new Set(
      ["aaa1", "aaa2", "aaa3", "aab1", "baa1"].map((seed) => placeholderAvatarUri(seed)),
    );
    expect(drawings.size).toBe(5);
  });

  /*
   * Generated in process, not requested. A `data:` URI is markup the browser
   * already has; anything else here would mean every avatar on screen had
   * become a report to a third party about which wallets this visitor is
   * looking at.
   *
   * The SVG's own `xmlns` and DiceBear's attribution metadata are http URLs
   * and always will be — they are namespace and licence identifiers, not
   * things a browser fetches — so the check is that the image itself is
   * self-contained and that api.dicebear.com is nowhere in it.
   */
  it("is a self-contained data URI and never a remote request", () => {
    const uri = placeholderAvatarUri(WALLET);
    expect(uri.startsWith("data:image/svg+xml")).toBe(true);
    expect(uri).not.toContain("dicebear.com");
    const svg = decodeURIComponent(uri);
    expect(svg).not.toMatch(/(href|src)\s*=\s*"https?:/i);
  });

  /*
   * The brand hexes are duplicated out of `app/globals.css` because the
   * avatar is generated during server rendering, where there is no document
   * to read custom properties from. That duplication is only safe if it
   * cannot drift, which is what this checks: globals.css stays the source of
   * truth and this test fails the moment the copy stops matching it.
   */
  it("uses the brand colours exactly as app/globals.css defines them", () => {
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    const declared = (name: string) => {
      const match = css.match(new RegExp(`--color-${name}:\\s*#([0-9a-fA-F]{6})`));
      expect(match, `--color-${name} is missing from app/globals.css`).not.toBeNull();
      return match![1]!.toLowerCase();
    };
    expect(BRAND_HEX.brand).toBe(declared("brand"));
    expect(BRAND_HEX.brandHover).toBe(declared("brand-hover"));
    expect(BRAND_HEX.brandTeal).toBe(declared("brand-teal"));
  });

  /*
   * The defect behind #164, as an assertion.
   *
   * The chassis used to be `--color-brand-hover` painted onto a background
   * starting at `--color-brand`. Both are brand blues and the pair came to
   * 1.5:1, so the robot's silhouette had nothing to separate it from its own
   * disc, and at the 20–32px a table row gives it there was nothing left to
   * see. Every colour here is still the brand's, so the same mistake is easy
   * to make again by "simplifying" the chassis back to a palette constant —
   * which is why the floor is checked rather than the hex.
   *
   * 2.5 rather than a WCAG text threshold: this is a drawing, not type, and
   * the failure being guarded against is a silhouette that vanishes, not one
   * that is tiring to read.
   */
  it("draws the robot in a colour that separates it from its own background", () => {
    expect(contrast(CHASSIS_HEX, BRAND_HEX.brand)).toBeGreaterThan(2.5);
    expect(decodeURIComponent(placeholderAvatarUri(WALLET))).toContain(`#${CHASSIS_HEX}`);
  });

  /*
   * The chassis is derived from the brand rather than picked, so a palette
   * change carries into the avatar instead of leaving it behind. Checking the
   * relationship rather than the value keeps `app/globals.css` the only place
   * a brand colour is chosen — restating the mix here would just be a second
   * copy of the implementation, and a second thing to update.
   */
  it("tints the chassis from the brand rather than introducing a colour", () => {
    for (const offset of [0, 2, 4]) {
      const source = Number.parseInt(BRAND_HEX.brandHover.slice(offset, offset + 2), 16);
      const tinted = Number.parseInt(CHASSIS_HEX.slice(offset, offset + 2), 16);
      expect(tinted).toBeGreaterThanOrEqual(source);
      expect(tinted).toBeLessThanOrEqual(0xff);
    }
    expect(Object.values(BRAND_HEX)).not.toContain(CHASSIS_HEX);
  });

  /*
   * DiceBear's bottts embeds its attribution and licence in an RDF metadata
   * block. It stays in the output — stripping it to save a few hundred bytes
   * would be removing someone's attribution from their own artwork.
   */
  it("keeps DiceBear's attribution in the generated markup", () => {
    const svg = decodeURIComponent(placeholderAvatarUri(WALLET));
    expect(svg).toContain("Pablo Stanley");
    expect(svg).toContain("<metadata");
  });
});
