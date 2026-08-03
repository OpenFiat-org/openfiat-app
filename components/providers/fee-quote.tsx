"use client";

import { useCallback, useEffect, useState } from "react";

import { Panel } from "@/components/panel";
import { shortMint } from "@/lib/earnings";
import { formatNumber } from "@/lib/format";
import {
  amountText,
  fetchFeeQuote,
  UNSETTLEABLE_NOTE,
  type FeeQuote,
} from "@/lib/live-fee-quote";
import { NODE_CHANGED_EVENT, readNodeSelection } from "@/lib/node-preference";
import { DEVNET_OPEN_MINT, PROTOCOL_TOKEN_NAME } from "@/lib/onchain-config";
import { mintFor, useReferenceData, type ReferenceState } from "@/lib/reference";

/**
 * "This service bills in USDC — what is that in the token I hold?"
 *
 * `getProviderFeeQuote` shipped and nothing called it. It is the only place
 * in the protocol where a declared fee meets an oracle rate, and it is worth
 * a control rather than a number because the interesting part is not the
 * conversion — it is the four different things the answer can be.
 *
 * # `unsettleable` is rendered as itself
 *
 * Never as zero, never as the last figure that came back, and never merged
 * with "the node did not answer". The node's own OpenRPC description gives
 * that instruction to integrators in as many words, and the reasons are kept
 * apart on screen because they point a reader in opposite directions: a
 * lapsed feed is worth waiting for and an unpriced pair is not.
 *
 * The fee itself is untouched in every branch, and the copy says so. An
 * unsettleable quote does not mean the service is unusable — it means it
 * cannot be paid *in that token* at this instant, and remains payable in the
 * one it declared.
 *
 * # The token list is the node's, plus one named constant
 *
 * Mints come from `getReferenceData`, so this app is not deciding what
 * exists. {@link DEVNET_OPEN_MINT} is added because it is the interesting
 * case and the node deliberately omits it: OPEN is priceable for a *fee*
 * while being off the escrow settlement allowlist, which is exactly the
 * asymmetry `getProviderFeeQuote` exists to serve. It is one named constant
 * with a paragraph on it in `lib/onchain-config.ts`, not a table.
 */
