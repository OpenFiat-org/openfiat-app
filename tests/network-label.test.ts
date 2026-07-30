import { describe, expect, it } from "vitest";

import {
  NETWORK_LABEL,
  SOLANA_CLUSTER,
  SOLANA_RPC_URL,
  TOKENS_ARE_WORTHLESS,
  solanaClusterOf,
} from "@/lib/node-endpoint";

/*
 * The badge that tells a visitor which network they are on used to read a
 * constant string. A constant cannot be wrong at compile time and cannot be
 * right at runtime: point the build at another cluster and it kept saying
 * "Devnet" over balances that were not play money.
 *
 * These lock the label to the RPC URL the app actually reads from, and pin
 * the one behaviour that matters most — that an unrecognised host is never
 * assumed to be a test cluster.
 */
describe("network label", () => {
  it("names the cluster its RPC URL belongs to", () => {
    expect(solanaClusterOf("https://api.devnet.solana.com")).toBe("Devnet");
    expect(solanaClusterOf("https://api.testnet.solana.com")).toBe("Testnet");
    expect(solanaClusterOf("https://api.mainnet-beta.solana.com")).toBe("Mainnet");
  });

  // A local validator is not a public cluster, but it is unambiguously not
  // mainnet — which is the fact the badge exists to convey.
  it("treats a local validator as a test cluster", () => {
    expect(solanaClusterOf("http://localhost:8899")).toBe("Devnet");
    expect(solanaClusterOf("http://127.0.0.1:8899")).toBe("Devnet");
  });

  /*
   * The important case. A private or proxied endpoint might front mainnet,
   * and "probably devnet" is exactly the guess that puts a reassuring label
   * over real money. Null here surfaces as "Unknown network" in the badge.
   */
  it("refuses to guess for a host it does not recognise", () => {
    expect(solanaClusterOf("https://rpc.example.com")).toBeNull();
    expect(solanaClusterOf("https://solana.some-provider.io/v1/abc123")).toBeNull();
    expect(solanaClusterOf("not a url")).toBeNull();
  });

  it("derives every network claim from the configured RPC URL", () => {
    expect(NETWORK_LABEL).toBe(solanaClusterOf(SOLANA_RPC_URL) ?? "Unknown network");
    expect(SOLANA_CLUSTER).toBe(`solana ${NETWORK_LABEL.toLowerCase()}`);
  });

  /*
   * "These tokens have no value" appears in the footer, the header banner,
   * the wallet hero and both badges. It is the one sentence in this app that
   * must never survive a move to a cluster where it is false, so it hangs off
   * a derived flag rather than being written out at each site.
   */
  it("only claims tokens are worthless on a cluster where that is true", () => {
    expect(TOKENS_ARE_WORTHLESS).toBe(
      NETWORK_LABEL === "Devnet" || NETWORK_LABEL === "Testnet",
    );
    expect(solanaClusterOf("https://api.mainnet-beta.solana.com")).not.toBe("Devnet");
  });
});
