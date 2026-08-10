import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { sha256 } from "@noble/hashes/sha2.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { debridge } from "@openfiat/sdk";

import { CROSS_CHAIN_LIVE_CALLS_ENABLED, parseSolanaRecipient } from "@/lib/debridge-order";
import { NETWORK_LABEL } from "@/lib/node-endpoint";
import { DEVNET_SETTLEMENT_MINT } from "@/lib/onchain-config";
import type { SourceChainKey as OtherChain } from "@/lib/wallet/source-wallet";

/**
 * Non-custodial stablecoin bridging (SP-C): USDC/USDT between the user's own
 * wallet on another chain and their own Solana wallet, via deBridge's DLN.
 *
 * This is deliberately *not* the presale's "pay from another chain" flow
 * (`lib/debridge-order.ts`, SP-B): there is no OpenFiat program instruction
 * anywhere in this module, no hook, no `SaleConfig` read. It is the plain
 * transfer `@openfiat/sdk`'s `debridge.buildStablecoinDepositOrder`/
 * `buildStablecoinWithdrawOrder` build — a user's funds move between two
 * wallets they themselves control, and OpenFiat never touches them. This
 * module owns exactly what those pure builders don't: chain/token-address
 * lookups, destination-address validation for both directions, decimal
 * amount parsing, and the gated `create-tx` calls.
 *
 * # `OtherChain` is `lib/wallet/source-wallet.ts`'s `SourceChainKey`
 *
 * Re-exported under a name that reads correctly from both directions of
 * this panel: on deposit it's the source chain (where funds start), on
 * withdraw it's the destination chain (where funds end up). One type, one
 * chain list, one set of wallet adapters — widened in that module (SP-C
 * Task 2) to cover every chain `debridge.CHAIN_STABLECOIN_TOKENS` lists.
 *
 * # Reuses `CROSS_CHAIN_LIVE_CALLS_ENABLED`, does not redefine it
 *
 * One gate for every live deBridge call this app makes, SP-B or SP-C — a
 * second env var here would mean an operator could flip one gate on and
 * forget the other still guards a different live-call path. Off by default,
 * enforced inside the network functions below, not just in the UI (see
 * `assertLiveCallsEnabled` in `lib/debridge-order.ts`).
 */

export type { OtherChain };
export { CROSS_CHAIN_LIVE_CALLS_ENABLED };

export type Direction = "deposit" | "withdraw";
export type Stablecoin = debridge.StablecoinSymbol;

/** Every non-Solana chain the SDK's reference token table covers, in the app's preferred display order. */
export const OTHER_CHAINS: OtherChain[] = [
  "ethereum",
  "bsc",
  "polygon",
  "arbitrum",
  "optimism",
  "avalanche",
  "base",
  "tron",
];

/**
 * Derived from the SDK's own canonical mint table rather than declared as a
 * literal here — `tests/exchange-assets.test.tsx`'s "asset tickers are
 * never declared as a list in this app" guard exists precisely because a
 * ticker list this app writes for itself can silently disagree with the
 * authority that actually names mints. `@openfiat/sdk`'s
 * `SOLANA_STABLECOIN_MINTS.mainnet` is that authority for these two
 * symbols (deBridge's DLN only ever moves USDC/USDT for this feature), so
 * its keys are the source of truth, not a second list kept in sync by hand.
 */
export const STABLECOINS: Stablecoin[] = Object.keys(
  debridge.SOLANA_STABLECOIN_MINTS.mainnet,
) as Stablecoin[];

// ---------------------------------------------------------------------------
// Solana recipient validation — reused verbatim from SP-B, not reimplemented.
// ---------------------------------------------------------------------------

export { parseSolanaRecipient };
export type { SolanaRecipientError, SolanaRecipientResult } from "@/lib/debridge-order";

// ---------------------------------------------------------------------------
// Destination-address validation for the "other chain" (EVM checksum, Tron
// base58check). Used on withdraw, where the destination is the caller-typed
// address this module cannot otherwise sanity-check before it's handed to
// deBridge.
// ---------------------------------------------------------------------------

export type DestinationAddressError = "invalid" | "badChecksum" | "wrongPrefix";