export function ProviderFeeQuote({
  serviceId,
  declaredMint,
}: {
  serviceId: string;
  /** The mint the service declared its price in, or `null` when it declared none. */
  declaredMint: string | null;
}) {
  const reference = useReferenceData();
  const [mint, setMint] = useState<string>(DEVNET_OPEN_MINT);
  const [quote, setQuote] = useState<FeeQuote | null>(null);
  const [unknownService, setUnknownService] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    setUnknownService(false);
    try {
      const answer = await fetchFeeQuote(readNodeSelection().url, serviceId, mint);
      setQuote(answer);
      setUnknownService(answer === null);
    } catch {
      setQuote(null);
      setFailed(true);
    }
    setLoading(false);
  }, [serviceId, mint]);

  useEffect(() => {
    void load();
    window.addEventListener(NODE_CHANGED_EVENT, load);
    return () => window.removeEventListener(NODE_CHANGED_EVENT, load);
  }, [load]);

  /*
   * Addresses, and only addresses. A record pairing a mint with a name is
   * the shape `tests/exchange-assets.test.tsx` forbids, and rightly: a name
   * this app attached to an address is how somebody reads the wrong token.
   * The name is resolved one way, address in, by `optionLabel`.
   */
  const options: string[] = [
    DEVNET_OPEN_MINT,
    ...(reference.status === "ready" ? reference.data.mints.map((m) => m.mint) : []),
  ].filter((address) => address !== declaredMint);

  return (
    <Panel title="What this fee costs in another token">
      <div className="px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          {options.map((address) => (
            <button
              key={address}
              type="button"
              onClick={() => setMint(address)}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                address === mint
                  ? "border-brand/60 bg-brand/10 text-white"
                  : "border-white/10 text-gray-400 hover:border-white/25 hover:text-gray-200"
              }`}
            >
              {optionLabel(address, reference)}
            </button>
          ))}
          {reference.status === "loading" && (
            <span className="text-xs text-gray-600">Loading the node&apos;s token list…</span>
          )}
          {reference.status === "error" && (
            /* Not an empty picker: an empty list of tokens would read as
               "the network has none", which is a claim made out of a failed
               request. See `lib/reference.ts`. */
            <span className="text-xs text-amber-300">
              Could not load the node&apos;s token list, so only {PROTOCOL_TOKEN_NAME} is offered
              here.{" "}
              <button type="button" onClick={reference.retry} className="underline">
                Retry
              </button>
            </span>
          )}
        </div>

        <div className="mt-4 text-sm">
          {loading ? (
            <p className="text-gray-500">Asking the node…</p>
          ) : failed ? (
            <p className="text-amber-300">
              Your access node did not answer. That is not a price of zero and not an unpayable
              fee — it is a question that was never asked.
            </p>
          ) : unknownService ? (
            <p className="text-gray-400">
              This node has no service under that id, so it has no fee to quote. Another node may
              know it.
            </p>
          ) : quote ? (
            <QuoteBody quote={quote} symbol={optionLabel(mint, reference)} />
          ) : null}
        </div>

        <p className="mt-4 border-t border-white/5 pt-3 text-xs leading-relaxed text-gray-500">
          A display read, not a commitment. Two nodes can legitimately answer differently, because
          each resolves against the oracle records it happens to hold — and past the instant a
          quote expires there is no quote at all, only whatever the rate did next. The number
          anybody would be bound to is the one they sign.
        </p>
      </div>
    </Panel>
  );
}

/**
 * What to call one mint, address in and name out — never the reverse.
 *
 * Two sources, in this order, and the order is the point. OPEN is named by
 * the protocol because the node deliberately never names it: it is not a
 * settlement mint until the public sale, and its absence from the node's
 * table is correct rather than a gap. Everything else is the node's own
 * answer, and an address the node has no name for is shown as the address.
 * Nothing here invents a third name. The same three-line rule
 * `components/wallet/deposit-form.tsx` follows, for the same reason.
 */
function optionLabel(address: string, reference: ReferenceState): string {
  if (address === DEVNET_OPEN_MINT) return PROTOCOL_TOKEN_NAME;
  if (reference.status !== "ready") return shortMint(address);
  return mintFor(reference.data, address)?.symbol || shortMint(address);
}

function QuoteBody({ quote, symbol }: { quote: FeeQuote; symbol: string }) {
  if (quote.status === "free") {
    return (
      <p className="text-gray-300">
        This service declared no price, so there is nothing to convert and nothing to owe. An
        absent price already means free — there is no separate &quot;free&quot; setting to look
        for.
      </p>
    );
  }

  if (quote.status === "native") {
    return (
      <>
        <p className="text-lg font-semibold tabular-nums text-white">
          {amountText(quote.fee)} {symbol}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">
          It already bills in this token, so no rate is involved — which means no lapsed oracle
          feed can ever make this fee unpayable.
        </p>
      </>
    );
  }

  if (quote.status === "settleable") {
    return (
      <>
        <p className="text-lg font-semibold tabular-nums text-white">
          {amountText(quote.settlementAmount)} {symbol}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">
          Converted from the declared {amountText(quote.fee)} at {formatNumber(quote.rate, 6)}{" "}
          {symbol} per unit, good until {new Date(quote.expiresAt).toLocaleString()}. Rounded up,
          deliberately: a fee settled in a substitute token is never worth less than the one that
          was declared, so the payer pays under a base unit more.
        </p>
      </>
    );
  }

  return (
    <>
      {/* No figure anywhere on this branch. There is nothing to accidentally
          read as zero, which is the point. */}
      <p className="text-amber-300">Not settleable in {symbol} right now.</p>
      <p className="mt-1 text-xs leading-relaxed text-gray-500">
        {UNSETTLEABLE_NOTE[quote.reason]} The fee itself is unchanged and remains payable in the
        token the provider declared.
      </p>
    </>
  );
}
