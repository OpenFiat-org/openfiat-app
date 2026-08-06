"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { AssetLabel, TradeLimits } from "@/components/asset-label";
import { CopyButton } from "@/components/copy-button";
import { DataTable, Td, Th, Tr } from "@/components/data-table";
import { MetricStrip } from "@/components/metrics";
import { Panel } from "@/components/panel";
import { TradingRecord } from "@/components/merchants/trading-record";
import { WalletAvatar } from "@/components/wallet-avatar";
import { fetchAvatar } from "@/lib/avatar";
import { formatDateShortMs, formatNumber, shortAddress, sinceLabel } from "@/lib/format";
import {
  assetLabel,
  fetchAdsByMerchant,
  unpriceableLabel,
  type LiveAd,
} from "@/lib/live-advertisements";
import { fetchReviews, meanStars, type LiveReview } from "@/lib/live-reviews";
import { Stars } from "@/components/reviews/stars";
import { fetchMerchantName } from "@/lib/merchant-name";
import { NODE_CHANGED_EVENT, readNodeSelection } from "@/lib/node-preference";
import { addressForPeerId } from "@/lib/peer-id";

/**
 * One merchant, read from the node — advertisements, reviews, the trading
 * record, and whatever the wallet has published about itself.
 *
 * # What this replaced
 *
 * A fixture profile. `MERCHANTS` supplied the name, country, tier, staked
 * OPEN, identity level, 30-day volume, average ticket, "merchant age" and a
 * settlement speed; `reputationFor` scored eight dimensions out of 100;
 * `reviewsFor` supplied written testimony from people who did not exist; and
 * `adsForMerchant` priced their advertisements off a hardcoded FX table. The
 * route was statically prerendered for all of them and every id in it was
 * invented, so no real merchant had a profile at all and every profile shown
 * was of nobody.
 *
 * # What a real profile can say, and what it cannot
 *
 * A merchant is a wallet with an advertisement (`lib/live-merchants.ts`), so
 * this page is keyed by PeerId and everything on it is either a record the
 * node holds or a claim the wallet published about itself — labelled as such.
 *
 * Four things the old page showed are simply absent, because nothing in the
 * protocol answers them: a tier, a composite score, a country, and a
 * verification badge. `getReputation` returns counters, `ReputationProfile`'s
 * `tier()` is a method the crate marks as placeholder and never serializes,
 * no record carries a merchant's location, and a claim's verification status
 * is set by whoever published it. See `lib/live-merchants.ts` for the longer
 * argument; the short version is that all four would be this app's invention
 * wearing a protocol's authority.
 *
 * # Ratings and reviews are separate from the record, deliberately
 *
 * `getReviews` is kept out of `getReputation` by the node, and the two are
 * kept apart here: reputation is recomputed by every node from signed events
 * and cannot be talked up or down; a review is one counterparty's opinion.
 * They sit in different panels and say which is which.
 */

interface ProfileState {
  ads: LiveAd[];
  reviews: LiveReview[];
  name: string | null;
  avatarUrl: string | null;
  loading: boolean;
  error: string | null;
}

const EMPTY: ProfileState = {
  ads: [],
  reviews: [],
  name: null,
  avatarUrl: null,
  loading: true,
  error: null,
};

