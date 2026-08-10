import { afterEach, describe, expect, it } from "vitest";

import { evmWalletAdapter, sourceWalletAdapters, tronWalletAdapter } from "@/lib/wallet/source-wallet";

/**
 * The EVM and TRON source-wallet adapters, mocked at the injected-provider
 * boundary (`window.ethereum` / `window.tronLink` / `window.tronWeb`) —
 * jsdom gives every test a real `window`, so this exercises the actual
 * connect logic rather than a stub of it, without a real wallet extension.
 */

afterEach(() => {
  delete window.ethereum;
  delete window.tronLink;
  delete window.tronWeb;
});

describe("evmWalletAdapter", () => {
  it("reports unavailable when no wallet is injected", () => {
    expect(evmWalletAdapter("ethereum").isAvailable()).toBe(false);
  });

  it("connects, requests accounts, and switches to the target chain", async () => {
    const calls: { method: string; params?: unknown[] }[] = [];
    window.ethereum = {
      request: async (args) => {
        calls.push(args);
        if (args.method === "eth_requestAccounts") return ["0xabc"];
        if (args.method === "wallet_switchEthereumChain") return null;
        throw new Error(`unexpected method ${args.method}`);
      },
    };
    const adapter = evmWalletAdapter("bsc");
    expect(adapter.isAvailable()).toBe(true);
    const conn = await adapter.connect();
    expect(conn).toEqual({ chain: "bsc", address: "0xabc" });
    expect(calls[0]?.method).toBe("eth_requestAccounts");
    expect(calls[1]).toEqual({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x38" }] });
  });

  it("surfaces a specific error when the wallet won't switch chains", async () => {
    window.ethereum = {
      request: async (args) => {
        if (args.method === "eth_requestAccounts") return ["0xabc"];
        throw new Error("Unrecognized chain");
      },
    };
    await expect(evmWalletAdapter("ethereum").connect()).rejects.toThrow(/would not switch/);
  });

  it("fails clearly when the wallet returns no account", async () => {
    window.ethereum = { request: async () => [] };
    await expect(evmWalletAdapter("ethereum").connect()).rejects.toThrow(/no account/);
  });
});

describe("tronWalletAdapter", () => {
  it("reports unavailable when TronLink isn't injected", () => {
    expect(tronWalletAdapter().isAvailable()).toBe(false);
  });

  it("connects via tron_requestAccounts and reads the address off tronWeb", async () => {
    let requested = false;
    window.tronLink = {
      request: async (args) => {
        if (args.method === "tron_requestAccounts") requested = true;
        return null;
      },
    };
    window.tronWeb = { defaultAddress: { base58: "TX2Ut1reF59i2WPzsYVoMfA25EkUkavnd5" } };

    const conn = await tronWalletAdapter().connect();
    expect(requested).toBe(true);
    expect(conn).toEqual({ chain: "tron", address: "TX2Ut1reF59i2WPzsYVoMfA25EkUkavnd5" });
  });

  it("fails clearly when TronLink is injected but the user never approved", async () => {
    window.tronLink = { request: async () => null };
    // window.tronWeb intentionally left undefined
    await expect(tronWalletAdapter().connect()).rejects.toThrow(/did not approve/);
  });
});

describe("sourceWalletAdapters", () => {
  it("keys every adapter by its own chain", () => {
    const adapters = sourceWalletAdapters();
    expect(adapters.ethereum.chain).toBe("ethereum");
    expect(adapters.bsc.chain).toBe("bsc");
    expect(adapters.tron.chain).toBe("tron");
  });
});
