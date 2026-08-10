// @vitest-environment node
//
// `PublicKey.findProgramAddressSync`/`isOnCurve` misbehave under jsdom in
// this workspace — see `tests/debridge-order.test.ts`'s own use of this
// same pragma for the same class of test.
import { Keypair, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { debridge } from "@openfiat/sdk";
import { describe, expect, it } from "vitest";

import {
  buildDepositOrder,
  buildWithdrawOrder,
  CROSS_CHAIN_LIVE_CALLS_ENABLED,
  fetchBridgeFundsQuote,
  OTHER_CHAINS,
  parseAmountToBaseUnits,
  parseSolanaRecipient,
  resolveSolanaMints,
  STABLECOINS,
  stablecoinTokenAddress,
  submitBridgeFundsOrder,
  validateDestinationAddress,
  validateEvmAddress,
  validateTronAddress,
} from "@/lib/bridge-funds";
import { NETWORK_LABEL } from "@/lib/node-endpoint";
import { DEVNET_SETTLEMENT_MINT } from "@/lib/onchain-config";

/**
 * SP-C Task 2: the pure logic behind the "Funds" panel — destination-address
 * validation for both directions, decimal amount parsing, and DLN order
 * assembly. Live deBridge calls are gated off by default (see
 * `CROSS_CHAIN_LIVE_CALLS_ENABLED`, reused verbatim from `lib/debridge-order.ts`)
 * and this file exercises exactly that they refuse to run — no live DLN is
 * available in this environment, same pre-mainnet gate SP-B's own tests
 * observe.
 */

// ---------------------------------------------------------------------------
// Solana recipient validation (deposit) — reused from lib/debridge-order.ts,
// re-exercised here to pin the re-export.
// ---------------------------------------------------------------------------

describe("parseSolanaRecipient (deposit destination)", () => {
  it("accepts a real wallet — on-curve", () => {
    const kp = new Keypair();
    const result = parseSolanaRecipient(kp.publicKey.toBase58());
    expect(result.ok).toBe(true);
  });

  it("rejects a PDA — off-curve, no private key exists for it", () => {
    const [pda] = PublicKey.findProgramAddressSync([Buffer.from("x")], debridge.TOKEN_PROGRAM_ID);
    const result = parseSolanaRecipient(pda.toBase58());
    expect(result).toEqual({ ok: false, reason: "offCurve" });
  });

  it("rejects garbage", () => {
    expect(parseSolanaRecipient("not-an-address")).toEqual({ ok: false, reason: "invalid" });
  });
});

// ---------------------------------------------------------------------------
// EVM checksum validation (withdraw destination).
// ---------------------------------------------------------------------------

describe("validateEvmAddress", () => {
  // A published EIP-55 test vector: lowercasing this and re-checksumming it
  // (independently, with @noble/hashes/sha3's keccak_256) reproduces this
  // exact casing — confirmed while writing this test, not taken on faith.
  const CHECKSUMMED = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";

  it("accepts a correctly-checksummed mixed-case address", () => {
    expect(validateEvmAddress(CHECKSUMMED)).toEqual({ ok: true, address: CHECKSUMMED });
  });

  it("accepts the same address all-lowercase (unchecksummed, not thereby invalid)", () => {
    expect(validateEvmAddress(CHECKSUMMED.toLowerCase())).toEqual({
      ok: true,
      address: CHECKSUMMED.toLowerCase(),
    });
  });

  it("accepts the same address all-uppercase-hex (also an unchecksummed encoding)", () => {
    const upper = "0x" + CHECKSUMMED.slice(2).toUpperCase();
    expect(validateEvmAddress(upper)).toEqual({ ok: true, address: upper });
  });

  it("rejects a mixed-case address whose checksum is wrong — a likely typo", () => {
    // Flip the case of one letter in the middle of the checksummed address.
    const hex = CHECKSUMMED.slice(2);
    const i = [...hex].findIndex((c) => /[a-fA-F]/.test(c));
    const flip = (c: string) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase());
    const broken = "0x" + hex.slice(0, i) + flip(hex[i]) + hex.slice(i + 1);
    expect(broken).not.toBe(CHECKSUMMED);
    expect(validateEvmAddress(broken)).toEqual({ ok: false, reason: "badChecksum" });
  });

  it("rejects malformed input", () => {
    expect(validateEvmAddress("not-an-address")).toEqual({ ok: false, reason: "invalid" });
    expect(validateEvmAddress("0x1234")).toEqual({ ok: false, reason: "invalid" });
    expect(validateEvmAddress("")).toEqual({ ok: false, reason: "invalid" });
  });
});