export function MerchantProfile({ peerId }: { peerId: string }) {
  const t = useTranslations("merchants");
  const [state, setState] = useState<ProfileState>(EMPTY);
  // The Ed25519 key inside the PeerId — extracted, never looked up. `null`
  // for a peer that is not an Ed25519 identity key, which has no Solana
  // address at all and must not be given a guessed one.
  const address = addressForPeerId(peerId);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const selection = readNodeSelection();
      setState({ ...EMPTY, loading: true });
      try {
        // The book first, on its own: it is the only read that decides
        // whether this wallet is a merchant at all, and a node that cannot
        // answer it leaves nothing worth rendering.
        const ads = await fetchAdsByMerchant(peerId);
        if (cancelled) return;

        // The rest are independent and individually optional — a wallet with
        // no reviews, no name and no avatar is the ordinary case, and one
        // failing read should not empty the page.
        const [reviews, name, avatar] = await Promise.all([
          fetchReviews(peerId).catch(() => []),
          address ? fetchMerchantName(address).catch(() => null) : Promise.resolve(null),
          address ? fetchAvatar(address).catch(() => null) : Promise.resolve(null),
        ]);
        if (cancelled) return;

        setState({
          ads,
          reviews,
          name: name?.name ?? null,
          avatarUrl: avatar?.url ?? null,
          loading: false,
          error: null,
        });
      } catch {
        if (!cancelled) {
          setState({
            ...EMPTY,
            loading: false,
            error: t("profileReadError", { label: selection.label }),
          });
        }
      }
    }

    void load();
    window.addEventListener(NODE_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(NODE_CHANGED_EVENT, load);
    };
  }, [peerId, address, t]);

  const { ads, reviews, name, avatarUrl, loading, error } = state;
  const live = ads.filter((ad) => ad.status !== "Deleted");
  const active = live.filter((ad) => ad.status === "Active");
  const stars = meanStars(reviews);
  const short = peerId.slice(-6);

  return (
    <section>
      <Link href="/merchants" className="text-sm text-gray-500 hover:text-white">
        {t("allMerchants")}
      </Link>

      <div className="mt-6 flex flex-wrap items-center gap-5">
        <WalletAvatar seed={peerId} src={avatarUrl} label={name ?? t("merchantLabel", { short })} size={56} />
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-white">
            {name ?? <span className="font-mono">…{short}</span>}
          </h1>
          {name && (
            /* Who is asserting it, on the same line as the name. A
               MerchantName claim is self-published and nothing verifies it
               — OFS-5000 §6/§8 — so a name shown without its source reads
               as a registration this network does not have. */
            <p className="mt-1 text-xs text-gray-500">
              {t("nameSelfPublished")}
            </p>
          )}
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="text-gray-600">{t("peerIdLabel")}</span>
              <span className="font-mono text-gray-400">…{short}</span>
              <CopyButton value={peerId} />
            </span>
            {address && (
              <span className="flex items-center gap-1.5">
                <span className="text-gray-600">{t("walletLabel")}</span>
                <Link
                  href={`/explorer/address/${address}`}
                  className="font-mono text-gray-400 hover:text-white"
                >
                  {shortAddress(address)}
                </Link>
                <CopyButton value={address} />
              </span>
            )}
          </p>
        </div>
      </div>

      {error && <p className="mt-6 text-sm text-amber-300">{error}</p>}

      <div className="mt-8">
        <MetricStrip
          items={[
            { label: t("metricAds"), value: loading ? "…" : String(live.length) },
            { label: t("metricActive"), value: loading ? "…" : String(active.length) },
            {
              label: t("metricPairsLabel"),
              value: loading
                ? "…"
                : String(new Set(live.map((ad) => `${assetLabel(ad)}/${ad.fiatCurrency}`)).size),
            },
            {
              label: t("metricReviews"),
              value: loading ? "…" : String(reviews.length),
              sub: stars === null ? t("noneOnNode") : t("starsAverage", { stars: stars.toFixed(1) }),
            },
            {
              label: t("metricFirstAdvertised"),
              value: loading || live.length === 0
                ? "—"
                : formatDateShortMs(Math.min(...live.map((ad) => ad.createdAt))),
            },
          ]}
        />
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
            {t("advertisements")}
          </h2>
          <div className="mt-3">
            <DataTable
              minWidth={860}
              head={
                <tr>
                  <Th>{t("colDirection")}</Th>
                  <Th>{t("colPair")}</Th>
                  <Th right>{t("colPrice")}</Th>
                  <Th right>{t("colLimits")}</Th>
                  <Th right>{t("colLiquidity")}</Th>
                  <Th>{t("colPayment")}</Th>
                  <Th right>{t("colStatus")}</Th>
                </tr>
              }
            >
              {live.map((ad) => (
                <AdRow key={ad.id} ad={ad} />
              ))}
              {live.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-500">
                    {loading
                      ? t("readingBook")
                      : error
                        ? t("nothingToShow")
                        : t("profileNoAds")}
                  </td>
                </tr>
              )}
            </DataTable>
          </div>

          <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-gray-400">
            {t("whatCounterpartiesSaid")}
          </h2>
          <Reviews reviews={reviews} loading={loading} />
        </div>

        <div className="space-y-8">
          <Panel>
            <div className="px-4 py-4">
              <TradingRecord peerId={peerId} />
            </div>
          </Panel>
        </div>
      </div>
    </section>
  );
}

