"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Panel } from "@/components/panel";
import { formatNumber } from "@/lib/format";
import {
  fetchSaleConfig,
  openEntitlementFor,
  saleConfigPda,
  toWhole,
} from "@/lib/live-presale";
import type { DecodedSaleConfig } from "@/lib/onchain-decode";
import { SOLANA_CLUSTER } from "@/lib/node-endpoint";
import { OPEN_PRICE_USDC, PUBLIC_SALE_PRICE_USDC } from "@/lib/sale-terms";

const inputCls =
  "w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm text-white outline-none focus:border-brand/50 [&>option]:bg-[#10151d]";

/**
 * The presale panel, driven by the on-chain `SaleConfig` and by nothing else.
 *
 * # What it used to be
 *
 * A progress bar reading "$24,500,000 / $20,000,000 (123%)" over a Buy
 * button. The raised figure was a constant in `lib/data/sale.ts`; the
 * minimum, maximum and phase name beside it were constants too; and the
 * button set a flag that rendered "Contribution recorded (simulated)" with an
 * OPEN figure and a promise it would be claimable at launch. The word
 * "simulated" appeared twice, in small grey text, at the bottom.
 *
 * # Three states, and the middle one is the honest answer today
 *
 * `loading`, `unavailable`, and `open`. There is deliberately no fourth state
 * that fills in defaults: `fetchSaleConfig` returning `null` means
 * `initialize_sale` has never run on this cluster, so there is no raised
 * total, no cap, no minimum and no deadline — not zeroes for them. A zero
 * raised is a statement about a sale that is running.
 *
 * That is the state on devnet right now, and this says so plainly rather
 * than showing a form that cannot do anything.
 *
 * # No purchase button, in any state
 *
 * Not an omission. Contributing means building and signing a real
 * `contribute` (or `contribute_with_swap`) instruction, and `@openfiat/sdk`
 * exports no presale client at all — it pins escrow, staking and governance
 * only. A button that signs nothing is worse than no button: the previous
 * one told a reader their contribution had been recorded.
 *
 * What remains is an entitlement calculator, and it is honest arithmetic
 * rather than a mock of a purchase — it applies the same 1:1 scaling
 * `SaleConfig::open_entitlement_for` applies, against the decimals read off
 * the live account, and it says that is what it is.
 */

type SaleState =
  | { status: "loading" }
  | { status: "unavailable"; reasonKey: "noSale" | "readErrorMsg" | "readError"; message?: string }
  | { status: "open"; config: DecodedSaleConfig };

export function BuyOpen() {
  const t = useTranslations("buyOpen");
  const [sale, setSale] = useState<SaleState>({ status: "loading" });
  const [raw, setRaw] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const config = await fetchSaleConfig();
        if (cancelled) return;
        setSale(
          config
            ? { status: "open", config }
            : { status: "unavailable", reasonKey: "noSale" },
        );
      } catch (error: unknown) {
        if (!cancelled) {
          setSale(
            error instanceof Error
              ? { status: "unavailable", reasonKey: "readErrorMsg", message: error.message }
              : { status: "unavailable", reasonKey: "readError" },
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (sale.status === "loading") {
    return (
      <Panel title={t("titleLoading")}>
        <p className="px-4 py-10 text-center text-sm text-gray-500">
          {t("reading")}
        </p>
      </Panel>
    );
  }

  if (sale.status === "unavailable") {
    const reason =
      sale.reasonKey === "noSale"
        ? t("noSaleInit", { cluster: SOLANA_CLUSTER ?? t("thisCluster") })
        : sale.reasonKey === "readErrorMsg"
          ? t("readErrorMsg", { message: sale.message ?? "" })
          : t("readError");
    return (
      <Panel title={t("titleNotOpen")}>
        <div className="space-y-3 px-4 py-6">
          <p className="text-sm leading-relaxed text-gray-300">{reason}</p>
          <p className="text-sm leading-relaxed text-gray-400">
            {t("unavailableBody")}
          </p>
          <p className="break-all font-mono text-[11px] text-gray-600">
            {t("saleConfigPda", { pda: saleConfigPda().toBase58() })}
          </p>
          <p className="text-xs text-gray-500">
            {t.rich("termsFixed", {
              link: (chunks) => (
                <Link href="/staking" className="text-brand hover:text-brand-hover">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </div>
      </Panel>
    );
  }

  const { config } = sale;
  const raised = toWhole(config.totalRaised, config.usdcDecimals);
  const hardCap = toWhole(config.hardCap, config.usdcDecimals);
  const minContribution = toWhole(config.minContribution, config.usdcDecimals);
  const maxContribution = toWhole(config.maxContribution, config.usdcDecimals);
  const pct = hardCap > 0 ? Math.round((raised / hardCap) * 100) : 0;

  const amount = Number(raw) || 0;
  const receive = toWhole(
    openEntitlementFor(BigInt(Math.round(amount * 10 ** config.usdcDecimals)), config),
    config.openDecimals,
  );
  const belowMin = amount > 0 && amount < minContribution;
  const aboveMax = amount > maxContribution;

  return (
    <Panel title={t("titleState", { state: config.state })}>
      <div className="divide-y divide-white/5">
        <div className="px-4 py-6">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{t("raisedLabel")}</span>
            <span className="tabular-nums">
              ${formatNumber(raised, 0)} / ${formatNumber(hardCap, 0)} ({pct}%)
            </span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-white/10">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-brand to-brand-teal"
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
          <p className="mt-3 text-xs text-gray-500">
            {t("minMaxNote", {
              min: formatNumber(minContribution, 0),
              max: formatNumber(maxContribution, 0),
              publicPrice: PUBLIC_SALE_PRICE_USDC,
            })}
          </p>
          {config.softCap === 0n && (
            <p className="mt-2 text-xs text-gray-500">
              {t("noSoftCap")}
            </p>
          )}
        </div>

        <div className="px-4 py-6">
          <label htmlFor="open-amount" className="mb-1 block text-xs text-gray-500">
            {t("calcLabel")}
          </label>
          <input
            id="open-amount"
            type="number"
            min="0"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={`${formatNumber(minContribution, 0)} – ${formatNumber(maxContribution, 0)}`}
            className={`tabular-nums ${inputCls}`}
          />
          <p className="mt-4 flex items-center justify-between rounded-md border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
            <span className="text-gray-500">{t("wouldEntitle")}</span>
            <span className="font-mono text-base font-semibold tabular-nums text-white">
              {formatNumber(receive, 0)} OPEN
            </span>
          </p>
          {belowMin && (
            <p className="mt-1.5 text-xs text-amber-300">
              {t("belowMin", { min: formatNumber(minContribution, 0) })}
            </p>
          )}
          {aboveMax && (
            <p className="mt-1.5 text-xs text-amber-300">
              {t("aboveMax", { max: formatNumber(maxContribution, 0) })}
            </p>
          )}
          <p className="mt-3 text-xs leading-relaxed text-gray-500">
            {t.rich("calcNote", {
              price: OPEN_PRICE_USDC,
              code: (chunks) => <code className="text-gray-400">{chunks}</code>,
            })}
          </p>
        </div>
      </div>
    </Panel>
  );
}
