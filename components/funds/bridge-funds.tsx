"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Panel } from "@/components/panel";
import {
  buildDepositOrder,
  buildWithdrawOrder,
  CROSS_CHAIN_LIVE_CALLS_ENABLED,
  fetchBridgeFundsQuote,
  OTHER_CHAINS,
  parseAmountToBaseUnits,
  parseSolanaRecipient,
  STABLECOINS,
  submitBridgeFundsOrder,
  validateDestinationAddress,
  type DestinationAddressError,
  type Direction,
  type DlnCreateTxResponse,
  type OtherChain,
  type Stablecoin,
} from "@/lib/bridge-funds";
import {
  readWalletConnection,
  WALLET_CHANGED_EVENT,
  type WalletConnection,
} from "@/lib/wallet-connection";
import {
  sourceWalletAdapters,
  type SourceWalletConnection,
} from "@/lib/wallet/source-wallet";
import { debridge } from "@openfiat/sdk";

const inputCls =
  "w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm text-white outline-none focus:border-brand/50 [&>option]:bg-[#10151d]";

type CreateTxRequest = debridge.CreateTxRequest;

type BuildState =
  | { status: "idle" }
  // `direction` is captured at build time, not read live from state — if the
  // user flips Deposit/Withdraw after building, the status explanation below
  // must keep describing the order that was actually built, not whichever
  // direction is currently selected.
  | { status: "built"; request: CreateTxRequest; direction: Direction }
  | { status: "error"; message: string };

type QuoteState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; response: DlnCreateTxResponse }
  | { status: "error"; message: string };

type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "submitted"; response: DlnCreateTxResponse }
  | { status: "error"; message: string };

/**
 * Non-custodial stablecoin "Funds" panel (SP-C Task 2): USDC/USDT deposit
 * (another chain → the user's own Solana wallet) and withdraw (Solana → the
 * user's own wallet on another chain), via deBridge's DLN.
 *
 * # This is not `pay-cross-chain.tsx`
 *
 * `components/open/pay-cross-chain.tsx` (SP-B) bridges funds *into a
 * `deliver_contribution` hook* — an OpenFiat program instruction runs in
 * the same fill. Nothing here does that: `lib/bridge-funds.ts`'s
 * `buildDepositOrder`/`buildWithdrawOrder` never set `dlnHook` (see that
 * module's doc and `tests/bridge-funds.test.ts`'s explicit assertion), so
 * every order this panel builds is a plain transfer between two wallets the
 * user themselves controls. OpenFiat is not a party to it.
 *
 * # Same gate, same reason, as SP-B
 *
 * `CROSS_CHAIN_LIVE_CALLS_ENABLED` (defined once, in `lib/debridge-order.ts`,
 * reused rather than duplicated here) is off in every environment this
 * build ships from. The order-building logic below is fully live — what's
 * gated is only the network calls to deBridge's `create-tx` endpoint, whose
 * shape for these two builders has never been checked against a live
 * response. Flipping the gate on is a pre-mainnet integration step, not
 * something this component does for itself.
 */