export type DestinationAddressResult =
  | { ok: true; address: string }
  | { ok: false; reason: DestinationAddressError };

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * EIP-55 checksum check. An address typed all-lowercase or all-uppercase is
 * accepted unchecksummed (EIP-55 only ever *encodes* case information — a
 * wallet or explorer that never applied it is not thereby invalid, and most
 * addresses arrive lowercase from copy-paste). A *mixed*-case address must
 * satisfy the checksum, because mixed case is only ever produced by
 * checksum encoding — mixed case that fails it is far more likely a typo
 * than an unchecksummed address that happens to vary in case.
 */
function isEip55Checksum(address: string): boolean {
  const hex = address.slice(2);
  const hash = bytesToHex(keccak_256(new TextEncoder().encode(hex.toLowerCase())));
  for (let i = 0; i < hex.length; i++) {
    const char = hex[i];
    if (!/[a-fA-F]/.test(char)) continue; // digits carry no case
    const nibbleIsHigh = parseInt(hash[i], 16) >= 8;
    const isUpper = char === char.toUpperCase();
    if (nibbleIsHigh !== isUpper) return false;
  }
  return true;
}

/** Validates an EVM (Ethereum/BSC/Polygon/Arbitrum/Optimism/Avalanche/Base) destination address. */
export function validateEvmAddress(input: string): DestinationAddressResult {
  const trimmed = input.trim();
  if (!EVM_ADDRESS_RE.test(trimmed)) return { ok: false, reason: "invalid" };
  const hex = trimmed.slice(2);
  const mixedCase = /[a-f]/.test(hex) && /[A-F]/.test(hex);
  if (mixedCase && !isEip55Checksum(trimmed)) return { ok: false, reason: "badChecksum" };
  return { ok: true, address: trimmed };
}

/** TRON's mainnet address-version byte — every base58check address here must decode to a payload starting with this. */
const TRON_ADDRESS_PREFIX = 0x41;

/**
 * Validates a TRON base58check address: `bs58`-decodes it (this app already
 * depends on `bs58` for Solana/PeerId encoding elsewhere), checks the
 * 21-byte payload's version byte, and recomputes the trailing 4-byte
 * checksum as `sha256(sha256(payload))[0..4]` — base58check's own
 * definition, the same one Bitcoin- and TRON-style addresses share.
 */
export function validateTronAddress(input: string): DestinationAddressResult {
  const trimmed = input.trim();
  if (!trimmed.startsWith("T")) return { ok: false, reason: "wrongPrefix" };
  let bytes: Uint8Array;
  try {
    bytes = bs58.decode(trimmed);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (bytes.length !== 25) return { ok: false, reason: "invalid" };
  const payload = bytes.subarray(0, 21);
  const checksum = bytes.subarray(21, 25);
  if (payload[0] !== TRON_ADDRESS_PREFIX) return { ok: false, reason: "wrongPrefix" };
  const expected = sha256(sha256(payload)).subarray(0, 4);
  for (let i = 0; i < 4; i++) {
    if (expected[i] !== checksum[i]) return { ok: false, reason: "badChecksum" };
  }
  return { ok: true, address: trimmed };
}

/** Dispatches to the right validator for `chain` — Tron's is base58check, every other listed chain is EVM. */
export function validateDestinationAddress(chain: OtherChain, input: string): DestinationAddressResult {
  return chain === "tron" ? validateTronAddress(input) : validateEvmAddress(input);
}

// ---------------------------------------------------------------------------
// Decimal amount parsing. String-exact (no float multiplication) so a
// six-decimal stablecoin amount can never round to the wrong base-unit
// value the way `Math.round(Number(input) * 10 ** decimals)` can for inputs
// float64 cannot represent exactly.
// ---------------------------------------------------------------------------

const DECIMAL_RE = /^\d+(\.\d+)?$/;

/** Parses a decimal-string amount (e.g. `"12.5"`) into base units for a token with `decimals` decimal places. Throws on malformed input, too many fractional digits, or a non-positive amount. */
export function parseAmountToBaseUnits(input: string, decimals: number): bigint {
  const trimmed = input.trim();
  if (!DECIMAL_RE.test(trimmed)) {
    throw new Error(`Not a valid decimal amount: "${input}"`);
  }
  const [whole, frac = ""] = trimmed.split(".");
  if (frac.length > decimals) {
    throw new Error(`"${input}" has more than ${decimals} decimal places`);
  }
  const baseUnits = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, "0") || "0");
  if (baseUnits <= 0n) {
    throw new Error("Amount must be greater than zero");
  }
  return baseUnits;
}