// ---------------------------------------------------------------------------
// Tron base58check validation (withdraw destination).
// ---------------------------------------------------------------------------

describe("validateTronAddress", () => {
  // A real TRC-20-shaped address (also used in tests/source-wallet.test.ts);
  // its checksum was independently recomputed with @noble/hashes/sha2's
  // sha256 while writing this test, not assumed.
  const VALID = "TX2Ut1reF59i2WPzsYVoMfA25EkUkavnd5";

  it("accepts a valid base58check TRON address", () => {
    expect(validateTronAddress(VALID)).toEqual({ ok: true, address: VALID });
  });

  it("rejects a corrupted checksum", () => {
    const corrupted = VALID.slice(0, -1) + (VALID.at(-1) === "5" ? "6" : "5");
    expect(validateTronAddress(corrupted)).toEqual({ ok: false, reason: "badChecksum" });
  });

  it("rejects addresses that don't start with T", () => {
    expect(validateTronAddress("X" + VALID.slice(1))).toEqual({ ok: false, reason: "wrongPrefix" });
  });

  it("rejects malformed base58 (T-prefixed but not decodable) and empty input", () => {
    expect(validateTronAddress("Tnot-base58-!!!")).toEqual({ ok: false, reason: "invalid" });
    expect(validateTronAddress("")).toEqual({ ok: false, reason: "wrongPrefix" });
  });

  it("rejects a correctly-encoded but wrong-length payload", () => {
    // Valid base58, valid alphabet, just not 25 bytes.
    expect(validateTronAddress("T" + VALID.slice(1, 10))).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("validateDestinationAddress", () => {
  it("dispatches TRON to base58check validation", () => {
    expect(validateDestinationAddress("tron", "not-an-evm-address").ok).toBe(false);
  });

  it("dispatches every other listed chain to EVM validation", () => {
    for (const chain of OTHER_CHAINS.filter((c) => c !== "tron")) {
      expect(validateDestinationAddress(chain, "0x0000000000000000000000000000000000000000").ok).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Decimal amount parsing.
// ---------------------------------------------------------------------------

describe("parseAmountToBaseUnits", () => {
  it("parses a whole number", () => {
    expect(parseAmountToBaseUnits("12", 6)).toBe(12_000_000n);
  });

  it("parses a fractional amount", () => {
    expect(parseAmountToBaseUnits("12.5", 6)).toBe(12_500_000n);
  });

  it("parses the smallest unit exactly — the case Number()*10**decimals can round wrong", () => {
    expect(parseAmountToBaseUnits("0.000001", 6)).toBe(1n);
  });

  it("rejects too many fractional digits", () => {
    expect(() => parseAmountToBaseUnits("0.0000001", 6)).toThrow(/decimal places/);
  });

  it("rejects zero and malformed input", () => {
    expect(() => parseAmountToBaseUnits("0", 6)).toThrow(/greater than zero/);
    expect(() => parseAmountToBaseUnits("-1", 6)).toThrow(/valid decimal/);
    expect(() => parseAmountToBaseUnits("abc", 6)).toThrow(/valid decimal/);
    expect(() => parseAmountToBaseUnits("", 6)).toThrow(/valid decimal/);
  });
});

// ---------------------------------------------------------------------------
// Order assembly — correct mint/recipient/chain-ids, and no hook.
// ---------------------------------------------------------------------------

describe("buildDepositOrder", () => {
  const recipient = new Keypair().publicKey;

  it("builds a deposit order with the correct mint, ATA recipient and chain ids", () => {
    const request = buildDepositOrder({
      otherChain: "ethereum",
      stablecoin: "USDC",
      amountBaseUnits: 5_000_000n,
      solanaRecipient: recipient,
      sourceWalletAddress: "0x000000000000000000000000000000000000aa",
      solanaMints: debridge.SOLANA_STABLECOIN_MINTS.mainnet,
    });

    expect(request.srcChainId).toBe(String(debridge.DEBRIDGE_CHAIN_IDS.ethereum));
    expect(request.dstChainId).toBe(String(debridge.DEBRIDGE_CHAIN_IDS.solana));
    expect(request.dstChainTokenOut).toBe(debridge.SOLANA_STABLECOIN_MINTS.mainnet.USDC.mint.toBase58());
    expect(request.srcChainOrderAuthorityAddress).toBe("0x000000000000000000000000000000000000aa");
    expect(request.dstChainOrderAuthorityAddress).toBe(recipient.toBase58());

    const expectedAta = getAssociatedTokenAddressSync(
      debridge.SOLANA_STABLECOIN_MINTS.mainnet.USDC.mint,
      recipient,
      true,
      debridge.SOLANA_STABLECOIN_MINTS.mainnet.USDC.tokenProgram,
    );
    expect(request.dstChainTokenOutRecipient).toBe(expectedAta.toBase58());
  });

  it("never carries a dlnHook — the correctness guardrail distinguishing SP-C from SP-B", () => {
    const request = buildDepositOrder({
      otherChain: "tron",
      stablecoin: "USDT",
      amountBaseUnits: 1_000_000n,
      solanaRecipient: recipient,
      sourceWalletAddress: "TX2Ut1reF59i2WPzsYVoMfA25EkUkavnd5",
      solanaMints: debridge.SOLANA_STABLECOIN_MINTS.mainnet,
    });
    expect(request.dlnHook).toBeUndefined();
    expect("dlnHook" in request).toBe(false);
  });

  it("builds the USDT-on-Tron case with Tron's reference token address", () => {
    const request = buildDepositOrder({
      otherChain: "tron",
      stablecoin: "USDT",
      amountBaseUnits: 2_000_000n,
      solanaRecipient: recipient,
      sourceWalletAddress: "TX2Ut1reF59i2WPzsYVoMfA25EkUkavnd5",
      solanaMints: debridge.SOLANA_STABLECOIN_MINTS.mainnet,
    });
    expect(request.srcChainId).toBe(String(debridge.DEBRIDGE_CHAIN_IDS.tron));
    expect(request.srcChainTokenIn).toBe(debridge.CHAIN_STABLECOIN_TOKENS.tron.USDT);
    expect(request.dstChainTokenOut).toBe(debridge.SOLANA_STABLECOIN_MINTS.mainnet.USDT.mint.toBase58());
  });
});

describe("buildWithdrawOrder", () => {
  const owner = new Keypair().publicKey;

  it("builds a withdraw order with the correct mint, recipient and chain ids", () => {
    const request = buildWithdrawOrder({
      otherChain: "bsc",
      stablecoin: "USDC",
      amountBaseUnits: 3_000_000n,
      solanaOwner: owner,
      dstRecipient: "0x000000000000000000000000000000000000bb",
      solanaMints: debridge.SOLANA_STABLECOIN_MINTS.mainnet,
    });

    expect(request.srcChainId).toBe(String(debridge.DEBRIDGE_CHAIN_IDS.solana));
    expect(request.srcChainTokenIn).toBe(debridge.SOLANA_STABLECOIN_MINTS.mainnet.USDC.mint.toBase58());
    expect(request.dstChainId).toBe(String(debridge.DEBRIDGE_CHAIN_IDS.bsc));
    expect(request.dstChainTokenOut).toBe(debridge.CHAIN_STABLECOIN_TOKENS.bsc.USDC);
    expect(request.dstChainTokenOutRecipient).toBe("0x000000000000000000000000000000000000bb");
    expect(request.srcChainOrderAuthorityAddress).toBe(owner.toBase58());
  });

  it("never carries a dlnHook", () => {
    const request = buildWithdrawOrder({
      otherChain: "tron",
      stablecoin: "USDT",
      amountBaseUnits: 1_000_000n,
      solanaOwner: owner,
      dstRecipient: "TX2Ut1reF59i2WPzsYVoMfA25EkUkavnd5",
      solanaMints: debridge.SOLANA_STABLECOIN_MINTS.mainnet,
    });
    expect(request.dlnHook).toBeUndefined();
    expect("dlnHook" in request).toBe(false);
  });

  it("builds the USDT-on-Tron case with Tron's reference token address", () => {
    const request = buildWithdrawOrder({
      otherChain: "tron",
      stablecoin: "USDT",
      amountBaseUnits: 1_000_000n,
      solanaOwner: owner,
      dstRecipient: "TX2Ut1reF59i2WPzsYVoMfA25EkUkavnd5",
      solanaMints: debridge.SOLANA_STABLECOIN_MINTS.mainnet,
    });
    expect(request.dstChainId).toBe(String(debridge.DEBRIDGE_CHAIN_IDS.tron));
    expect(request.dstChainTokenOut).toBe(debridge.CHAIN_STABLECOIN_TOKENS.tron.USDT);
  });
});

describe("stablecoinTokenAddress", () => {
  it("resolves every OTHER_CHAINS x STABLECOINS combination the reference table has, and throws for the one documented gap", () => {
    for (const chain of OTHER_CHAINS) {
      for (const stablecoin of STABLECOINS) {
        if (chain === "base" && stablecoin === "USDT") {
          // No official Tether-issued USDT on Base — see the SDK's own doc.
          expect(() => stablecoinTokenAddress(chain, stablecoin)).toThrow(/No reference/);
        } else {
          expect(typeof stablecoinTokenAddress(chain, stablecoin)).toBe("string");
        }
      }
    }
  });
});

describe("resolveSolanaMints", () => {
  // `NETWORK_LABEL` is derived from `NEXT_PUBLIC_SOLANA_RPC_URL` at import
  // time (`lib/node-endpoint.ts`), and this app's own default — unset in
  // this test run, same as every other test file here — is the public
  // Solana devnet RPC. So this exercises the devnet branch, which is this
  // app's actual default behavior, not a hypothetical.
  it("wires the app's own devnet settlement mint in as USDC on devnet (this environment's default)", () => {
    expect(NETWORK_LABEL).toBe("Devnet");
    const mints = resolveSolanaMints();
    expect(mints.USDC?.mint.toBase58()).toBe(DEVNET_SETTLEMENT_MINT);
    expect(mints.USDC?.tokenProgram.toBase58()).toBe(debridge.TOKEN_PROGRAM_ID.toBase58());
  });

  it("documents the gap rather than guessing: no devnet USDT mint is configured", () => {
    const mints = resolveSolanaMints();
    expect(mints.USDT).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Gating — live calls refuse to run with the default (off) gate.
// ---------------------------------------------------------------------------

describe("live call gating", () => {
  it("CROSS_CHAIN_LIVE_CALLS_ENABLED is off by default in this environment", () => {
    expect(CROSS_CHAIN_LIVE_CALLS_ENABLED).toBe(false);
  });

  it("fetchBridgeFundsQuote refuses to run while the gate is off", async () => {
    await expect(
      fetchBridgeFundsQuote({
        srcChainId: "1",
        srcChainTokenIn: "0xaa",
        srcChainTokenInAmount: "1000000",
        dstChainId: String(debridge.DEBRIDGE_CHAIN_IDS.solana),
        dstChainTokenOut: "mint",
        dstChainTokenOutAmount: "auto",
        dstChainTokenOutRecipient: "recipient",
      }),
    ).rejects.toThrow(/disabled/);
  });

  it("submitBridgeFundsOrder refuses to run while the gate is off", async () => {
    const request = buildWithdrawOrder({
      otherChain: "ethereum",
      stablecoin: "USDC",
      amountBaseUnits: 1_000_000n,
      solanaOwner: new Keypair().publicKey,
      dstRecipient: "0x000000000000000000000000000000000000cc",
    });
    await expect(submitBridgeFundsOrder(request, "0x000000000000000000000000000000000000cc")).rejects.toThrow(
      /disabled/,
    );
  });
});