function AdRow({ ad }: { ad: LiveAd }) {
  const t = useTranslations("merchants");
  const L = useTranslations("lifecycle");
  const A = useTranslations("ads");
  return (
    <Tr>
      <Td className={ad.direction === "Sell" ? "text-emerald-400" : "text-orange-400"}>
        {L(ad.direction)}
      </Td>
      <Td className="text-gray-300">
        <AssetLabel ad={ad} />/{ad.fiatCurrency}
      </Td>
      <Td right num className="text-gray-200">
        {/* `null` means the NODE could not resolve a price and said why. */}
        {ad.price === null ? (
          <span className="text-xs text-gray-500">
            {ad.pricingKind === "Floating"
              ? unpriceableLabel(ad.unpriceableReason ?? "NoOracleData")
              : t("unpriced")}
          </span>
        ) : (
          <>
            {formatNumber(ad.price)}
            <span className="block text-[11px] text-gray-600">
              {ad.pricingKind === "Floating"
                ? A("floating", { sign: ad.premiumBps !== null && ad.premiumBps >= 0 ? "+" : "", pct: ad.premiumBps !== null ? ad.premiumBps / 100 : 0 })
                : A("fixed")}
            </span>
          </>
        )}
      </Td>
      <Td right className="text-gray-400">
        <TradeLimits ad={ad} />
      </Td>
      <Td right num className="text-gray-300">
        {formatNumber(ad.availableLiquidity)} <AssetLabel ad={ad} />
      </Td>
      <Td className="text-xs text-gray-400">
        {ad.paymentMethods.length === 0 ? (
          <span className="text-gray-600">{t("noneNamed")}</span>
        ) : (
          <span className="flex flex-col gap-1">
            {ad.paymentMethodLabels.map((method) => (
              <span key={method} className="border-l-2 border-amber-400/60 pl-1.5">
                {method}
              </span>
            ))}
          </span>
        )}
      </Td>
      <Td right>
        {ad.status === "Active" ? (
          <Link
            href={`/orders/new?ad=${ad.id}`}
            className="inline-block whitespace-nowrap rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-hover"
          >
            {t("tradeBtn")}
          </Link>
        ) : (
          <span className="text-xs text-gray-500">{A(`status.${ad.status}`)}</span>
        )}
      </Td>
    </Tr>
  );
}

/**
 * The reviews panel.
 *
 * No author, no trade, and a date rather than a time — that is the shape the
 * node hands over and this must not dress it up. A row saying "7xKm…9fQ2
 * bought on 26 July at 09:14" would name a person and a trade the node
 * deliberately withheld, which is how the fixture this replaced rendered
 * every one of its invented reviews.
 */
function Reviews({ reviews, loading }: { reviews: LiveReview[]; loading: boolean }) {
  const t = useTranslations("merchants");
  if (loading) return <p className="mt-3 text-sm text-gray-500">{t("recReading")}</p>;

  if (reviews.length === 0) {
    return (
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-500">
        {t("noReviews")}
      </p>
    );
  }

  return (
    <>
      <ul className="mt-3 space-y-3">
        {reviews.map((review, index) => (
          <li
            key={`${review.createdOn}-${index}`}
            className="rounded-md border border-white/10 px-4 py-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <Stars stars={review.stars} />
              <span className="text-xs text-gray-600" title={sinceLabel(review.createdOn)}>
                {formatDateShortMs(review.createdOn)}
              </span>
            </div>
            {review.comment.trim().length > 0 && (
              <p className="mt-2 text-sm leading-relaxed text-gray-300">{review.comment}</p>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 max-w-2xl text-xs leading-relaxed text-gray-600">
        {t("reviewsFooter")}
      </p>
    </>
  );
}
