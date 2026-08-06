"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { fetchAdvertisements, type LiveAd } from "@/lib/live-advertisements";
import { formatNumber } from "@/lib/format";

/**
 * Where this price would sit in the book that already exists.
 *
 * # Why it is here
 *
 * Bybit shows an estimated ad ranking as a merchant types a price, and it is
 * the single most useful thing on that screen: a price is meaningless
 * without the prices it competes with, and a merchant who cannot see them
 * posts either an advertisement nobody takes or one that leaves money on the
 * table. We have the whole order book over one RPC call, so the honest
 * version of that hint is exact rather than estimated — this is not a
 * ranking model, it is a count.
 *
 * # What it deliberately does not do
 *
 * It does not rank a floating advertisement. A floating quote resolves
 * against an oracle mid this screen never reads, so the number a buyer would
 * see cannot be computed here, and putting a position on it would mean
 * inventing the mid. What *can* be stated about a floating ad is what other
 * floating ads in the same market declare as their premium, which is on the
 * record and is shown instead.
 *
 * Empty and unreachable render differently, as everywhere else in this app.
 * A market with no competitors is a fact a merchant should act on; a failed
 * request is not.
 */

type BookState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; ads: LiveAd[] };

export function PricePosition({
  assetSymbol,
  assetLabel,
  fiat,
  direction,
  pricingType,
  price,
  premium,
}: {
  /**
   * The node's own spelling of the asset's ticker, or `null` if unnamed.
   *
   * This is the *matching* identity and nothing else: the book below is
   * filtered on `ad.assetSymbol`, which the node resolved from each
   * advertisement's mint, so both sides of that comparison have to be the
   * node's spelling. Passing the on-screen name here instead would silently
   * empty the market for the native mint — the node calls it `wSOL` and
   * `"SOL" === "wSOL"` is never true — and the merchant would be told they
   * are the only advertiser in a corridor full of them.
   */
  assetSymbol: string | null;
  /** What to call it in the sentence. `null` falls back to "this token". */
  assetLabel: string | null;
  fiat: string;
  /** The MERCHANT's direction, as the record carries it. */
  direction: "Buy" | "Sell";
  pricingType: "Fixed" | "Floating";
  price: number;
  premium: number;
}) {
  const t = useTranslations("ads");
  const [book, setBook] = useState<BookState>({ status: "loading" });

  useEffect(() => {
    let live = true;
    setBook({ status: "loading" });
    void fetchAdvertisements()
      .then((ads) => live && setBook({ status: "ready", ads }))
      .catch(() => live && setBook({ status: "error" }));
    return () => {
      live = false;
    };
  }, []);

  if (book.status === "loading") {
    return <p className="text-xs text-gray-500">{t("ppLoading")}</p>;
  }

  if (book.status === "error") {
    return (
      <p className="text-xs text-gray-500">
        {t("ppError")}
      </p>
    );
  }

  // The same side of the market: a merchant selling competes with other
  // merchants selling, not with the buyers taking them.
  const market = book.ads.filter(
    (ad) =>
      ad.status === "Active" &&
      ad.direction === direction &&
      ad.fiatCurrency === fiat &&
      // `null` on both sides matches nothing, which is right: an ad whose
      // mint this node cannot name is in no ticker market at all.
      assetSymbol !== null &&
      ad.assetSymbol === assetSymbol,
  );

  if (market.length === 0) {
    return (
      <p className="text-xs text-emerald-300/90">
        {t("ppOnly", {
          asset: assetLabel ?? t("thisToken"),
          fiat,
          side: direction === "Sell" ? t("ppSideSell") : t("ppSideBuy"),
        })}
      </p>
    );
  }

  if (pricingType === "Floating") {
    const premiums = market
      .filter((ad) => ad.pricingKind === "Floating" && ad.premiumBps !== null)
      .map((ad) => ad.premiumBps! / 100);
    if (premiums.length === 0) {
      return (
        <p className="text-xs text-gray-500">
          {t("ppAllFixed", { count: market.length })}
        </p>
      );
    }
    const low = Math.min(...premiums);
    const high = Math.max(...premiums);
    return (
      <p className="text-xs text-gray-400">
        {t.rich("ppFloatingRange", {
          count: premiums.length,
          low: `${low >= 0 ? "+" : ""}${low.toFixed(2)}%`,
          high: `${high >= 0 ? "+" : ""}${high.toFixed(2)}%`,
          mine: `${premium >= 0 ? "+" : ""}${premium}%`,
          muted: (chunks) => <span className="text-gray-600">{chunks}</span>,
        })}
      </p>
    );
  }

  const priced = market.filter((ad) => ad.price !== null);
  if (priced.length === 0 || !(price > 0)) {
    return (
      <p className="text-xs text-gray-500">
        {t("ppNonePriceable", { count: market.length })}
      </p>
    );
  }

  /*
   * Better means cheaper for a merchant selling — the taker is buying and
   * takes the lowest price — and dearer for one buying. Getting this
   * inversion wrong would tell half of all merchants the exact opposite of
   * the truth, which is worse than showing nothing.
   */
  const better =
    direction === "Sell"
      ? priced.filter((ad) => ad.price! < price).length
      : priced.filter((ad) => ad.price! > price).length;
  const best =
    direction === "Sell"
      ? Math.min(...priced.map((ad) => ad.price!))
      : Math.max(...priced.map((ad) => ad.price!));

  return (
    <p className="text-xs text-gray-400">
      {t.rich("ppRanked", {
        rank: better + 1,
        total: priced.length + 1,
        price: formatNumber(price),
        fiat,
        bestLabel: direction === "Sell" ? t("ppOffer") : t("ppBid"),
        best: formatNumber(best),
        strong: (chunks) => (
          <span className={better === 0 ? "text-emerald-300" : "text-gray-200"}>{chunks}</span>
        ),
        muted: (chunks) => <span className="text-gray-600">{chunks}</span>,
      })}
    </p>
  );
}