// ---------------------------------------------------------------------------
// Solana mint resolution — canonical mainnet mints from the SDK, or this
// app's own devnet cluster config.
// ---------------------------------------------------------------------------

/**
 * `SOLANA_STABLECOIN_MINTS.devnet` starts empty in the SDK — every app wires
 * its own devnet test mints in. This app's cluster config
 * (`lib/onchain-config.ts`) tracks exactly one devnet settlement stablecoin,
 * `DEVNET_SETTLEMENT_MINT` (the node calls it `tUSDC`), so that's wired in
 * as the USDC entry. There is no second devnet mint to call USDT: building
 * a USDT order on devnet throws via the SDK's own `resolveSolanaMint` ("no
 * Solana mint configured for USDT") until this app's devnet config grows
 * one — noted rather than guessed at, per this task's own brief.
 */
export function resolveSolanaMints(): Readonly<Partial<Record<Stablecoin, debridge.SolanaMintInfo>>> {
  if (NETWORK_LABEL !== "Devnet") {
    return debridge.SOLANA_STABLECOIN_MINTS.mainnet;
  }
  return {
    USDC: { mint: new PublicKey(DEVNET_SETTLEMENT_MINT), tokenProgram: debridge.TOKEN_PROGRAM_ID },
  };
}

/** Looks up `CHAIN_STABLECOIN_TOKENS[chain][stablecoin]` — the reference token address on `chain`. Throws for a combination the table has no entry for (e.g. USDT on Base — see the SDK's own module doc for why). */
export function stablecoinTokenAddress(chain: OtherChain, stablecoin: Stablecoin): string {
  const address = debridge.CHAIN_STABLECOIN_TOKENS[chain]?.[stablecoin];
  if (!address) {
    throw new Error(
      `No reference ${stablecoin} token address for ${chain} — see @openfiat/sdk's CHAIN_STABLECOIN_TOKENS doc comment for known gaps (e.g. no official Base USDT).`,
    );
  }
  return address;
}

// ---------------------------------------------------------------------------
// Order assembly — thin wrappers around the SDK builders that fill in the
// one field each pure builder cannot: the connected wallet's own address.
// Neither builder ever sets `dlnHook` — see the SDK module's own doc and
// `tests/bridge-funds.test.ts`'s explicit assertion of its absence.
// ---------------------------------------------------------------------------

export interface BuildDepositOrderParams {
  otherChain: OtherChain;
  stablecoin: Stablecoin;
  amountBaseUnits: bigint;
  solanaRecipient: PublicKey | string;
  /** The connected source-chain wallet's own address — filled in here because `buildStablecoinDepositOrder` cannot know it. */
  sourceWalletAddress: string;
  /** Overrides {@link resolveSolanaMints}'s cluster-derived default — mainly for tests that want a deterministic mint regardless of which cluster `NEXT_PUBLIC_SOLANA_RPC_URL` happens to resolve to in the environment they run in. */
  solanaMints?: Readonly<Partial<Record<Stablecoin, debridge.SolanaMintInfo>>>;
}

/** Deposit: bridges `stablecoin` from `otherChain` into the caller's own Solana wallet. */
export function buildDepositOrder(params: BuildDepositOrderParams): debridge.CreateTxRequest {
  const request = debridge.buildStablecoinDepositOrder({
    srcChainId: debridge.DEBRIDGE_CHAIN_IDS[params.otherChain],
    srcToken: stablecoinTokenAddress(params.otherChain, params.stablecoin),
    amount: params.amountBaseUnits,
    stablecoin: params.stablecoin,
    solanaRecipient: params.solanaRecipient,
    solanaMints: params.solanaMints ?? resolveSolanaMints(),
  });
  return { ...request, srcChainOrderAuthorityAddress: params.sourceWalletAddress };
}

export interface BuildWithdrawOrderParams {
  otherChain: OtherChain;
  stablecoin: Stablecoin;
  amountBaseUnits: bigint;
  solanaOwner: PublicKey | string;
  /** Validated via {@link validateDestinationAddress} before this is called. */
  dstRecipient: string;
  /** See {@link BuildDepositOrderParams.solanaMints}. */
  solanaMints?: Readonly<Partial<Record<Stablecoin, debridge.SolanaMintInfo>>>;
}

