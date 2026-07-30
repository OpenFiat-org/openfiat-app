import { AssetIcon } from "@/components/asset-icon";
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
  const symbol = ad.assetSymbol;
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
