// @vitest-environment node
//
// `PublicKey.findProgramAddressSync` misbehaves under jsdom in this
// workspace — see `tests/vault-wsol.test.ts`'s own use of this pragma.
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { onchain } from "@openfiat/sdk";
import { describe, expect, it, vi } from "vitest";

import { PRESALE_PROGRAM_ID } from "@/lib/live-presale";

/**
 * `resolveCrossChainHookInputs`/`fetchCrossChainSaleConfig` are the one
 * piece of `lib/debridge-order.ts` that reads the chain (an RPC call, same
 * class as `fetchSaleConfig` elsewhere in this app — not a "live deBridge"
 * call, which is what's gated). Mocked here at the RPC boundary
 * (`getConnection`, `tokenProgramForMint`) rather than against a live
 * cluster, mirroring `tests/live-reviews.test.ts`'s own pattern for this
 * codebase.
 */

const PROGRAM_ID = new PublicKey(PRESALE_PROGRAM_ID);
const OPEN_MINT = PublicKey.unique();
const USDC_MINT = PublicKey.unique();
const PRESALE_VAULT = PublicKey.unique();
const USDC_VAULT = PublicKey.unique();

function u64le(value: bigint): number[] {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(value);
  return [...buf];
}
function i64le(value: bigint): number[] {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64LE(value);
  return [...buf];
}
function u16le(value: number): number[] {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(value);
  return [...buf];
}
function u32le(value: number): number[] {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value);
  return [...buf];
}

/** Matches `tests/onchain-decode.test.ts`'s own `saleConfigBytes` fixture layout — see `lib/onchain-decode.ts`'s `decodeSaleConfig` for the byte offsets this depends on. */
function saleConfigBytes(): Buffer {
  return Buffer.from([
    86, 47, 71, 156, 87, 152, 149, 246, // discriminator
    ...PublicKey.unique().toBytes(), // admin
    ...OPEN_MINT.toBytes(),
    ...USDC_MINT.toBytes(),
    ...PRESALE_VAULT.toBytes(),
    ...USDC_VAULT.toBytes(),
    ...PublicKey.unique().toBytes(), // treasury
    ...PublicKey.unique().toBytes(), // swap_program
    ...u64le(200_000_000_000_000n), // hard_cap
    ...u64le(0n), // soft_cap
    ...u64le(50_000_000n), // min_contribution
    ...u64le(10_000_000_000_000n), // max_contribution
    ...u16le(50), // max_slippage_bps
    ...u64le(100n), // open_per_usdc
    6, // open_decimals
    6, // usdc_decimals
    ...i64le(1_700_000_000n), // start_time
    ...i64le(1_800_000_000n), // end_time
    ...u32le(0), // empty whitelist (u32 length = 0)
    ...u64le(0n), // total_raised
    0, // state = Active
    255, // bump
    254, // usdc_vault_bump
  ]);
}

describe("resolveCrossChainHookInputs", () => {
  it("resolves the nonce-keyed SaleConfig and each mint's real token program", async () => {
    vi.resetModules();
    vi.doMock("@/lib/onchain-config", () => ({
      getConnection: () => ({
        getAccountInfo: async () => ({ data: saleConfigBytes() }),
      }),
    }));
    vi.doMock("@/lib/vault-instructions", () => ({
      tokenProgramForMint: async (mint: PublicKey) =>
        mint.equals(OPEN_MINT) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
    }));

    const { resolveCrossChainHookInputs, saleConfigPdaForNonce, presaleVaultAuthorityPda, DEFAULT_SALE_NONCE } =
      await import("@/lib/debridge-order");

    const recipient = PublicKey.unique();
    const inputs = await resolveCrossChainHookInputs(recipient, 5_000_000n);

    expect(inputs.saleConfig.equals(saleConfigPdaForNonce(DEFAULT_SALE_NONCE, PROGRAM_ID))).toBe(true);
    expect(inputs.presaleVaultAuthority.equals(presaleVaultAuthorityPda(PROGRAM_ID))).toBe(true);
    expect(inputs.usdcVault.equals(USDC_VAULT)).toBe(true);
    expect(inputs.presaleVault.equals(PRESALE_VAULT)).toBe(true);
    expect(inputs.openMint.equals(OPEN_MINT)).toBe(true);
    expect(inputs.usdcMint.equals(USDC_MINT)).toBe(true);
    expect(inputs.openTokenProgram.equals(TOKEN_2022_PROGRAM_ID)).toBe(true);
    expect(inputs.usdcTokenProgram.equals(TOKEN_PROGRAM_ID)).toBe(true);
    expect(inputs.banRecord.equals(onchain.banRecordPda(recipient)[0])).toBe(true);
    expect(inputs.recipient.equals(recipient)).toBe(true);
    expect(inputs.usdcAmount).toBe(5_000_000n);

    vi.doUnmock("@/lib/onchain-config");
    vi.doUnmock("@/lib/vault-instructions");
  });

  it("throws — never a null/zero fallback — when no SaleConfig exists at the nonce-keyed PDA", async () => {
    vi.resetModules();
    vi.doMock("@/lib/onchain-config", () => ({
      getConnection: () => ({ getAccountInfo: async () => null }),
    }));
    vi.doMock("@/lib/vault-instructions", () => ({
      tokenProgramForMint: async () => TOKEN_PROGRAM_ID,
    }));

    const { resolveCrossChainHookInputs } = await import("@/lib/debridge-order");
    await expect(resolveCrossChainHookInputs(PublicKey.unique(), 1_000_000n)).rejects.toThrow(
      /No SaleConfig/,
    );

    vi.doUnmock("@/lib/onchain-config");
    vi.doUnmock("@/lib/vault-instructions");
  });
});
