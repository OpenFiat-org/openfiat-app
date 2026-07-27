"use client";

import { useState } from "react";
import { AssetIcon } from "@/components/asset-icon";
import { formatNumber } from "@/lib/format";

/**
 * A two-way converter at the top of a pair page.
 *
 * The reason it exists is the search that brought someone here: "convert 500
 * USDT to KES" is a question with a number in it, and a page that answers only
 * "1 USDT = 131.40 KES" makes them do the multiplication. Both directions,
 * because half of them are asking the other way round.
 *
 * It converts at the oracle mid and says so. An advertiser's price is above or
 * below that, so this is an estimate — presenting it as the amount they will
 * receive would be a figure no offer on the page actually matches.
 */
export function PairConverter({
  asset,
  currency,
  rate,
}: {
  asset: string;
  currency: string;
  rate: number;
}) {
  const [cryptoText, setCryptoText] = useState("100");
  const [fiatText, setFiatText] = useState(formatNumber(100 * rate, 2));

  function onCrypto(next: string) {
    const clean = next.replace(/[^\d.]/g, "");
    setCryptoText(clean);
    const n = Number(clean);
    setFiatText(n > 0 ? (n * rate).toFixed(2) : "");
  }

  function onFiat(next: string) {
    const clean = next.replace(/[^\d.]/g, "");
    setFiatText(clean);
    const n = Number(clean);
    setCryptoText(n > 0 ? (n / rate).toFixed(4) : "");
  }

  return (
    <div className="rounded-md border border-white/10 p-4">
      <label className="block">
        <span className="text-xs text-gray-500">You have</span>
        <span className="mt-1 flex items-center gap-2">
          <input
            type="text"
            inputMode="decimal"
            value={cryptoText}
            onChange={(e) => onCrypto(e.target.value)}
            aria-label={`Amount in ${asset}`}
            className="min-w-0 flex-1 bg-transparent text-xl tabular-nums text-white outline-none"
          />
          <AssetIcon asset={asset} size={18} />
          <span className="shrink-0 text-sm font-medium text-gray-300">{asset}</span>
        </span>
      </label>

      <label className="mt-3 block border-t border-white/10 pt-3">
        <span className="text-xs text-gray-500">You get, roughly</span>
        <span className="mt-1 flex items-center gap-2">
          <input
            type="text"
            inputMode="decimal"
            value={fiatText}
            onChange={(e) => onFiat(e.target.value)}
            aria-label={`Amount in ${currency}`}
            className="min-w-0 flex-1 bg-transparent text-xl tabular-nums text-white outline-none"
          />
          <span className="shrink-0 text-sm font-medium text-gray-300">{currency}</span>
        </span>
      </label>

      <p className="mt-3 text-[11px] leading-relaxed text-gray-500">
        At the oracle mid of {formatNumber(rate)} {currency}. Advertisers price above or below it, so
        the figure on the offer you accept is the one that counts.
      </p>
    </div>
  );
}
