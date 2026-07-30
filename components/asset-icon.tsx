import Image from "next/image";

/** OPEN is our own token, so its mark is the site logo rather than an
 *  issuer's coin art under /currencies. */
const OPEN_MARK = "/logo-mark.png";

/**
 * The marks that actually exist under `/public/currencies`.
 *
 * Not a list of tokens the app believes in — a list of files it ships. The
 * symbols reaching this component are now whatever a node resolved a mint to
 * (see `components/asset-label.tsx`), which includes names this repo has no
 * art for: the devnet table alone answers `tUSDC` and `wSOL`. Without this
 * check each of those requested a PNG that is not there and rendered as a
 * broken image, which reads as a failure rather than as "no logo".
 */
const MARKS = new Set(["sol", "usd1", "usdc", "usdt"]);

/**
 * Asset mark. Issuer coin art for stablecoins and SOL; the OpenFiat logo for
 * OPEN.
 *
 * OPEN is drawn bare — no circular field and no rounding. The logo is a wide
 * mark on a transparent square, and enclosing it in a disc to match the coin
 * icons around it makes it read as a third-party token rather than as ours.
 *
 * Returns nothing for a name with no mark. A missing logo is not worth a
 * placeholder glyph: the name is right there beside it.
 */
export function AssetIcon({ asset, size = 18 }: { asset: string; size?: number }) {
  const isOpen = asset.toUpperCase() === "OPEN";
  if (!isOpen && !MARKS.has(asset.toLowerCase())) return null;

  return (
    <Image
      src={isOpen ? OPEN_MARK : `/currencies/${asset.toLowerCase()}.png`}
      alt={asset}
      width={size}
      height={size}
      className={isOpen ? "shrink-0" : "shrink-0 rounded-full"}
    />
  );
}
