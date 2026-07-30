import Link from "next/link";
import type { LiveAd } from "@/lib/live-advertisements";
import { formatCrypto, formatFiat, formatNumber } from "@/lib/format";
import { Panel } from "@/components/panel";

/**
 * A real advertisement's review page.
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
 * Submitting a reservation is a signed `ReservationRequest` (OFS-2200 §11) —
 * this interface doesn't build and send one yet, so this page reviews the
 * real advertisement and says so plainly instead of faking a placed order.
 */
export function NewTradeReview({
  ad,
  userDirection,
  amount,
  method,
}: {
  ad: LiveAd;
  userDirection: "Buy" | "Sell";
  amount?: string;
  method?: string;
}) {
  const buy = userDirection === "Buy";
  const fiatAmount = Number(amount) || 0;
  const cryptoAmount = ad.price ? fiatAmount / ad.price : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Panel title="What you would be agreeing to">
        <div className="divide-y divide-white/5 px-4">
          {fiatAmount > 0 && ad.price !== null && (
            <div className="py-4">
              <p className="flex justify-between text-sm">
                <span className="text-gray-500">{buy ? "You would pay" : "You would sell"}</span>
                <span className="tabular-nums font-medium text-white">
                  {buy ? formatFiat(fiatAmount, ad.fiatCurrency) : formatCrypto(cryptoAmount, ad.asset, 4)}
                </span>
              </p>
              <p className="mt-1.5 flex justify-between text-sm">
                <span className="text-gray-500">{buy ? "You would receive" : "You would receive"}</span>
                <span className="tabular-nums font-medium text-emerald-400">
                  {buy ? formatCrypto(cryptoAmount, ad.asset, 4) : formatFiat(fiatAmount, ad.fiatCurrency)}
                </span>
              </p>
            </div>
          )}
          {method && (
            <div className="py-3 text-sm">
              <span className="text-gray-500">Payment method</span>{" "}
              <span className="text-gray-200">{method}</span>
            </div>
          )}
          <div className="py-4">
            <p className="text-sm font-medium text-amber-200">Placing an order isn't wired to the protocol yet</p>
            <p className="mt-1.5 text-xs leading-relaxed text-gray-400">
              A real order is a signed <code className="font-mono">ReservationRequest</code> submitted to a node
              (OFS-2200 §11), which then locks the merchant&apos;s crypto in an escrow PDA on Solana. This interface can
              read the live advertisement above and validate an amount against it, but does not yet build, sign, and
              send that request — so no reservation is created by anything on this page, and nothing here should be
              read as one. <Link href="/orders" className="text-brand hover:text-brand-hover">Your real orders</Link>{" "}
              are what the node actually reports.
            </p>
          </div>
        </div>
      </Panel>

      <Panel title="Advertisement">
        <div className="divide-y divide-white/5 px-4">
          <SummaryRow label="Ad" value={ad.id} />
          <SummaryRow label="Merchant" value={`…${ad.merchantShort}`} />
          <SummaryRow label="Direction" value={`Merchant ${ad.direction}`} />
          <SummaryRow label="Pair" value={`${ad.asset}/${ad.fiatCurrency}`} />
          <SummaryRow
            label="Price"
            value={
              ad.price === null
                ? "Floating — no oracle read yet"
                : `${formatNumber(ad.price)} ${ad.fiatCurrency} (${
                    ad.pricingKind === "Floating"
                      ? `Floating ${(ad.premiumBps ?? 0) >= 0 ? "+" : ""}${((ad.premiumBps ?? 0) / 100).toFixed(2)}%`
                      : "Fixed"
                  })`
            }
          />
          <SummaryRow label="Available" value={formatCrypto(ad.availableLiquidity, ad.asset)} />
          <SummaryRow
            label="Limits"
            value={`${formatFiat(ad.minTrade, ad.fiatCurrency, 0)} – ${formatFiat(ad.maxTrade, ad.fiatCurrency, 0)}`}
          />
          <SummaryRow label="Payment methods" value={ad.paymentMethods.join(", ") || "—"} />
          <SummaryRow label="Status" value={ad.status} />
        </div>
      </Panel>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-right tabular-nums text-gray-200">{value}</span>
    </div>
  );
}

/** Empty state when the ad id is missing, unknown, or paused/filled. */
export function NewTradeMissingAd() {
  return (
    <Panel>
      <div className="px-4 py-10 text-center text-sm text-gray-500">
        <p>This advertisement could not be found on the node — it may have been paused, filled, or never existed.</p>
        <Link href="/" className="mt-3 inline-block text-brand hover:text-brand-hover">
          ← Back to the P2P exchange
        </Link>
      </div>
    </Panel>
  );
}
