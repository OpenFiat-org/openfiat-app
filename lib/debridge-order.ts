import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { debridge, onchain } from "@openfiat/sdk";

/** `@openfiat/sdk`'s `debridge` submodule is a namespace export (`export * as debridge`), so its types are reached the same way — `debridge.SolanaHookData`, not a flat import. */
type SolanaHookData = debridge.SolanaHookData;

import { getConnection } from "@/lib/onchain-config";
import { decodeSaleConfig, type DecodedSaleConfig } from "@/lib/onchain-decode";
import { PRESALE_PROGRAM_ID } from "@/lib/live-presale";
import { tokenProgramForMint } from "@/lib/vault-instructions";

/**
 * SP-B cross-chain presale: paying from EVM/BSC/Tron for OPEN on Solana via
 * deBridge's DLN, with `@openfiat/sdk`'s `debridge.buildDeliverContributionHook`
 * (SP-B Task 2) doing the auto-delivery hook's byte encoding.
 *
 * This module owns exactly the three things a caller needs that the SDK
 * builder does not and cannot supply on its own: which accounts the
 * currently-deployed `presale` program actually holds them at (an RPC read,
 * which the SDK's pure builder deliberately never performs — see
 * `hook.ts`'s own module doc), the deBridge DLN order request those
 * instructions get wrapped into, and Solana-recipient validation. It does
 * **not** re-encode anything `buildDeliverContributionHook` already encodes.
 *
 * # This targets a `SaleConfig` PDA scheme that is not the one deployed today
 *
 * `openfiat-core`'s presale program was extended for cross-chain delivery in
 * commit `634cddd` (`deliver_contribution`, SP-B Task 1): `initialize_sale`
 * now seeds `SaleConfig` as `[SALE_CONFIG_SEED, sale_nonce_le]` rather than
 * the singleton `[SALE_CONFIG_SEED]` the currently-deployed devnet program
 * (and `lib/live-presale.ts`'s own `saleConfigPda()`) still uses. That
 * upgraded program has not been redeployed anywhere — Task 1's own report
 * says so, and it is the same "Task 4 pre-mainnet gate" this module's live
 * calls are gated behind. `saleConfigPdaForNonce` below computes the *new*
 * scheme (nonce `0n`, matching the program's own "v1 production usage is a
 * single sale at nonce 0" comment) deliberately kept separate from
 * `lib/live-presale.ts`'s `saleConfigPda()`, which must keep answering for
 * the program that is actually live today.
 */

// ---------------------------------------------------------------------------
// PDAs the new (not-yet-deployed) presale build derives that the SDK's pure
// hook builder takes as caller-supplied inputs instead of deriving itself.
// ---------------------------------------------------------------------------

/** `openfiat-core/programs/programs/presale/src/constants.rs::SALE_CONFIG_SEED`. */
const SALE_CONFIG_SEED = Buffer.from("sale_config");

/** `openfiat-core/programs/programs/presale/src/constants.rs::PRESALE_VAULT_SEED`. */
const PRESALE_VAULT_SEED = Buffer.from("presale_vault");

/** "v1 production usage is a single sale at nonce 0" — `initialize_sale.rs`'s own comment. */
export const DEFAULT_SALE_NONCE = 0n;

function u64LeBytes(value: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(value);
  return buf;
}

/** `[SALE_CONFIG_SEED, sale_nonce_le]` — the nonce-keyed scheme `634cddd` introduced. */
export function saleConfigPdaForNonce(saleNonce: bigint, programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [SALE_CONFIG_SEED, u64LeBytes(saleNonce)],
    programId,
  );
  return pda;
}

/** `[PRESALE_VAULT_SEED]` — unchanged by the nonce migration, still a singleton. */
export function presaleVaultAuthorityPda(programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([PRESALE_VAULT_SEED], programId);
  return pda;
}

/**
 * Reads and decodes the `SaleConfig` at the nonce-keyed PDA. `null` exactly
 * like `fetchSaleConfig` in `lib/live-presale.ts`: no account means no sale
 * to read, never a zero or an assumed default.
 */
export async function fetchCrossChainSaleConfig(
  saleNonce: bigint = DEFAULT_SALE_NONCE,
  programId: PublicKey = new PublicKey(PRESALE_PROGRAM_ID),
): Promise<DecodedSaleConfig | null> {
  const pda = saleConfigPdaForNonce(saleNonce, programId);
  const account = await getConnection().getAccountInfo(pda);
  return account ? decodeSaleConfig(account.data) : null;
}

// ---------------------------------------------------------------------------
// Solana recipient validation.
// ---------------------------------------------------------------------------

export type SolanaRecipientError = "invalid" | "offCurve";

