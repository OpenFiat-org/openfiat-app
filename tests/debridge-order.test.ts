// @vitest-environment node
//
// `PublicKey.findProgramAddressSync`/`isOnCurve` misbehave under jsdom in
// this workspace — see `tests/vault-wsol.test.ts`'s own use of this same
// pragma for the same class of PDA-deriving test.
import { Keypair, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { debridge, onchain } from "@openfiat/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildCrossChainOrderRequest,
  buildPresaleDeliveryHook,
  CROSS_CHAIN_LIVE_CALLS_ENABLED,
  DEFAULT_SALE_NONCE,
  fetchDlnQuote,
  parseSolanaRecipient,
  presaleVaultAuthorityPda,
  recipientUsdcAta,
  saleConfigPdaForNonce,
  SOLANA_DST_CHAIN_ID,
  SOURCE_CHAIN_IDS,
  submitCrossChainOrder,
  toCreateTxUrl,
  type CrossChainHookInputs,
} from "@/lib/debridge-order";
import { PRESALE_PROGRAM_ID } from "@/lib/live-presale";

/**
 * SP-B Task 3: the pure logic behind "pay from another chain" — Solana
 * recipient validation and the DLN order/hook assembly. The live deBridge
 * calls (`fetchDlnQuote`, `submitCrossChainOrder`) are gated off by default
 * (see `CROSS_CHAIN_LIVE_CALLS_ENABLED` in `lib/debridge-order.ts`) and this
 * file exercises exactly that: that they refuse to run, not that they work
 * against a real endpoint — no live DLN is available in this environment
 * (Task 4's gate).
 */

const PROGRAM_ID = new PublicKey(PRESALE_PROGRAM_ID);

describe("parseSolanaRecipient", () => {
  it("accepts a real wallet — an on-curve ed25519 key", () => {
    // A generated Keypair's public key is on-curve by construction (it's an
    // ed25519 public key with a real private key behind it), unlike a PDA.
    const kp = new Keypair();
    const result = parseSolanaRecipient(kp.publicKey.toBase58());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.pubkey.equals(kp.publicKey)).toBe(true);
  });

  it("rejects a PDA — off-curve by construction, so nobody holds its private key", () => {
    const [pda] = PublicKey.findProgramAddressSync([Buffer.from("contribution")], PROGRAM_ID);
    expect(PublicKey.isOnCurve(pda.toBytes())).toBe(false);
    const result = parseSolanaRecipient(pda.toBase58());
    expect(result).toEqual({ ok: false, reason: "offCurve" });
  });

  it("rejects garbage input rather than throwing", () => {
    expect(parseSolanaRecipient("not-a-solana-address")).toEqual({ ok: false, reason: "invalid" });
    expect(parseSolanaRecipient("")).toEqual({ ok: false, reason: "invalid" });
    expect(parseSolanaRecipient("0x1234")).toEqual({ ok: false, reason: "invalid" });
  });

  it("tolerates surrounding whitespace", () => {
    const kp = new Keypair();
    const result = parseSolanaRecipient(`  ${kp.publicKey.toBase58()}  `);
    expect(result.ok).toBe(true);
  });
});

describe("PDA derivation matches the presale program's own seeds", () => {
  it("saleConfigPdaForNonce: [sale_config, nonce_le]", () => {
    const nonceZero = Buffer.alloc(8); // 0n little-endian
    const [expected] = PublicKey.findProgramAddressSync([Buffer.from("sale_config"), nonceZero], PROGRAM_ID);
    expect(saleConfigPdaForNonce(0n, PROGRAM_ID).equals(expected)).toBe(true);
  });

  it("differs by nonce — the whole point of the nonce-keyed scheme", () => {
    const zero = saleConfigPdaForNonce(0n, PROGRAM_ID);
    const one = saleConfigPdaForNonce(1n, PROGRAM_ID);
    expect(zero.equals(one)).toBe(false);
  });

  it("presaleVaultAuthorityPda: [presale_vault] — unchanged, still a singleton", () => {
    const [expected] = PublicKey.findProgramAddressSync([Buffer.from("presale_vault")], PROGRAM_ID);
    expect(presaleVaultAuthorityPda(PROGRAM_ID).equals(expected)).toBe(true);
  });
});

/** A complete, hand-fixed set of hook inputs — every account distinct, so a mixed-up field shows up as a mismatch rather than an accidental pass. */
function fixtureHookInputs(recipient: PublicKey): CrossChainHookInputs {
  return {
    saleNonce: DEFAULT_SALE_NONCE,
    recipient,
    usdcAmount: 5_000_000n, // 5 USDC
    programId: PROGRAM_ID,
    saleConfig: saleConfigPdaForNonce(DEFAULT_SALE_NONCE, PROGRAM_ID),
    usdcVault: PublicKey.unique(),
    presaleVault: PublicKey.unique(),
    presaleVaultAuthority: presaleVaultAuthorityPda(PROGRAM_ID),
    openMint: PublicKey.unique(),
    usdcMint: PublicKey.unique(),
    banRecord: onchain.banRecordPda(recipient)[0],
    usdcTokenProgram: TOKEN_PROGRAM_ID,
    openTokenProgram: TOKEN_2022_PROGRAM_ID,
  };
}

