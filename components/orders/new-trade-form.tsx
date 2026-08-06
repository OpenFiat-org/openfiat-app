import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  assetLabel,
  type LiveAd,
  unpriceableLabel,
} from "@/lib/live-advertisements";
import { formatCrypto, formatFiat, formatNumber } from "@/lib/format";
import { TradeLimits } from "@/components/asset-label";
import { Panel } from "@/components/panel";
import { PlaceOrder } from "@/components/orders/place-order";

/**
 * A real advertisement's review page, and the place an order is actually
 * placed.
 *
 * This used to be `NewTradeForm`: an amount input that, on submit, minted a
 * `TRD-DEMO<n>` id client-side and pushed to a trade room synthesized from
 * the query string — no reservation was ever sent anywhere, and the trade
 * room it landed on then rendered fabricated payment details (a phone
 * number, an IBAN, a bank name and address, all deterministically generated
 * from the trade id) and fabricated settlement/escrow transaction
 * signatures, both presented as real. Someone sending real fiat to that
 * fabricated bank/mobile-money account, or checking that fabricated
 * signature as proof funds moved, would have been acting on values nobody
 * ever recorded. Both are gone rather than carried forward onto real ads.
 *
 * It then became a review page that said plainly it could not submit
 * anything. It can now: `components/orders/place-order.tsx` signs the real
 * `ReservationRequest` (OFS-2200 §11) and the `SettlementInitiate` that
 * follows it, and the notice that stood here is gone with the gap it
 * described.
 *
 * # The amount is in the asset, and arrives that way
 *
 * The order panel hands over `asset`, not a fiat total. Both were once
 * plausible readings of the same query parameter, and the reservation's
 * `amount` is denominated in the asset — so converting a fiat figure here
 * would divide by a displayed price that has already been rounded, and sign
 * a number a few base units away from what the taker saw.
 */
export function NewTradeReview({
  ad,
  userDirection,
  assetAmount,
  method,
}: {
  ad: LiveAd;
  userDirection: "Buy" | "Sell";
  /** In the asset — see the note above. */
  assetAmount?: string;
  method?: string;
}) {
  const t = useTranslations("placeOrder");
  const L = useTranslations("lifecycle");
  const buy = userDirection === "Buy";
  const cryptoAmount = Number(assetAmount) || 0;
  const fiatAmount = ad.price ? cryptoAmount * ad.price : 0;
  const methodLabel =
    method === undefined
      ? undefined
      : (ad.paymentMethodLabels[ad.paymentMethods.indexOf(method)] ?? method);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Panel title={t("panelAgreeing")}>
        <div className="divide-y divide-white/5 px-4">
          {cryptoAmount > 0 && ad.price !== null && (
            <div className="py-4">
              <p className="flex justify-between text-sm">
                <span className="text-gray-500">
                  {buy ? t("youPay") : t("youSell")}
                </span>
                <span className="tabular-nums font-medium text-white">
                  {buy
                    ? formatFiat(fiatAmount, ad.fiatCurrency)
                    : formatCrypto(cryptoAmount, assetLabel(ad), 4)}
                </span>
              </p>
              <p className="mt-1.5 flex justify-between text-sm">
                <span className="text-gray-500">{t("youReceive")}</span>
                <span className="tabular-nums font-medium text-emerald-400">
                  {buy
                    ? formatCrypto(cryptoAmount, assetLabel(ad), 4)
                    : formatFiat(fiatAmount, ad.fiatCurrency)}
                </span>
              </p>
            </div>
          )}
          {methodLabel && (
            <div className="py-3 text-sm">
              <span className="text-gray-500">{t("paymentMethod")}</span>{" "}
              <span className="text-gray-200">{methodLabel}</span>
            </div>
          )}
          <PlaceOrder ad={ad} assetAmount={cryptoAmount} method={method} />
          <p className="py-3 text-xs leading-relaxed text-gray-500">
            {t.rich("ordersRecord", {
              link: (chunks) => (
                <Link href="/orders" className="text-brand hover:text-brand-hover">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </div>
      </Panel>

      <Panel title={t("panelAdvertisement")}>
        <div className="divide-y divide-white/5 px-4">
          <SummaryRow label={t("rowAd")} value={ad.id} />
          <SummaryRow label={t("rowMerchant")} value={`…${ad.merchantShort}`} />
          <SummaryRow label={t("rowDirection")} value={t("merchantDirection", { direction: L(ad.direction) })} />
          <SummaryRow
            label={t("rowPair")}
            value={`${assetLabel(ad)}/${ad.fiatCurrency}`}
          />
          <SummaryRow
            label={t("rowPrice")}
            value={
              ad.price === null
                ? unpriceableLabel(ad.unpriceableReason ?? "NoOracleData")
                : `${formatNumber(ad.price)} ${ad.fiatCurrency} (${
                    ad.pricingKind === "Floating"
                      ? t("floating", {
                          sign: (ad.premiumBps ?? 0) >= 0 ? "+" : "",
                          pct: ((ad.premiumBps ?? 0) / 100).toFixed(2),
                        })
                      : t("fixed")
                  })`
            }
          />
          <SummaryRow
            label={t("rowAvailable")}
            value={formatCrypto(ad.availableLiquidity, assetLabel(ad))}
          />
          {/* In the asset — see `LiveAd.minTrade`. This row showed the same
              two numbers with the fiat currency code beside them, which on a
              KES pair overstated the band by the exchange rate. */}
          <SummaryRow label={t("rowLimits")} value={<TradeLimits ad={ad} />} />
          <SummaryRow
            label={t("rowPaymentMethods")}
            value={ad.paymentMethodLabels.join(", ") || "—"}
          />
          <SummaryRow label={t("rowStatus")} value={t(`adStatus.${ad.status}`)} />
        </div>
      </Panel>
    </div>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-right tabular-nums text-gray-200">{value}</span>
    </div>
  );
}

/** Empty state when the ad id is missing, unknown, or paused/filled. */
export function NewTradeMissingAd() {
  const t = useTranslations("placeOrder");
  return (
    <Panel>
      <div className="px-4 py-10 text-center text-sm text-gray-500">
        <p>
          {t("missingAd")}
        </p>
        <Link
          href="/"
          className="mt-3 inline-block text-brand hover:text-brand-hover"
        >
          {t("backToExchange")}
        </Link>
      </div>
    </Panel>
  );
}
