"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Panel } from "@/components/panel";
import { formatNumber } from "@/lib/format";
import {
  buildCrossChainOrderRequest,
  CROSS_CHAIN_LIVE_CALLS_ENABLED,
  fetchCrossChainSaleConfig,
  parseSolanaRecipient,
  resolveCrossChainHookInputs,
  type CrossChainOrderRequest,
  type SolanaRecipientError,
} from "@/lib/debridge-order";
import { openEntitlementFor, toWhole } from "@/lib/live-presale";
import type { DecodedSaleConfig } from "@/lib/onchain-decode";
import {
  readWalletConnection,
  WALLET_CHANGED_EVENT,
  type WalletConnection,
} from "@/lib/wallet-connection";
import {
  sourceWalletAdapters,
  type SourceChainKey,
  type SourceWalletConnection,
} from "@/lib/wallet/source-wallet";

const inputCls =
  "w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm text-white outline-none focus:border-brand/50";

const CHAIN_ORDER: SourceChainKey[] = ["ethereum", "bsc", "tron"];

type BuildState =
  | { status: "idle" }
  | { status: "building" }
  | { status: "built"; request: CrossChainOrderRequest }
  | { status: "error"; message: string };

/**
 * "Pay from another chain": a buyer holding funds on Ethereum, BNB Chain or
 * TRON contributes to the OPEN presale without ever touching Solana
 * directly. deBridge's DLN bridges whatever they pay into USDC on Solana and
 * — via the hook `lib/debridge-order.ts` builds with `@openfiat/sdk`'s
 * `debridge.buildDeliverContributionHook` — calls `deliver_contribution` in
 * the same fill, so OPEN lands in the recipient's wallet with no separate
 * claim step.
 *
 * # What this component does today, and what it deliberately does not
 *
 * It connects a source-chain wallet, validates a Solana recipient, resolves
 * the live `SaleConfig` and assembles the exact DLN order request —
 * including the hook and the fallback recipient — that a real submission
 * would send. It does not place that order: `CROSS_CHAIN_LIVE_CALLS_ENABLED`
 * (`lib/debridge-order.ts`) is off in every environment this build ships
 * from, because the hook's own module doc lists several encoding details
 * (the `dlnHook` envelope shape chief among them) that have never been
 * checked against a real `create-tx` call. Submitting an order nobody has
 * confirmed deBridge accepts risks bridging real funds into a hook that
 * silently never fires — worse than not offering the button at all. Task 4
 * is where that confirmation happens; this component is ready to flip on
 * the moment it does.
 */
