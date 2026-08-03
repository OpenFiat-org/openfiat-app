import { AssetIcon } from "@/components/asset-icon";
import { tradingSymbol } from "@/lib/asset-display";
import { formatNumber } from "@/lib/format";
import { assetLabel } from "@/lib/live-advertisements";
import type { LiveAd } from "@/lib/live-advertisements";

/**
 * The token an advertisement is denominated in, named the only way this app
 * is entitled to name it.
 *
 * An advertisement carries a mint address and no ticker (OFS-2100, after
 * `asset_mint` replaced `asset`), because a ticker on a record is a label the
 * merchant chose and is tied to the token the escrow moves by nothing at all.
 * The name a reader sees is resolved from the mint by the node answering the
 * call, from a table every node compiles in identically — and when this build
 * of the node has no name for a mint, `asset_symbol` comes back `null`.
 *
 * `null` renders as the address. That is deliberately unhelpful and true
 * rather than helpful and false: there is no placeholder, no dash, and no
 * suppressing the row, because all three would hide which token a buyer is
 * about to be paid in. It exists as one component so the fallback cannot
 * drift into a guess at one call site while staying honest at the others.
 *
 * The mint is always in `title`, symbol or not. The symbol is a nickname
 * somebody applied to the address; the address is the fact underneath it, and
 * a reader who wants to check which USDC this is should not have to leave the
 * row.
 */
export function AssetLabel({
  ad,
  /** Draw the issuer's coin mark beside the name, where one exists. */
  icon = false,
  className = "",
}: {
  ad: Pick<LiveAd, "assetMint" | "assetSymbol">;
  icon?: boolean;
  className?: string;
}) {
  // The name as a trader reads it, which is also what decides whether there
  // is coin art: the node calls the native mint `wSOL` and this repo ships
  // `sol.png`, so mapping the name and not the mark would leave the one
  // asset everybody recognises as the only unmarked row. See `assetLabel`.
  const symbol = tradingSymbol(ad.assetMint, ad.assetSymbol);
  return (
    <span title={ad.assetMint} className={`inline-flex items-baseline gap-1.5 ${className}`}>
      {/* No art for an address. Coin art is a claim about which token this
          is, and there is none to make about a mint nobody has named. */}
      {icon && symbol ? <AssetIcon asset={symbol} size={16} /> : null}
      <span className={symbol ? undefined : "font-mono text-[0.9em] [overflow-wrap:anywhere]"}>
        {assetLabel(ad)}
      </span>
    </span>
  );
}

/**
 * An advertisement's `minTrade`–`maxTrade` band, in the token it is in.
 *
 * These bounds are denominated in the ASSET, not in the advertisement's
 * fiat currency — see `LiveAd.minTrade`. That was got wrong in opposite
 * directions on two screens because both renderings look equally sane: at
 * a KES/USDC rate near 129, "50" is a believable minimum in either unit,
 * and only the record's contract says which one is a lie. So the band is
 * rendered in one place, through `AssetLabel`, and nowhere reaches for
 * `formatFiat` with these numbers.
 *
 * Two decimals rather than none. A minimum of 0.5 SOL is a real
 * advertisement, and rounding it to "1" on the way to the screen shows a
 * band the merchant never offered.
 */
export function TradeLimits({
  ad,
  className = "",
}: {
  ad: Pick<LiveAd, "assetMint" | "assetSymbol" | "minTrade" | "maxTrade">;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-baseline gap-1.5 tabular-nums ${className}`}>
      <span>
        {formatNumber(ad.minTrade)} – {formatNumber(ad.maxTrade)}
      </span>
      <AssetLabel ad={ad} />
    </span>
  );
}
