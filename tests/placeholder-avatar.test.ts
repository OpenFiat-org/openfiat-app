import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { BRAND_HEX, placeholderAvatarUri } from "@/lib/placeholder-avatar";

const WALLET = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";

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
