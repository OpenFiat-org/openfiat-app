import { Client } from "@openfiat/sdk";
import { tradingSymbol } from "@/lib/asset-display";

/**
 * What the network has actually moved, per asset, from a node's
 * `getSettledVolume`.
 *
 * # Only settled, only confirmed, and only this node's view
 *
 * A settlement counts on the node when it carries an
 * `escrow_release_signature` — when that node independently observed the
 * on-chain release confirm. Everything looser measures intent: a
 * reservation is a request, an initiated settlement is a trade in
 * progress, and a sum over advertisements is what merchants say they are
 * willing to trade.
 *
 * That still leaves a figure that is smaller than "the network's volume",
 * and the node says so itself in `scope`. This module carries that
 * sentence through to the screen rather than paraphrasing it, because a
 * volume figure shown without its scope reads as a global total.
 */
export interface AssetVolume {
  /** The mint — the identity, always present. */
  assetMint: string;
  /**
   * The name this build of the node has for the mint, or `null`.
   *
   * `null` arrives together with `decimals: null`: a node that cannot name
   * a mint also cannot say where its decimal point goes. Both nulls are
   * ordinary answers and neither is a reason to guess — see
   * `formatAssetVolume`.
   */
  assetSymbol: string | null;
  decimals: number | null;
  /** Summed in base units on the node, so nothing rounded on the way here. */
  baseUnits: number;
  settlements: number;
}

export interface SettledVolume {
  /**
   * One entry per asset. Never summed — different tokens at different
   * scales, so a combined figure would add SOL to USDC and do it silently.
   */
  assets: AssetVolume[];
  /**
   * Confirmed settlements whose asset could not be established, because
   * the advertisement behind them was deleted (OFS-2100 §21).
   *
   * Real trades that really moved money, with no route left to their mint.
   * Shown whenever it is non-zero: a total that quietly omits what it
   * could not classify looks complete and is not.
   */
  unattributedSettlements: number;
  /** Every settlement the node holds, confirmed or not. */
  settlementsKnown: number;
  /** The node's own sentence about what these figures are not. */
  scope: string;
}

interface WireAssetVolume {
  asset_mint: string;
  asset_symbol: string | null;
  decimals: number | null;
  base_units: number;
  settlements: number;
}

interface WireSettledVolume {
  assets: WireAssetVolume[];
  unattributed_settlements: number;
  settlements_known: number;
  scope: string;
}

/** Reads `getSettledVolume` from one node. Throws if the node cannot answer. */
export async function fetchSettledVolume(endpoint: string): Promise<SettledVolume> {
  const client = new Client({ endpoint, timeoutMs: 8_000 });
  const wire = await client.call<Record<string, never>, WireSettledVolume>(
    "getSettledVolume",
    {},
  );
  return {
    assets: (wire.assets ?? []).map((a) => ({
      assetMint: a.asset_mint,
      assetSymbol: a.asset_symbol,
      decimals: a.decimals,
      baseUnits: a.base_units,
      settlements: a.settlements,
    })),
    unattributedSettlements: wire.unattributed_settlements,
    settlementsKnown: wire.settlements_known,
    scope: wire.scope,
  };
}

/** How an asset's volume should be written on screen. */
export interface VolumeFigure {
  /** The number to print. */
  value: string;
  /** What that number counts: the token's name, or "base units". */
  unit: string;
  /**
   * True when `value` is a count of the mint's smallest indivisible unit
   * rather than of whole tokens, because the node had no decimals for it.
   */
  rawBaseUnits: boolean;
  /**
   * True when the figure passed through a JSON number too large to
   * represent exactly, so the digits shown are approximate.
   *
   * The node totals in `u128`; JSON has one number type and it stops being
   * exact above 2^53. Saying so is the only honest option left by the
   * time the value reaches this app — the precision is already gone.
   */
  approximate: boolean;
}

/**
 * An asset's settled volume, formatted from the decimals the NODE reported.
 *
 * `decimals: null` means this build of the node has no entry for the mint.
 * It can still total the base units — that is just addition — but it
 * cannot say where the decimal point goes, so neither can this. The count
 * of base units is shown as exactly that, labelled as such, beside the
 * address. Assuming 6 is how wSOL, which is 9, comes out a thousand times
 * too large: a plausible number, wrong by three orders of magnitude, with
 * nothing on screen to give it away.
 */
export function formatAssetVolume(asset: AssetVolume): VolumeFigure {
  const approximate = !Number.isSafeInteger(asset.baseUnits);

  if (asset.decimals === null) {
    return {
      value: asset.baseUnits.toLocaleString("en-US", { maximumFractionDigits: 0 }),
      unit: "base units",
      rawBaseUnits: true,
      approximate,
    };
  }

  const whole = asset.baseUnits / 10 ** asset.decimals;
  return {
    value: whole.toLocaleString("en-US", {
      minimumFractionDigits: Math.min(2, asset.decimals),
      maximumFractionDigits: Math.min(2, asset.decimals),
    }),
    // The node's name, except for the native mint, which a reader of a
    // settled-volume figure knows as SOL — see `lib/asset-display.ts`.
    unit: tradingSymbol(asset.assetMint, asset.assetSymbol) ?? asset.assetMint,
    rawBaseUnits: false,
    approximate,
  };
}

/**
 * Settlements the node counted into `assets`, across every asset.
 *
 * A count of trades, not a sum of money: adding SOL to USDC is the thing
 * this whole response is shaped to prevent, and adding *how many times*
 * each moved is a different question with a meaningful answer. Reported
 * beside `settlementsKnown` so the gap reads as trades in flight rather
 * than as a discrepancy.
 */
export function countedSettlements(volume: SettledVolume): number {
  return volume.assets.reduce((n, a) => n + a.settlements, 0);
}
