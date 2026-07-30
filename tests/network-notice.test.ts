import { describe, expect, it } from "vitest";

import { rendersFixtures } from "@/components/network-notice";

/*
 * The floating notice appears only where it has something to say. The top bar
 * already states the network on every page, so this one is reserved for "this
 * particular page is not reading the network" — and a warning that shows up
 * everywhere is one people stop seeing, which is how `/providers/[id]` sat
 * mislabelled for as long as it did.
 */
describe("where the sample-data notice appears", () => {
  it("stays away from routes that read a node or the chain", () => {
    for (const route of [
      "/",
      "/providers",
      "/network",
      "/explorer",
      "/staking",
      "/governance",
      "/orders",
      "/disputes",
      "/ads",
      "/wallet",
      "/earnings",
      "/arbitrate",
      "/settings",
      "/faucet",
      "/account/identity",
      "/account/reputation",
      "/account/counterparties",
    ]) {
      expect(rendersFixtures(route), route).toBe(false);
    }
  });

  /*
   * Resolved paths, not route patterns. The list this replaced carried
   * `"/providers/[id]"`, which `usePathname()` never returns, so the live
   * per-service page was warned about on every load while the entry meant to
   * exempt it matched nothing at all.
   */
  it("leaves dynamic live routes alone, by their real pathnames", () => {
    for (const route of [
      "/providers/svc-openfiat-public",
      "/orders/trade-1",
      "/disputes/d-1",
      "/governance/p-1",
      "/usdt/kes",
    ]) {
      expect(rendersFixtures(route), route).toBe(false);
    }
  });

  it("still warns on the routes that really are fixtures", () => {
    for (const route of [
      "/merchants",
      "/merchants/m-kenyastar",
      "/explorer/address/9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",
      "/countries",
      "/country/kenya",
      "/country/kenya/kes",
      "/open",
      "/ads/new",
    ]) {
      expect(rendersFixtures(route), route).toBe(true);
    }
  });

  /*
   * `/explorer` is live and `/explorer/address/…` is not, so the deeper
   * prefix must not drag the parent in with it.
   */
  it("does not let a deep fixture prefix swallow its live parent", () => {
    expect(rendersFixtures("/explorer")).toBe(false);
    expect(rendersFixtures("/explorer/address/abc")).toBe(true);
  });
});