export type SolanaRecipientResult =
  | { ok: true; pubkey: PublicKey }
  | { ok: false; reason: SolanaRecipientError };

/**
 * Parses and validates a Solana recipient address for cross-chain delivery.
 *
 * Rejects anything that isn't a real ed25519 public key on the curve —
 * `PublicKey.isOnCurve` is exactly what distinguishes a wallet a private key
 * exists for from a PDA, which by construction has no private key and
 * cannot receive a `deliver_contribution` hook's `recipient_open` ATA
 * transfer in any way that could ever be spent onward. A buyer pasting a
 * program address here would otherwise strand the bridged OPEN.
 */
export function parseSolanaRecipient(input: string): SolanaRecipientResult {
  const trimmed = input.trim();
  let pubkey: PublicKey;
  try {
    pubkey = new PublicKey(trimmed);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (!PublicKey.isOnCurve(pubkey.toBytes())) {
    return { ok: false, reason: "offCurve" };
  }
  return { ok: true, pubkey };
}

// ---------------------------------------------------------------------------
// The deliver_contribution hook, assembled from a fetched SaleConfig.
// ---------------------------------------------------------------------------

/** Everything `debridge.buildDeliverContributionHook` needs, resolved. */
export interface CrossChainHookInputs {
  saleNonce: bigint;
  recipient: PublicKey;
  usdcAmount: bigint;
  programId: PublicKey;
  saleConfig: PublicKey;
  usdcVault: PublicKey;
  presaleVault: PublicKey;
  presaleVaultAuthority: PublicKey;
  openMint: PublicKey;
  usdcMint: PublicKey;
  banRecord: PublicKey;
  usdcTokenProgram: PublicKey;
  openTokenProgram: PublicKey;
  reward?: bigint;
  expense?: bigint;
}

/** Pure assembly: turns already-resolved accounts into the DLN hook payload. Does not touch the network. */
export function buildPresaleDeliveryHook(inputs: CrossChainHookInputs): SolanaHookData {
  return debridge.buildDeliverContributionHook({
    saleNonce: inputs.saleNonce,
    recipient: inputs.recipient,
    usdcAmount: inputs.usdcAmount,
    programId: inputs.programId,
    saleConfig: inputs.saleConfig,
    usdcVault: inputs.usdcVault,
    presaleVault: inputs.presaleVault,
    presaleVaultAuthority: inputs.presaleVaultAuthority,
    openMint: inputs.openMint,
    usdcMint: inputs.usdcMint,
    banRecord: inputs.banRecord,
    tokenPrograms: { usdc: inputs.usdcTokenProgram, open: inputs.openTokenProgram },
    reward: inputs.reward,
    expense: inputs.expense,
  });
}

/**
 * Resolves every account `buildPresaleDeliveryHook` needs against the
 * live cluster: the `SaleConfig` itself, and the token program each mint it
 * names actually moves under (never assumed — USDC and OPEN can differ, see
 * `deliver_contribution.rs`'s own doc comment).
 *
 * Throws if no `SaleConfig` exists at the nonce-keyed PDA — there is nothing
 * honest to build a hook against otherwise, matching `fetchSaleConfig`'s own
 * "no account, no answer" rule elsewhere in this app.
 */
export async function resolveCrossChainHookInputs(
  recipient: PublicKey,
  usdcAmount: bigint,
  saleNonce: bigint = DEFAULT_SALE_NONCE,
): Promise<CrossChainHookInputs> {
  const programId = new PublicKey(PRESALE_PROGRAM_ID);
  const saleConfigPda = saleConfigPdaForNonce(saleNonce, programId);
  const config = await fetchCrossChainSaleConfig(saleNonce, programId);
  if (!config) {
    throw new Error(
      `No SaleConfig at ${saleConfigPda.toBase58()} (sale_nonce=${saleNonce}) — the cross-chain-capable presale build is not deployed on this cluster yet.`,
    );
  }
  const [usdcTokenProgram, openTokenProgram] = await Promise.all([
    tokenProgramForMint(config.usdcMint),
    tokenProgramForMint(config.openMint),
  ]);
  return {
    saleNonce,
    recipient,
    usdcAmount,
    programId,
    saleConfig: saleConfigPda,
    usdcVault: config.usdcVault,
    presaleVault: config.presaleVault,
    presaleVaultAuthority: presaleVaultAuthorityPda(programId),
    openMint: config.openMint,
    usdcMint: config.usdcMint,
    banRecord: onchain.banRecordPda(recipient)[0],
    usdcTokenProgram,
    openTokenProgram,
  };
}

// ---------------------------------------------------------------------------
// deBridge DLN chain ids and the `create-tx` order request.
// ---------------------------------------------------------------------------

/**
 * deBridge's own "Internal Chain ID" values (its `srcChainId`/`dstChainId`
 * API parameters) — from `docs.debridge.com`'s DLN fee table, fetched while
 * writing this module. For an EVM chain the internal id is just its real
 * EVM chain id (Ethereum `1`, BNB Chain `56`); Solana and TRON are not EVM
 * chains, so deBridge assigns each a synthetic one distinct from anything
 * on-chain — TRON's real chain id is `728126428`, but deBridge's API wants
 * `100000026`, its own internal id, not that value. Unconfirmed against a
 * live `create-tx` call (see the module doc's live-validation gate).
 */
export const SOURCE_CHAIN_IDS = {
  ethereum: 1,
  bsc: 56,
  tron: 100_000_026,
} as const;

export type SourceChainKey = keyof typeof SOURCE_CHAIN_IDS;

/** Solana's deBridge internal chain id — also its real, only chain id. */
export const SOLANA_DST_CHAIN_ID = 7_565_164;

/**
 * The `create-tx` GET endpoint's query parameters this app fills in, per
 * `docs.debridge.com`'s "API Parameters" page (fetched while writing this
 * module). `dlnHook` is passed as `JSON.stringify(...)` of the hook object,
 * per that same page's worked examples — `toCreateTxUrl` below does that
 * encoding.
 */
export interface CrossChainOrderRequest {
  srcChainId: string;
  srcChainTokenIn: string;
  srcChainTokenInAmount: string;
  dstChainId: string;
  dstChainTokenOut: string;
  dstChainTokenOutAmount: "auto";
  /**
   * The order's fallback recipient. Per deBridge docs this is who receives
   * the destination-chain token "after fulfillment" — i.e., if the hook
   * never runs (skipped, or fails; `deliver_contribution`'s hook always
   * carries `executePolicy: "empty"`, deBridge's only success-optional
   * policy for this hook type, so a `deliver_contribution` revert cannot
   * fail the order itself). Set to the recipient's own Solana USDC ATA so a
   * hook that doesn't run still lands real USDC in a wallet the buyer
   * controls, never strands.
   */
  dstChainTokenOutRecipient: string;
  srcChainOrderAuthorityAddress: string;
  /** Must be controlled by the user — the recipient's own Solana wallet, so they alone can cancel the order on Solana. */
  dstChainOrderAuthorityAddress: string;
  dlnHook: SolanaHookData;
}

/** Deriving the recipient's own USDC-on-Solana ATA — the fallback-delivery target if the hook is skipped. */
export function recipientUsdcAta(inputs: Pick<CrossChainHookInputs, "recipient" | "usdcMint" | "usdcTokenProgram">): PublicKey {
  return getAssociatedTokenAddressSync(inputs.usdcMint, inputs.recipient, true, inputs.usdcTokenProgram);
}

/**
 * Assembles the DLN order request: the built hook targets
 * `deliver_contribution`, and the fallback recipient is always the
 * recipient's own USDC ATA — never the source wallet, never the executor.
 * Pure; does not touch the network.
 */
export function buildCrossChainOrderRequest(params: {
  sourceChain: SourceChainKey;
  sourceTokenAddress: string;
  sourceAmountBaseUnits: bigint;
  sourceWalletAddress: string;
  hookInputs: CrossChainHookInputs;
}): CrossChainOrderRequest {
  const hook = buildPresaleDeliveryHook(params.hookInputs);
  return {
    srcChainId: String(SOURCE_CHAIN_IDS[params.sourceChain]),
    srcChainTokenIn: params.sourceTokenAddress,
    srcChainTokenInAmount: params.sourceAmountBaseUnits.toString(),
    dstChainId: String(SOLANA_DST_CHAIN_ID),
    dstChainTokenOut: params.hookInputs.usdcMint.toBase58(),
    dstChainTokenOutAmount: "auto",
    dstChainTokenOutRecipient: recipientUsdcAta(params.hookInputs).toBase58(),
    srcChainOrderAuthorityAddress: params.sourceWalletAddress,
    dstChainOrderAuthorityAddress: params.hookInputs.recipient.toBase58(),
    dlnHook: hook,
  };
}

/** The live `create-tx` endpoint. Only ever read by `fetchDlnQuote`/`submitCrossChainOrder`, both gated below. */
export const DLN_CREATE_TX_URL = "https://dln.debridge.finance/v1.0/dln/order/create-tx";

/** Turns a request into the GET URL `create-tx` actually accepts. */
export function toCreateTxUrl(request: CrossChainOrderRequest, base: string = DLN_CREATE_TX_URL): string {
  const url = new URL(base);
  url.searchParams.set("srcChainId", request.srcChainId);
  url.searchParams.set("srcChainTokenIn", request.srcChainTokenIn);
  url.searchParams.set("srcChainTokenInAmount", request.srcChainTokenInAmount);
  url.searchParams.set("dstChainId", request.dstChainId);
  url.searchParams.set("dstChainTokenOut", request.dstChainTokenOut);
  url.searchParams.set("dstChainTokenOutAmount", request.dstChainTokenOutAmount);
  url.searchParams.set("dstChainTokenOutRecipient", request.dstChainTokenOutRecipient);
  url.searchParams.set("srcChainOrderAuthorityAddress", request.srcChainOrderAuthorityAddress);
  url.searchParams.set("dstChainOrderAuthorityAddress", request.dstChainOrderAuthorityAddress);
  url.searchParams.set("dlnHook", JSON.stringify(request.dlnHook));
  return url.toString();
}

// ---------------------------------------------------------------------------
// Live network calls — gated. Task 4's pre-mainnet gate covers exercising
// these against the real DLN; nothing in this codebase calls them with the
// gate off, and vitest never sets the env var that opens it.
// ---------------------------------------------------------------------------

/**
 * Opt-in switch for the two functions below. Off by default, and off in
 * every environment this session can observe (no `.env` here sets it) — so
 * a component that calls `fetchDlnQuote`/`submitCrossChainOrder` fails
 * loudly and specifically rather than silently hitting deBridge's live API
 * from a build nobody meant to wire that up in. Flip to `"true"` only once
 * Task 4 has confirmed the hook envelope shape and account set against a
 * real `create-tx` call.
 */
export const CROSS_CHAIN_LIVE_CALLS_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_CROSS_CHAIN_LIVE_CALLS === "true";

function assertLiveCallsEnabled(fn: string): void {
  if (!CROSS_CHAIN_LIVE_CALLS_ENABLED) {
    throw new Error(
      `${fn}: live deBridge calls are disabled in this build (set NEXT_PUBLIC_ENABLE_CROSS_CHAIN_LIVE_CALLS=true once Task 4 has confirmed the DLN hook envelope live — see lib/debridge-order.ts).`,
    );
  }
}

/** deBridge's own response shape for `create-tx`, narrowed to what this app reads. Not exhaustive. */
export interface DlnCreateTxResponse {
  estimation?: {
    srcChainTokenIn?: { amount?: string };
    dstChainTokenOut?: { amount?: string; recommendedAmount?: string };
  };
  tx?: { data?: string; to?: string; value?: string };
  orderId?: string;
}

/**
 * Calls `create-tx` without a wallet address, which deBridge's own docs
 * describe as safe to do purely for a price estimate — no order is created.
 * Gated (see {@link CROSS_CHAIN_LIVE_CALLS_ENABLED}); never called from a test.
 */
export async function fetchDlnQuote(
  request: Omit<CrossChainOrderRequest, "dstChainOrderAuthorityAddress" | "dlnHook">,
): Promise<DlnCreateTxResponse> {
  assertLiveCallsEnabled("fetchDlnQuote");
  const url = new URL(DLN_CREATE_TX_URL);
  url.searchParams.set("srcChainId", request.srcChainId);
  url.searchParams.set("srcChainTokenIn", request.srcChainTokenIn);
  url.searchParams.set("srcChainTokenInAmount", request.srcChainTokenInAmount);
  url.searchParams.set("dstChainId", request.dstChainId);
  url.searchParams.set("dstChainTokenOut", request.dstChainTokenOut);
  url.searchParams.set("dstChainTokenOutAmount", request.dstChainTokenOutAmount);
  url.searchParams.set("dstChainTokenOutRecipient", request.dstChainTokenOutRecipient);
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`deBridge create-tx quote failed: HTTP ${res.status}`);
  }
  return (await res.json()) as DlnCreateTxResponse;
}

/**
 * Calls `create-tx` with the full order (including the hook and a real
 * `senderAddress`) and returns the transaction for the source wallet to
 * sign. Gated; never called from a test. Submitting the returned
 * transaction through a `SourceWalletAdapter` is the caller's job — this
 * function only talks to deBridge, it never touches a wallet.
 */
export async function submitCrossChainOrder(
  request: CrossChainOrderRequest,
  senderAddress: string,
): Promise<DlnCreateTxResponse> {
  assertLiveCallsEnabled("submitCrossChainOrder");
  const url = new URL(toCreateTxUrl(request));
  url.searchParams.set("senderAddress", senderAddress);
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`deBridge create-tx order failed: HTTP ${res.status}`);
  }
  return (await res.json()) as DlnCreateTxResponse;
}
