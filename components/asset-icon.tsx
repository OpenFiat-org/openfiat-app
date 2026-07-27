import Image from "next/image";

/** OPEN is our own token, so its mark is the site logo rather than an
 *  issuer's coin art under /currencies. */
const OPEN_MARK = "/logo-mark.png";

/**
 * Asset mark. Issuer coin art for stablecoins and SOL; the OpenFiat logo for
 * OPEN.
 *
 * OPEN is drawn bare — no circular field and no rounding. The logo is a wide
 * mark on a transparent square, and enclosing it in a disc to match the coin
 * icons around it makes it read as a third-party token rather than as ours.
 */
export function AssetIcon({ asset, size = 18 }: { asset: string; size?: number }) {
  const isOpen = asset.toUpperCase() === "OPEN";

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
