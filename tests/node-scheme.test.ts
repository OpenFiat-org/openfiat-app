import { afterEach, describe, expect, it, vi } from "vitest";

import { nodeUrlFor, pageAllowsPlainHttp, unreachableReason } from "@/lib/node-scheme";

/**
 * The bug these cover, in full: a node running normally at
 * `84.32.223.111:7080` and answering `getHealth` in single-digit
 * milliseconds was reported by the app as unreachable. The app is served
 * over HTTPS, the node speaks plain HTTP, and the browser refused the
 * request as mixed content before it left — which `fetch` surfaces
 * identically to a node that is switched off.
 */
function servePageOver(protocol: "http:" | "https:") {
  vi.stubGlobal("window", {
    ...globalThis.window,
    location: { ...globalThis.window?.location, protocol },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("nodeUrlFor", () => {
  it("uses https for a bare host when the page is https", () => {
    servePageOver("https:");
    // http:// here can never succeed, so choosing it guarantees failure.
    expect(nodeUrlFor("84.32.223.111:7080")).toBe("https://84.32.223.111:7080");
  });

  it("uses http for a bare host when the page is plain http", () => {
    servePageOver("http:");
    expect(nodeUrlFor("84.32.223.111:7080")).toBe("http://84.32.223.111:7080");
  });

  it("keeps http for loopback even on an https page", () => {
    // Browsers treat 127.0.0.1 as a secure context, so a local node IS
    // reachable from a deployed app — defaulting it to https would break
    // the one case that works.
    servePageOver("https:");
    for (const local of ["localhost:7080", "127.0.0.1:7080", "[::1]:7080"]) {
      expect(nodeUrlFor(local)).toBe(`http://${local}`);
    }
  });

  it("never overrides a scheme the user typed", () => {
    servePageOver("https:");
    expect(nodeUrlFor("http://node.example:7080")).toBe("http://node.example:7080");
    expect(nodeUrlFor("https://node.example")).toBe("https://node.example");
  });

  it("trims what the user typed", () => {
    servePageOver("http:");
    expect(nodeUrlFor("  node.example:7080  ")).toBe("http://node.example:7080");
  });
});

describe("unreachableReason", () => {
  it("explains mixed content rather than blaming the node", () => {
    servePageOver("https:");
    const message = unreachableReason("84.32.223.111:7080");

    expect(message).toMatch(/HTTPS/);
    expect(message).toMatch(/plain-HTTP/);
    expect(message).toMatch(/certificate|reverse proxy/);
  });

  it("says the same for an explicitly plain-http node on an https page", () => {
    servePageOver("https:");
    expect(unreachableReason("http://84.32.223.111:7080")).toMatch(/plain-HTTP/);
  });

  it("does not invoke mixed content when the page is plain http", () => {
    // A developer running locally gets the ordinary message; telling them
    // about TLS would be a red herring.
    servePageOver("http:");
    const message = unreachableReason("84.32.223.111:7080");
    expect(message).toBe("Could not reach an OpenFiat node at 84.32.223.111:7080.");
  });

  it("does not invoke mixed content for loopback, which is reachable", () => {
    servePageOver("https:");
    expect(unreachableReason("localhost:7080")).not.toMatch(/plain-HTTP/);
  });

  it("does not invoke mixed content for an https node that is simply down", () => {
    servePageOver("https:");
    expect(unreachableReason("https://node.example")).toBe(
      "Could not reach an OpenFiat node at https://node.example.",
    );
  });
});

describe("pageAllowsPlainHttp", () => {
  it("is true during server rendering, matching the local-development default", () => {
    vi.stubGlobal("window", undefined);
    expect(pageAllowsPlainHttp()).toBe(true);
  });
});
