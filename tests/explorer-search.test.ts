import { describe, expect, it } from "vitest";

import { looksLikePeerId } from "@/components/explorer/explorer-search";

/**
 * The explorer's search used to match a query against `MERCHANTS` — a
 * fixture — by id, name or wallet, and route a hit to that merchant's
 * fabricated profile. Searching a real merchant's name found nothing;
 * searching an invented one found a page about nobody.
 *
 * What replaced it is a shape test rather than a lookup, so the routing
 * decision needs no node and the destination page reads the real record. The
 * whole decision rests on telling a PeerId from a wallet address, and both
 * are base58 strings of similar length — so it is pinned.
 */
describe("looksLikePeerId", () => {
  it("recognises the spelling the order book displays", () => {
    // Real ids off the live node's advertisement book.
    expect(looksLikePeerId("12D3KooWHSjonqZMAHmZKzSYgTsPdJ1UrxCYcKTBy4BfbUhU3Qmj")).toBe(true);
    expect(looksLikePeerId("12D3KooWAYxTPWxX9irTaqGca2BUbPSaqKTqX9UsRbMA3Ng7oeBC")).toBe(true);
    expect(looksLikePeerId("12D3KooWK9hQ7TwbfvFiaAxUbRFCkdhS7iEpAJDnewNL1anyREQ1")).toBe(true);
  });

  it("does not mistake a wallet address for one", () => {
    // A wallet address routed to `/merchants/<id>` would ask the node for
    // advertisements under a PeerId that is really a raw key — an answer of
    // "no advertisements" that says nothing about the wallet.
    expect(looksLikePeerId("ALLENLMtV1zEAHT3xpVryqcbdPCB8c9JhM1Jdbe5XHg5")).toBe(false);
    expect(looksLikePeerId("29w8TroBTYoaqrXBDcpv5L54VZRA8Kf7kU5U1cakvFdj")).toBe(false);
  });

  it("rejects a near miss rather than routing it hopefully", () => {
    const real = "12D3KooWHSjonqZMAHmZKzSYgTsPdJ1UrxCYcKTBy4BfbUhU3Qmj";
    expect(looksLikePeerId(real.slice(0, -1))).toBe(false);
    expect(looksLikePeerId(`${real}x`)).toBe(false);
    // Base58 omits 0, O, I and l precisely so they cannot be confused.
    expect(looksLikePeerId(real.replace("o", "0"))).toBe(false);
    expect(looksLikePeerId("")).toBe(false);
  });
});
