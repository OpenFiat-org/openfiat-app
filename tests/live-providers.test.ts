import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Branding is the first thing a registry record carries that a browser
 * renders as an image and a link. Everything here is about the gap that
 * opens between "the node checked it" and "this app rendered it": a node
 * validates branding before it stores or gossips it, but this app talks
 * to whichever node the user selected — including one they typed into
 * the picker themselves — so a value reaching an `<img src>` or an
 * `<a href>` must have been checked by the code that renders it.
 */

const getProviders = vi.fn();

vi.mock("@openfiat/sdk", () => ({
  Client: class {
    constructor(public options: unknown) {}
  },
  providers: {
    getProviders: (...args: unknown[]) => getProviders(...args),
    getProvider: vi.fn(),
  },
}));

// The logo URL is built against the selected node, so the node URL has to
// be a known constant for the assertions below to mean anything.
vi.mock("@/lib/node-endpoint", () => ({
  nodeUrl: () => "https://node.allenhark.com",
}));

const { fetchLiveProviders, readBranding } = await import("@/lib/live-providers");

/** A real CIDv1 base32 sha2-256 — the only shape `asCid` accepts. */
const LOGO_CID = "bafkreibdmq27skp3wnycoyoqcei47etyaulerpsegivlkfvyhjkw7ufjva";

function record(branding: unknown) {
  return {
    service_id: "node-abc",
    service_type: { Infrastructure: "PublicApiNode" },
    provider: "aabb",
    endpoints: ["https://node.allenhark.com"],
    supported_ofs: [1500],
    region: null,
    capabilities: [],
    branding,
    pricing: null,
    payout_wallet: null,
    health: "Online",
    registered_at: 1,
    last_health_update: 2,
  };
}

beforeEach(() => {
  getProviders.mockReset();
});

describe("readBranding", () => {
  it("carries a complete declaration through, resolving the logo against the selected node", () => {
    const branding = readBranding(
      // @ts-expect-error — a fixture standing in for a wire record
      record({
        name: "AllenHark EU",
        description: "Public API node in Frankfurt.",
        logo: LOGO_CID,
        website: "https://openfiat.allenhark.com",
      }),
    );

    expect(branding).toEqual({
      name: "AllenHark EU",
      description: "Public API node in Frankfurt.",
      logoCid: LOGO_CID,
      // The whole point of a CID: the image comes from the node the user
      // already chose to talk to, so nobody new learns they looked.
      logoUrl: `https://node.allenhark.com/ipfs/${LOGO_CID}`,
      website: "https://openfiat.allenhark.com",
    });
  });

  it("drops a logo that is a URL rather than a content address", () => {
    // A URL here would make every viewer of the directory report their IP
    // and what they were looking at to whoever hosts the image.
    for (const logo of [
      "https://tracker.example/pixel.png",
      "../../etc/passwd",
      "javascript:alert(1)",
      "not-a-cid",
      "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG",
    ]) {
      // @ts-expect-error — a fixture standing in for a wire record
      const branding = readBranding(record({ name: "Some node", logo }));
      expect(branding?.logoUrl, `${logo} must not reach an <img src>`).toBeNull();
      expect(branding?.logoCid).toBeNull();
      // The rest of the declaration survives — one bad field costs a
      // thumbnail, not the row around it.
      expect(branding?.name).toBe("Some node");
    }
  });

  it("drops a website that is not an ordinary http(s) address", () => {
    // A `javascript:` URL in an href runs in the viewer's own page, from
    // a string a stranger signed.
    for (const website of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "file:///etc/passwd",
      "openfiat.allenhark.com",
    ]) {
      // @ts-expect-error — a fixture standing in for a wire record
      const branding = readBranding(record({ name: "Some node", website }));
      expect(branding?.website, `${website} must not reach an <a href>`).toBeNull();
    }
  });

  it("drops a name that would render as something other than what was signed", () => {
    for (const name of [
      "Two\nLines",
      "Trailing\u0000",
      // Renders as `invoice exe.jpg`, which is not the string anybody
      // verified.
      "invoice\u202Egpj.exe",
      "\u2066spoofed\u2069",
    ]) {
      // @ts-expect-error — a fixture standing in for a wire record
      expect(readBranding(record({ name }))?.name ?? null, name).toBeNull();
    }
  });

  it("keeps names that are not Latin", () => {
    // The rule refuses characters that misrender, not scripts. Most of
    // this network's users do not write in Latin script.
    for (const name of ["Huduma za Kenya", "خدمات", "开放法币节点"]) {
      // @ts-expect-error — a fixture standing in for a wire record
      expect(readBranding(record({ name }))?.name).toBe(name);
    }
  });

  it("drops a name a node never bounded rather than rendering it into a table cell", () => {
    // A node runs `ServiceBranding::validate` before it stores anything,
    // but a hostile node runs whatever it likes.
    // @ts-expect-error — a fixture standing in for a wire record
    expect(readBranding(record({ name: "a".repeat(10_000) }))).toBeNull();
  });

  it("answers null when nothing usable was declared, so a caller shows an anonymous peer", () => {
    for (const branding of [
      null,
      undefined,
      {},
      { name: null, description: null, logo: null, website: null },
      { name: "   " },
      // Not an object at all — a node may answer with anything.
      "AllenHark",
      42,
    ]) {
      // @ts-expect-error — a fixture standing in for a wire record
      expect(readBranding(record(branding)), JSON.stringify(branding)).toBeNull();
    }
  });
});

describe("fetchLiveProviders", () => {
  it("puts the checked branding on every directory row", async () => {
    getProviders.mockResolvedValue([
      record({ name: "AllenHark EU", logo: LOGO_CID }),
      record({ name: "Hostile", logo: "https://tracker.example/pixel.png" }),
    ]);

    const [good, hostile] = await fetchLiveProviders("https://node.allenhark.com");
    expect(good.branding?.name).toBe("AllenHark EU");
    expect(good.branding?.logoUrl).toBe(`https://node.allenhark.com/ipfs/${LOGO_CID}`);
    // Named, but with no image — the row falls back to the robot drawn
    // from the provider's peer id.
    expect(hostile.branding?.name).toBe("Hostile");
    expect(hostile.branding?.logoUrl).toBeNull();
  });

  it("leaves a row from a node too old to carry branding unbranded rather than blank", async () => {
    // Registrations predating branding decode with the field absent. The
    // row must still render, showing the Service ID it always did.
    const legacy = record(undefined);
    delete (legacy as { branding?: unknown }).branding;
    getProviders.mockResolvedValue([legacy]);

    const [row] = await fetchLiveProviders("https://node.allenhark.com");
    expect(row.branding).toBeNull();
    expect(row.name).toBe("node-abc");
  });
});
