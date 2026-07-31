"use client";

import { useCallback, useEffect, useState } from "react";

import { DataTable, Td, Th, Tr } from "@/components/data-table";
import { formatNumber } from "@/lib/format";
import {
  countedSettlements,
  fetchSettledVolume,
  formatAssetVolume,
  type SettledVolume,
} from "@/lib/live-volume";
import { NODE_CHANGED_EVENT, readNodeSelection } from "@/lib/node-preference";

/**
 * Settled volume, per asset, from the selected node's `getSettledVolume`.
 *
 * Four things here are not presentation choices, because each of them
 * stops a specific way this panel could lie:
 *
 * 1. **No total row.** These are different tokens at different scales, so
 *    one combined figure would add SOL to USDC and do it silently. The
 *    only cross-asset number here is a count of settlements, which is a
 *    count of trades rather than a sum of money.
 * 2. **Decimals come from the node, and can be `null`.** An unnamed mint
 *    is shown by address with its raw base-unit total, labelled as such.
 *    Guessing 6 is how wSOL, which is 9, reports a thousand times too
 *    large — plausible, wrong, and undetectable on screen.
 * 3. **`unattributed_settlements` is surfaced whenever it is non-zero.**
 *    Those are real confirmed settlements whose advertisement was deleted,
 *    so their asset is unrecoverable. Hiding them makes the table look
 *    complete when it is short.
 * 4. **`scope` is printed verbatim, beside the figures.** It is the node
 *    saying these are settlements it replicated and confirmed, not the
 *    network's whole history. A volume figure without its scope reads as a
 *    global total.
 */
export function SettledVolumePanel() {
  const [volume, setVolume] = useState<SettledVolume | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nodeLabel, setNodeLabel] = useState("");

  const load = useCallback(async () => {
    const selection = readNodeSelection();
    setNodeLabel(selection.label);
    setError(null);
    try {
      setVolume(await fetchSettledVolume(selection.url));
    } catch (err) {
      // "This node has settled nothing" and "this node could not answer"
      // are different facts, and a zero shown for the second is a claim
      // about the network made out of a failed request.
      setVolume(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load();
    window.addEventListener(NODE_CHANGED_EVENT, load);
    return () => window.removeEventListener(NODE_CHANGED_EVENT, load);
  }, [load]);

  return (
    <div>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
        Settled volume
      </h2>

      {error !== null && (
        <p className="mt-3 border-l-2 border-amber-400/50 bg-amber-400/5 px-3 py-2 text-xs leading-relaxed text-amber-200">
          {nodeLabel || "This node"} could not answer <code className="font-mono">getSettledVolume</code>.
          Nothing is shown rather than a zero, which would read as &ldquo;nothing has settled&rdquo;.
          <span className="mt-1 block font-mono text-[11px] text-amber-300/70">{error}</span>
        </p>
      )}

      {volume !== null && (
        <>
          <div className="mt-3">
            <DataTable
              minWidth={520}
              head={
                <tr>
                  {/* Explicit widths. Left to the auto algorithm, the caveat
                      text under a figure decided the column widths and the
                      mint column collapsed to a six-character ribbon. */}
                  <Th className="w-[45%]">Asset</Th>
                  <Th right className="w-[40%]">Settled</Th>
                  <Th right className="w-[15%]">Settlements</Th>
                </tr>
              }
            >
              {volume.assets.map((asset) => {
                const figure = formatAssetVolume(asset);
                return (
                  <Tr key={asset.assetMint}>
                    <Td py="py-4">
                      {asset.assetSymbol ? (
                        <span className="text-gray-200" title={asset.assetMint}>
                          {asset.assetSymbol}
                        </span>
                      ) : (
                        <span className="font-mono text-xs text-gray-300 [overflow-wrap:anywhere]">
                          {asset.assetMint}
                        </span>
                      )}
                      {/* The mint is the fact; a symbol is a nickname a node
                          applied to it. Both, always, so a reader checking
                          which USDC this is does not have to leave the row. */}
                      {asset.assetSymbol && (
                        <span className="mt-0.5 block font-mono text-[11px] text-gray-600 [overflow-wrap:anywhere]">
                          {asset.assetMint}
                        </span>
                      )}
                    </Td>
                    <Td py="py-4" right num className="w-48 text-gray-200">
                      <span className="tabular-nums">
                        {figure.approximate && "≈ "}
                        {figure.value}
                      </span>{" "}
                      <span className={figure.rawBaseUnits ? "text-xs text-amber-300/80" : "text-xs text-gray-500"}>
                        {figure.unit}
                      </span>
                      {/* `whitespace-normal` because `Td num` sets nowrap for
                          the figure, and `max-w` so a caveat cannot widen its
                          own column. */}
                      {figure.rawBaseUnits && (
                        <span className="mt-1 ml-auto block max-w-64 whitespace-normal text-left text-[11px] leading-snug text-amber-300/70">
                          This node has no name for this mint and so no decimals for it. Base
                          units, not whole tokens — where the point goes is not something this
                          app may guess.
                        </span>
                      )}
                      {figure.approximate && (
                        <span className="mt-1 ml-auto block max-w-64 whitespace-normal text-left text-[11px] leading-snug text-amber-300/70">
                          Larger than a JSON number holds exactly; the last digits are lost.
                        </span>
                      )}
                    </Td>
                    <Td py="py-4" right num className="w-28 text-gray-400">
                      {formatNumber(asset.settlements, 0)}
                    </Td>
                  </Tr>
                );
              })}
              {volume.assets.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-sm text-gray-500">
                    No settlement on this node has been confirmed on chain yet.
                  </td>
                </tr>
              )}
            </DataTable>
          </div>

          {/* Deliberately no total row above. */}
          <p className="mt-3 text-xs leading-relaxed text-gray-500">
            One row per asset, never added together — these are different tokens at
            different scales, and a single &ldquo;total volume&rdquo; would add SOL to USDC
            without saying so.
          </p>

          <dl className="mt-4 grid gap-x-8 gap-y-2 text-xs sm:grid-cols-2">
            <div className="flex justify-between gap-4 border-t border-white/5 pt-2">
              <dt className="text-gray-500">Settlements counted</dt>
              <dd className="tabular-nums text-gray-300">
                {formatNumber(countedSettlements(volume), 0)} of{" "}
                {formatNumber(volume.settlementsKnown, 0)} known
              </dd>
            </div>
            {volume.unattributedSettlements > 0 && (
              <div className="flex justify-between gap-4 border-t border-amber-400/20 pt-2">
                <dt className="text-amber-200/90">Confirmed, asset unrecoverable</dt>
                <dd className="tabular-nums text-amber-200">
                  {formatNumber(volume.unattributedSettlements, 0)}
                </dd>
              </div>
            )}
          </dl>

          {volume.unattributedSettlements > 0 && (
            <p className="mt-2 text-[11px] leading-relaxed text-amber-300/70">
              Real settlements, confirmed on chain, whose advertisement has since been
              deleted — the route from a settlement to its mint runs through the
              advertisement, so nothing can say which token these moved. They are missing
              from every row above.
            </p>
          )}

          {/* The node's own sentence, unedited, next to the numbers it qualifies. */}
          <p className="mt-4 border-l-2 border-white/10 pl-3 text-[11px] leading-relaxed text-gray-500">
            Scope: {volume.scope}
          </p>
        </>
      )}
    </div>
  );
}