export function PayCrossChain() {
  const t = useTranslations("payCrossChain");

  const [expanded, setExpanded] = useState(false);
  const [sourceChain, setSourceChain] = useState<SourceChainKey>("ethereum");
  const [sourceConn, setSourceConn] = useState<SourceWalletConnection | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  const [recipientInput, setRecipientInput] = useState("");
  const [solWallet, setSolWallet] = useState<WalletConnection | null>(null);

  const [usdcEstimate, setUsdcEstimate] = useState("");
  const [saleConfig, setSaleConfig] = useState<DecodedSaleConfig | null>(null);
  const [saleConfigLoaded, setSaleConfigLoaded] = useState(false);

  const [build, setBuild] = useState<BuildState>({ status: "idle" });

  useEffect(() => {
    const sync = () => setSolWallet(readWalletConnection());
    sync();
    window.addEventListener(WALLET_CHANGED_EVENT, sync);
    return () => window.removeEventListener(WALLET_CHANGED_EVENT, sync);
  }, []);

  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    // Reads the *nonce-keyed* `SaleConfig` the cross-chain-capable presale
    // build uses (`lib/debridge-order.ts`'s own doc explains why this
    // differs from `lib/live-presale.ts`'s singleton `fetchSaleConfig`) —
    // so this panel and `buildOrder` below agree about which account
    // exists, instead of one reading old state and the other new.
    void fetchCrossChainSaleConfig().then((config) => {
      if (!cancelled) {
        setSaleConfig(config);
        setSaleConfigLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [expanded]);

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="mt-4 w-full rounded-md border border-white/10 px-4 py-3 text-left text-sm text-gray-300 hover:border-brand/40 hover:text-white"
      >
        {t("entryPoint")}
      </button>
    );
  }

  const recipient = parseSolanaRecipient(recipientInput);
  const recipientErrorKey: SolanaRecipientError | null =
    recipientInput.trim().length > 0 && !recipient.ok ? recipient.reason : null;

  const usdcAmount = Number(usdcEstimate);
  const openPreview =
    saleConfig && usdcAmount > 0
      ? toWhole(
          openEntitlementFor(BigInt(Math.round(usdcAmount * 10 ** saleConfig.usdcDecimals)), saleConfig),
          saleConfig.openDecimals,
        )
      : null;

  async function connectSource(chain: SourceChainKey) {
    setConnectError(null);
    setSourceChain(chain);
    const adapter = sourceWalletAdapters()[chain];
    if (!adapter.isAvailable()) {
      setConnectError(t("walletNotFound", { chain: t(`chain.${chain}`) }));
      return;
    }
    try {
      setSourceConn(await adapter.connect());
    } catch (error) {
      setSourceConn(null);
      setConnectError(error instanceof Error ? error.message : String(error));
    }
  }

  async function buildOrder() {
    if (!recipient.ok || !sourceConn || usdcAmount <= 0) return;
    setBuild({ status: "building" });
    try {
      const usdcBaseUnits = BigInt(Math.round(usdcAmount * 10 ** (saleConfig?.usdcDecimals ?? 6)));
      const hookInputs = await resolveCrossChainHookInputs(recipient.pubkey, usdcBaseUnits);
      const request = buildCrossChainOrderRequest({
        sourceChain,
        // No live token picker yet (Task 4 scope) — the order targets the
        // source chain's native gas asset as a placeholder input token so
        // the request shape is complete; a real submission needs a real
        // token address here.
        sourceTokenAddress: "native",
        sourceAmountBaseUnits: usdcBaseUnits,
        sourceWalletAddress: sourceConn.address,
        hookInputs,
      });
      setBuild({ status: "built", request });
    } catch (error) {
      setBuild({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  const canBuild = recipient.ok && sourceConn !== null && usdcAmount > 0 && saleConfig !== null;

  return (
    <Panel title={t("title")}>
      <div className="divide-y divide-white/5">
        {/* Step 1: source wallet */}
        <div className="px-4 py-5">
          <p className="mb-2 text-xs text-gray-500">{t("step1")}</p>
          <div className="flex flex-wrap gap-2">
            {CHAIN_ORDER.map((chain) => (
              <button
                key={chain}
                type="button"
                onClick={() => void connectSource(chain)}
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  sourceChain === chain && sourceConn
                    ? "border-brand/60 text-white"
                    : "border-white/10 text-gray-300 hover:border-white/30"
                }`}
              >
                {t(`chain.${chain}`)}
              </button>
            ))}
          </div>
          {sourceConn && (
            <p className="mt-2 break-all font-mono text-[11px] text-gray-500">
              {t("connectedAs", { address: sourceConn.address })}
            </p>
          )}
          {connectError && <p className="mt-2 text-xs text-amber-300">{connectError}</p>}
        </div>

        {/* Step 2: Solana recipient */}
        <div className="px-4 py-5">
          <label htmlFor="cc-recipient" className="mb-1 block text-xs text-gray-500">
            {t("step2")}
          </label>
          <div className="flex gap-2">
            <input
              id="cc-recipient"
              value={recipientInput}
              onChange={(e) => setRecipientInput(e.target.value)}
              placeholder={t("recipientPlaceholder")}
              className={`font-mono ${inputCls}`}
            />
            {solWallet && (
              <button
                type="button"
                onClick={() => setRecipientInput(solWallet.address)}
                className="shrink-0 rounded-md border border-white/10 px-3 py-2 text-xs text-gray-300 hover:border-brand/40"
              >
                {t("useConnectedWallet")}
              </button>
            )}
          </div>
          {recipientErrorKey && (
            <p className="mt-1.5 text-xs text-amber-300">
              {recipientErrorKey === "offCurve" ? t("recipientOffCurve") : t("recipientInvalid")}
            </p>
          )}
        </div>

        {/* Step 3: amount + OPEN preview */}
        <div className="px-4 py-5">
          <label htmlFor="cc-amount" className="mb-1 block text-xs text-gray-500">
            {t("step3")}
          </label>
          <input
            id="cc-amount"
            type="number"
            min="0"
            value={usdcEstimate}
            onChange={(e) => setUsdcEstimate(e.target.value)}
            placeholder="0.00"
            className={`tabular-nums ${inputCls}`}
          />
          <p className="mt-2 text-xs text-gray-500">{t("quoteNote")}</p>
          {openPreview !== null && (
            <p className="mt-3 flex items-center justify-between rounded-md border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
              <span className="text-gray-500">{t("wouldEntitle")}</span>
              <span className="font-mono text-base font-semibold tabular-nums text-white">
                {formatNumber(openPreview, 0)} OPEN
              </span>
            </p>
          )}
          {!saleConfig && (
            <p className="mt-2 text-xs text-gray-500">
              {saleConfigLoaded ? t("noCrossChainSale") : t("readingSaleConfig")}
            </p>
          )}
        </div>

        {/* Step 4: build + (gated) submit */}
        <div className="px-4 py-5">
          <button
            type="button"
            disabled={!canBuild || build.status === "building"}
            onClick={() => void buildOrder()}
            className="rounded-md border border-brand/60 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {build.status === "building" ? t("building") : t("buildOrder")}
          </button>

          {build.status === "error" && <p className="mt-2 text-xs text-red-300">{build.message}</p>}

          {build.status === "built" && (
            <div className="mt-4 space-y-3 text-xs text-gray-400">
              <p>{t("orderBuilt")}</p>
              <dl className="space-y-1.5">
                <Row label={t("fallbackRecipientLabel")} value={build.request.dstChainTokenOutRecipient} />
                <Row label={t("cancelAuthorityLabel")} value={build.request.dstChainOrderAuthorityAddress} />
                <Row label={t("srcChainLabel")} value={build.request.srcChainId} />
              </dl>

              {/* Step 5: status explanation */}
              <div className="mt-4 rounded-md border border-white/10 px-4 py-3">
                <p className="mb-2 font-medium text-gray-300">{t("statusTitle")}</p>
                <ol className="list-decimal space-y-1 pl-4">
                  <li>{t("statusSourceTx")}</li>
                  <li>{t("statusDlnFill")}</li>
                  <li>{t("statusOpenDelivered")}</li>
                </ol>
                <p className="mt-2 text-amber-200/80">{t("statusFallbackNote")}</p>
              </div>

              <button
                type="button"
                disabled={!CROSS_CHAIN_LIVE_CALLS_ENABLED}
                className="mt-2 rounded-md border border-white/10 px-4 py-2 text-sm text-gray-400 disabled:cursor-not-allowed disabled:opacity-40"
                title={CROSS_CHAIN_LIVE_CALLS_ENABLED ? undefined : t("liveDisabledTitle")}
              >
                {t("submitOrder")}
              </button>
              {!CROSS_CHAIN_LIVE_CALLS_ENABLED && (
                <p className="text-[11px] text-gray-600">{t("liveDisabledNote")}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span>{label}</span>
      <span className="break-all text-right font-mono text-gray-300">{value}</span>
    </div>
  );
}