/** Withdraw: bridges `stablecoin` out of the caller's own Solana wallet to `dstRecipient` on `otherChain`. */
export function buildWithdrawOrder(params: BuildWithdrawOrderParams): debridge.CreateTxRequest {
  return debridge.buildStablecoinWithdrawOrder({
    solanaOwner: params.solanaOwner,
    amount: params.amountBaseUnits,
    stablecoin: params.stablecoin,
    dstChainId: debridge.DEBRIDGE_CHAIN_IDS[params.otherChain],
    dstToken: stablecoinTokenAddress(params.otherChain, params.stablecoin),
    dstRecipient: params.dstRecipient,
    solanaMints: params.solanaMints ?? resolveSolanaMints(),
  });
}

// ---------------------------------------------------------------------------
// Live network calls — gated exactly like `lib/debridge-order.ts`'s
// `fetchDlnQuote`/`submitCrossChainOrder`. Never called from a test; vitest
// never sets `NEXT_PUBLIC_ENABLE_CROSS_CHAIN_LIVE_CALLS`.
// ---------------------------------------------------------------------------

export const DLN_CREATE_TX_URL = "https://dln.debridge.finance/v1.0/dln/order/create-tx";

function createTxUrl(request: debridge.CreateTxRequest, base: string): URL {
  const url = new URL(base);
  url.searchParams.set("srcChainId", request.srcChainId);
  url.searchParams.set("srcChainTokenIn", request.srcChainTokenIn);
  url.searchParams.set("srcChainTokenInAmount", request.srcChainTokenInAmount);
  url.searchParams.set("dstChainId", request.dstChainId);
  url.searchParams.set("dstChainTokenOut", request.dstChainTokenOut);
  url.searchParams.set("dstChainTokenOutAmount", request.dstChainTokenOutAmount);
  url.searchParams.set("dstChainTokenOutRecipient", request.dstChainTokenOutRecipient);
  if (request.dstChainOrderAuthorityAddress) {
    url.searchParams.set("dstChainOrderAuthorityAddress", request.dstChainOrderAuthorityAddress);
  }
  return url;
}

function assertLiveCallsEnabled(fn: string): void {
  if (!CROSS_CHAIN_LIVE_CALLS_ENABLED) {
    throw new Error(
      `${fn}: live deBridge calls are disabled in this build (set NEXT_PUBLIC_ENABLE_CROSS_CHAIN_LIVE_CALLS=true once the DLN order shape has been confirmed live — see lib/debridge-order.ts's CROSS_CHAIN_LIVE_CALLS_ENABLED).`,
    );
  }
}

/** deBridge's own `create-tx` response shape, narrowed to what this app reads. Not exhaustive. */
export interface DlnCreateTxResponse {
  estimation?: {
    srcChainTokenIn?: { amount?: string };
    dstChainTokenOut?: { amount?: string; recommendedAmount?: string };
  };
  tx?: { data?: string; to?: string; value?: string };
  orderId?: string;
}

/** Price-only `create-tx` call (no `senderAddress`) — deBridge's docs describe this as safe to call without creating an order. Gated; never called from a test. */
export async function fetchBridgeFundsQuote(
  request: Omit<debridge.CreateTxRequest, "dstChainOrderAuthorityAddress" | "srcChainOrderAuthorityAddress">,
): Promise<DlnCreateTxResponse> {
  assertLiveCallsEnabled("fetchBridgeFundsQuote");
  const url = createTxUrl(request, DLN_CREATE_TX_URL);
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`deBridge create-tx quote failed: HTTP ${res.status}`);
  }
  return (await res.json()) as DlnCreateTxResponse;
}

/** Full `create-tx` call with a real `senderAddress` — returns the transaction for the sending wallet (source-chain wallet on deposit, Solana wallet on withdraw) to sign. Gated; never called from a test. */
export async function submitBridgeFundsOrder(
  request: debridge.CreateTxRequest,
  senderAddress: string,
): Promise<DlnCreateTxResponse> {
  assertLiveCallsEnabled("submitBridgeFundsOrder");
  const url = createTxUrl(request, DLN_CREATE_TX_URL);
  url.searchParams.set("senderAddress", senderAddress);
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`deBridge create-tx order failed: HTTP ${res.status}`);
  }
  return (await res.json()) as DlnCreateTxResponse;
}