describe("buildPresaleDeliveryHook", () => {
  it("targets the presale program with a deliver_contribution-shaped instruction", () => {
    const recipient = PublicKey.unique();
    const inputs = fixtureHookInputs(recipient);
    const hook = buildPresaleDeliveryHook(inputs);

    expect(hook.type).toBe("solana_serialized_instructions");
    const [decoded] = debridge.decodeSolanaHook(hook);
    expect(decoded.instruction.programId.equals(PROGRAM_ID)).toBe(true);
    expect(Buffer.from(decoded.instruction.data.subarray(0, 8))).toEqual(
      Buffer.from(debridge.DELIVER_CONTRIBUTION_DISCRIMINATOR),
    );
  });

  it("does not reimplement the SDK's encoding — round-trips through the SDK's own decoder", () => {
    const recipient = PublicKey.unique();
    const inputs = fixtureHookInputs(recipient);
    const hook = buildPresaleDeliveryHook(inputs);
    const direct = debridge.buildDeliverContributionHook({
      ...inputs,
      tokenPrograms: { usdc: inputs.usdcTokenProgram, open: inputs.openTokenProgram },
    });
    expect(hook).toEqual(direct);
  });
});

describe("buildCrossChainOrderRequest", () => {
  it("carries the hook and sets the fallback recipient to the recipient's own USDC ATA", () => {
    const recipient = PublicKey.unique();
    const hookInputs = fixtureHookInputs(recipient);
    const request = buildCrossChainOrderRequest({
      sourceChain: "bsc",
      sourceTokenAddress: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
      sourceAmountBaseUnits: 5_000_000n,
      sourceWalletAddress: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      hookInputs,
    });

    const expectedFallback = getAssociatedTokenAddressSync(
      hookInputs.usdcMint,
      recipient,
      true,
      hookInputs.usdcTokenProgram,
    );
    expect(request.dstChainTokenOutRecipient).toBe(expectedFallback.toBase58());
    expect(request.dstChainTokenOutRecipient).toBe(recipientUsdcAta(hookInputs).toBase58());

    // The fallback is never the source wallet and never the recipient's raw
    // wallet address — it must be the USDC token account, or a skipped hook
    // delivers to an account that can't hold USDC.
    expect(request.dstChainTokenOutRecipient).not.toBe(request.srcChainOrderAuthorityAddress);
    expect(request.dstChainTokenOutRecipient).not.toBe(recipient.toBase58());

    // Cancellation authority on the destination chain must be the buyer's
    // own controlled wallet, not the fallback ATA or the executor.
    expect(request.dstChainOrderAuthorityAddress).toBe(recipient.toBase58());

    expect(request.srcChainId).toBe(String(SOURCE_CHAIN_IDS.bsc));
    expect(request.dstChainId).toBe(String(SOLANA_DST_CHAIN_ID));

    const [decoded] = debridge.decodeSolanaHook(request.dlnHook);
    expect(decoded.instruction.programId.equals(PROGRAM_ID)).toBe(true);
  });

  it("every supported source chain produces a distinct srcChainId", () => {
    const ids = new Set(Object.values(SOURCE_CHAIN_IDS));
    expect(ids.size).toBe(Object.keys(SOURCE_CHAIN_IDS).length);
  });
});

describe("toCreateTxUrl", () => {
  it("round-trips every field, including the JSON-encoded hook", () => {
    const recipient = PublicKey.unique();
    const hookInputs = fixtureHookInputs(recipient);
    const request = buildCrossChainOrderRequest({
      sourceChain: "ethereum",
      sourceTokenAddress: "native",
      sourceAmountBaseUnits: 1_000_000n,
      sourceWalletAddress: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      hookInputs,
    });
    const url = new URL(toCreateTxUrl(request));
    expect(url.searchParams.get("srcChainId")).toBe(request.srcChainId);
    expect(url.searchParams.get("dstChainId")).toBe(request.dstChainId);
    expect(url.searchParams.get("dstChainTokenOutRecipient")).toBe(request.dstChainTokenOutRecipient);
    expect(url.searchParams.get("dstChainOrderAuthorityAddress")).toBe(request.dstChainOrderAuthorityAddress);
    expect(JSON.parse(url.searchParams.get("dlnHook")!)).toEqual(request.dlnHook);
  });
});

describe("live-call gate", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is off by default in this build", () => {
    expect(CROSS_CHAIN_LIVE_CALLS_ENABLED).toBe(false);
  });

  it("fetchDlnQuote refuses to run, and never touches the network", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(
      fetchDlnQuote({
        srcChainId: "1",
        srcChainTokenIn: "native",
        srcChainTokenInAmount: "1000000",
        dstChainId: String(SOLANA_DST_CHAIN_ID),
        dstChainTokenOut: PublicKey.unique().toBase58(),
        dstChainTokenOutAmount: "auto",
        dstChainTokenOutRecipient: PublicKey.unique().toBase58(),
        srcChainOrderAuthorityAddress: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      }),
    ).rejects.toThrow(/disabled/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("submitCrossChainOrder refuses to run, and never touches the network", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const recipient = PublicKey.unique();
    const hookInputs = fixtureHookInputs(recipient);
    const request = buildCrossChainOrderRequest({
      sourceChain: "tron",
      sourceTokenAddress: "native",
      sourceAmountBaseUnits: 1_000_000n,
      sourceWalletAddress: "TX2Ut1reF59i2WPzsYVoMfA25EkUkavnd5",
      hookInputs,
    });
    await expect(submitCrossChainOrder(request, "TX2Ut1reF59i2WPzsYVoMfA25EkUkavnd5")).rejects.toThrow(/disabled/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