export function BridgeFunds() {
  const t = useTranslations("bridgeFunds");

  const [direction, setDirection] = useState<Direction>("deposit");
  const [stablecoin, setStablecoin] = useState<Stablecoin>("USDC");
  const [otherChain, setOtherChain] = useState<OtherChain>("ethereum");
  const [amountInput, setAmountInput] = useState("");

  const [sourceConn, setSourceConn] = useState<SourceWalletConnection | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  const [solWallet, setSolWallet] = useState<WalletConnection | null>(null);
  const [recipientInput, setRecipientInput] = useState("");
  const [destInput, setDestInput] = useState("");

  const [build, setBuild] = useState<BuildState>({ status: "idle" });
  const [quote, setQuote] = useState<QuoteState>({ status: "idle" });
  const [submit, setSubmit] = useState<SubmitState>({ status: "idle" });

  useEffect(() => {
    const sync = () => setSolWallet(readWalletConnection());
    sync();
    window.addEventListener(WALLET_CHANGED_EVENT, sync);
    return () => window.removeEventListener(WALLET_CHANGED_EVENT, sync);
  }, []);

  // A connected Solana wallet is the deposit destination by default — the
  // field stays editable (recipient must be validated regardless of source)
  // but only auto-fills when the user hasn't typed anything of their own.
  useEffect(() => {
    if (direction === "deposit" && solWallet && recipientInput === "") {
      setRecipientInput(solWallet.address);
    }
  }, [direction, solWallet, recipientInput]);

  async function connectSource(chain: OtherChain) {
    setConnectError(null);
    setOtherChain(chain);
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

  const recipient = direction === "deposit" ? parseSolanaRecipient(recipientInput) : null;
  const recipientErrorKey =
    direction === "deposit" && recipientInput.trim().length > 0 && recipient && !recipient.ok
      ? recipient.reason
      : null;

  const destination = direction === "withdraw" ? validateDestinationAddress(otherChain, destInput) : null;
  const destErrorKey: DestinationAddressError | null =
    direction === "withdraw" && destInput.trim().length > 0 && destination && !destination.ok
      ? destination.reason
      : null;

  let amountBaseUnits: bigint | null = null;
  let amountError: string | null = null;
  if (amountInput.trim().length > 0) {
    try {
      amountBaseUnits = parseAmountToBaseUnits(amountInput, debridge.STABLECOIN_DECIMALS);
    } catch (error) {
      amountError = error instanceof Error ? error.message : String(error);
    }
  }

  const canBuild =
    amountBaseUnits !== null &&
    (direction === "deposit"
      ? sourceConn !== null && recipient !== null && recipient.ok
      : solWallet !== null && destination !== null && destination.ok);

  function buildOrder() {
    if (!canBuild || amountBaseUnits === null) return;
    try {
      const request =
        direction === "deposit"
          ? buildDepositOrder({
              otherChain,
              stablecoin,
              amountBaseUnits,
              solanaRecipient: recipientInput.trim(),
              sourceWalletAddress: sourceConn!.address,
            })
          : buildWithdrawOrder({
              otherChain,
              stablecoin,
              amountBaseUnits,
              solanaOwner: solWallet!.address,
              dstRecipient: destInput.trim(),
            });
      setBuild({ status: "built", request, direction });
    } catch (error) {
      setBuild({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function getQuote() {
    if (build.status !== "built") return;
    setQuote({ status: "loading" });
    try {
      // A price-only quote drops the two order-authority fields — deBridge's
      // own docs say a `create-tx` call is only a real order once those (and
      // a `senderAddress`) are present, so this asks for a price without
      // creating anything.
      const { srcChainId, srcChainTokenIn, srcChainTokenInAmount, dstChainId, dstChainTokenOut, dstChainTokenOutAmount, dstChainTokenOutRecipient } =
        build.request;
      const response = await fetchBridgeFundsQuote({
        srcChainId,
        srcChainTokenIn,
        srcChainTokenInAmount,
        dstChainId,
        dstChainTokenOut,
        dstChainTokenOutAmount,
        dstChainTokenOutRecipient,
      });
      setQuote({ status: "loaded", response });
    } catch (error) {
      setQuote({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function submitOrder() {
    if (build.status !== "built") return;
    const senderAddress = build.direction === "deposit" ? sourceConn?.address : solWallet?.address;
    if (!senderAddress) return;
    setSubmit({ status: "submitting" });
    try {
      const response = await submitBridgeFundsOrder(build.request, senderAddress);
      setSubmit({ status: "submitted", response });
    } catch (error) {
      setSubmit({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  return (
    <Panel title={t("title")}>
      <div className="divide-y divide-white/5">
        {/* Direction + asset + chain + amount */}
        <div className="px-4 py-5">
          <p className="mb-2 text-xs text-gray-500">{t("step1")}</p>
          <div className="mb-3 flex gap-2">
            {(["deposit", "withdraw"] as Direction[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDirection(d)}
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  direction === d ? "border-brand/60 text-white" : "border-white/10 text-gray-300 hover:border-white/30"
                }`}
              >
                {t(d === "deposit" ? "directionDeposit" : "directionWithdraw")}
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs text-gray-500">{t("stablecoinLabel")}</span>
              <select
                value={stablecoin}
                onChange={(e) => setStablecoin(e.target.value as Stablecoin)}
                className={inputCls}
              >
                {STABLECOINS.map((sc) => (
                  <option key={sc} value={sc}>
                    {sc}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-gray-500">
                {t(direction === "deposit" ? "sourceChainLabel" : "destChainLabel")}
              </span>
              <select
                value={otherChain}
                onChange={(e) => setOtherChain(e.target.value as OtherChain)}
                className={inputCls}
              >
                {OTHER_CHAINS.map((chain) => (
                  <option key={chain} value={chain}>
                    {t(`chain.${chain}`)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-gray-500">{t("amountLabel", { stablecoin })}</span>
              <input
                type="number"
                min="0"
                step="any"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder="0.00"
                className={`tabular-nums ${inputCls}`}
              />
            </label>
          </div>
          {amountError && <p className="mt-2 text-xs text-amber-300">{amountError}</p>}
        </div>

        {/* Withdraw: prominent SOL-fee notice — surfaced unconditionally, not
            tucked behind a build step, since it's a prerequisite the user
            needs to know about before they even connect a wallet. */}
        {direction === "withdraw" && (
          <div className="bg-amber-500/10 px-4 py-3">
            <p className="text-xs text-amber-200">{t("solFeeNotice")}</p>
          </div>
        )}

        {/* Step 2: wallets */}
        {direction === "deposit" ? (
          <div className="px-4 py-5">
            <p className="mb-2 text-xs text-gray-500">{t("depositStep2", { chain: t(`chain.${otherChain}`) })}</p>
            <div className="flex flex-wrap gap-2">
              {OTHER_CHAINS.map((chain) => (
                <button
                  key={chain}
                  type="button"
                  onClick={() => void connectSource(chain)}
                  className={`rounded-md border px-3 py-1.5 text-sm ${
                    otherChain === chain && sourceConn
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

            <label htmlFor="bf-recipient" className="mb-1 mt-4 block text-xs text-gray-500">
              {t("depositStep3", { stablecoin })}
            </label>
            <div className="flex gap-2">
              <input
                id="bf-recipient"
                value={recipientInput}
                onChange={(e) => setRecipientInput(e.target.value)}
                placeholder={t("solanaAddressPlaceholder")}
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
        ) : (
          <div className="px-4 py-5">
            <p className="mb-2 text-xs text-gray-500">{t("withdrawStep2")}</p>
            {solWallet ? (
              <p className="break-all font-mono text-[11px] text-gray-500">{t("connectedAs", { address: solWallet.address })}</p>
            ) : (
              <p className="text-xs text-amber-300">{t("connectSolanaWallet")}</p>
            )}

            <label htmlFor="bf-dest" className="mb-1 mt-4 block text-xs text-gray-500">
              {t("withdrawStep3", { chain: t(`chain.${otherChain}`) })}
            </label>
            <input
              id="bf-dest"
              value={destInput}
              onChange={(e) => setDestInput(e.target.value)}
              placeholder={otherChain === "tron" ? t("tronAddressPlaceholder") : t("evmAddressPlaceholder")}
              className={`font-mono ${inputCls}`}
            />
            {destErrorKey && (
              <p className="mt-1.5 text-xs text-amber-300">
                {destErrorKey === "wrongPrefix"
                  ? t("destWrongPrefix")
                  : destErrorKey === "badChecksum"
                    ? t("destBadChecksum")
                    : t("destInvalid")}
              </p>
            )}
          </div>
        )}

        {/* Build + (gated) quote/submit */}
        <div className="px-4 py-5">
          <button
            type="button"
            disabled={!canBuild}
            onClick={buildOrder}
            className="rounded-md border border-brand/60 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("buildOrder")}
          </button>

          {build.status === "error" && <p className="mt-2 text-xs text-red-300">{build.message}</p>}

          {build.status === "built" && (
            <div className="mt-4 space-y-3 text-xs text-gray-400">
              <p>{t("orderBuilt")}</p>
              <p className="text-emerald-300/80">{t("noHookNote")}</p>
              <dl className="space-y-1.5">
                <Row label={t("srcChainLabel")} value={build.request.srcChainId} />
                <Row label={t("dstChainLabel")} value={build.request.dstChainId} />
                <Row label={t("recipientLabel")} value={build.request.dstChainTokenOutRecipient} />
              </dl>

              <div className="mt-4 rounded-md border border-white/10 px-4 py-3">
                <p className="mb-2 font-medium text-gray-300">{t("statusTitle")}</p>
                <ol className="list-decimal space-y-1 pl-4">
                  {build.direction === "deposit" ? (
                    <>
                      <li>{t("depositStatusSourceTx")}</li>
                      <li>{t("depositStatusFill")}</li>
                      <li>{t("depositStatusArrived")}</li>
                    </>
                  ) : (
                    <>
                      <li>{t("withdrawStatusSolTx")}</li>
                      <li>{t("withdrawStatusFill")}</li>
                      <li>{t("withdrawStatusArrived")}</li>
                    </>
                  )}
                </ol>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  disabled={!CROSS_CHAIN_LIVE_CALLS_ENABLED || quote.status === "loading"}
                  onClick={() => void getQuote()}
                  className="rounded-md border border-white/10 px-4 py-2 text-sm text-gray-300 disabled:cursor-not-allowed disabled:opacity-40"
                  title={CROSS_CHAIN_LIVE_CALLS_ENABLED ? undefined : t("liveDisabledTitle")}
                >
                  {quote.status === "loading" ? t("quoting") : t("getQuote")}
                </button>
                <button
                  type="button"
                  disabled={!CROSS_CHAIN_LIVE_CALLS_ENABLED || submit.status === "submitting"}
                  onClick={() => void submitOrder()}
                  className="rounded-md border border-white/10 px-4 py-2 text-sm text-gray-400 disabled:cursor-not-allowed disabled:opacity-40"
                  title={CROSS_CHAIN_LIVE_CALLS_ENABLED ? undefined : t("liveDisabledTitle")}
                >
                  {submit.status === "submitting" ? t("submitting") : t("submitOrder")}
                </button>
              </div>
              {!CROSS_CHAIN_LIVE_CALLS_ENABLED && <p className="text-[11px] text-gray-600">{t("liveDisabledNote")}</p>}

              {quote.status === "error" && <p className="text-xs text-amber-300">{quote.message}</p>}
              {quote.status === "loaded" && (
                <Row
                  label={t("quotedOutLabel")}
                  value={quote.response.estimation?.dstChainTokenOut?.recommendedAmount ?? "—"}
                />
              )}
              {submit.status === "error" && <p className="text-xs text-amber-300">{submit.message}</p>}
              {submit.status === "submitted" && (
                <Row label={t("orderIdLabel")} value={submit.response.orderId ?? "—"} />
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
