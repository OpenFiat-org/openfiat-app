import { describe, expect, it } from "vitest";
import bs58 from "bs58";

import {
  channelKeyId,
  decodePaymentDetails,
  encodePaymentDetails,
  generateChannelKey,
  nextSequence,
  openEntry,
  PADDING_BLOCK,
  readEntries,
  sealEntry,
  type EntryBinding,
  type WireTradeChannel,
} from "@/lib/trade-channel";

/**
 * The trade channel's encryption, against the properties
 * `openfiat-tradechannel` pins on the Rust side.
 *
 * These are transcriptions of that crate's own tests, and deliberately so:
 * this format has two implementations that must agree byte for byte, and the
 * only way a divergence shows up otherwise is a payload that opens in one
 * client and not the other, with no error either side can explain.
 *
 * The binding cases are the ones doing real work. Without the associated
 * data, a party could lift their counterparty's ciphertext and re-post it
 * under their own name with their own valid signature — and the record would
 * read as though the buyer said what the seller said.
 */

const AUTHOR = "12D3KooWSoBhn76B5upvpXipmuV9aiRU29PcvhMHKFFa7TkXtq4v";
const OTHER = "12D3KooWD8fTWxDnfs52x7tMtoHtKjgSa5GYKR1T5agco1hqyq6Y";

function binding(overrides: Partial<EntryBinding> = {}): EntryBinding {
  return {
    settlementId: "settle-1",
    author: AUTHOR,
    sequence: 0,
    kind: "PaymentDetails",
    ...overrides,
  };
}

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const bytes = (value: string) => new TextEncoder().encode(value);

describe("a channel payload", () => {
  it("round trips under the key it was written for", () => {
    const key = generateChannelKey();
    const sealed = sealEntry(key, binding(), bytes("Equity Bank 0110123456789"));
    expect(text(openEntry(key, binding(), sealed))).toBe("Equity Bank 0110123456789");
  });

  it("round trips when empty", () => {
    const key = generateChannelKey();
    expect(text(openEntry(key, binding(), sealEntry(key, binding(), bytes(""))))).toBe("");
  });

  it("never carries the account number in the bytes every node stores", () => {
    const key = generateChannelKey();
    const sealed = sealEntry(key, binding(), bytes("0110123456789"));
    expect(Buffer.from(sealed.ciphertext).includes("0110123456789")).toBe(false);
  });

  it("does not open under another key", () => {
    const sealed = sealEntry(generateChannelKey(), binding(), bytes("secret"));
    expect(() => openEntry(generateChannelKey(), binding(), sealed)).toThrow();
  });

  it("does not open in another author's slot", () => {
    const key = generateChannelKey();
    const sealed = sealEntry(key, binding({ author: AUTHOR }), bytes("pay to 0110123456789"));
    expect(() => openEntry(key, binding({ author: OTHER }), sealed)).toThrow();
  });

  it("does not open against another settlement", () => {
    const key = generateChannelKey();
    const sealed = sealEntry(key, binding({ settlementId: "settle-1" }), bytes("details"));
    expect(() => openEntry(key, binding({ settlementId: "settle-2" }), sealed)).toThrow();
  });

  it("does not open at another sequence number", () => {
    const key = generateChannelKey();
    const sealed = sealEntry(key, binding({ sequence: 0 }), bytes("details"));
    expect(() => openEntry(key, binding({ sequence: 1 }), sealed)).toThrow();
  });

  it("does not open relabelled as another kind", () => {
    const key = generateChannelKey();
    const sealed = sealEntry(key, binding({ kind: "PaymentDetails" }), bytes("details"));
    expect(() => openEntry(key, binding({ kind: "Message" }), sealed)).toThrow();
  });

  it("fails rather than returning garbage when tampered with", () => {
    const key = generateChannelKey();
    const sealed = sealEntry(key, binding(), bytes("details"));
    sealed.ciphertext[0] ^= 0x01;
    expect(() => openEntry(key, binding(), sealed)).toThrow();
  });

  it("pads short entries of different lengths to the same size", () => {
    // Length is the cheapest inference available to every node holding a
    // replica, so a "yes" and a bank account number must not be told apart by
    // the size of the blob.
    const key = generateChannelKey();
    const tiny = sealEntry(key, binding(), bytes("ok"));
    const longer = sealEntry(key, binding(), bytes("Equity Bank 0110123456789, R. Kimani"));
    expect(tiny.ciphertext.length).toBe(longer.ciphertext.length);
    // Padding block plus the Poly1305 tag.
    expect(tiny.ciphertext.length).toBe(PADDING_BLOCK + 16);
  });

  it("refuses an oversized plaintext rather than truncating it", () => {
    const key = generateChannelKey();
    expect(() => sealEntry(key, binding(), new Uint8Array(4097).fill(120))).toThrow(/4096/);
  });
});

describe("a channel key's public label", () => {
  it("is stable for one key and different for another", () => {
    const key = generateChannelKey();
    expect(channelKeyId(key)).toEqual(channelKeyId(key));
    expect(channelKeyId(key)).not.toEqual(channelKeyId(generateChannelKey()));
  });

  it("is eight bytes, which is what the wire carries", () => {
    expect(channelKeyId(generateChannelKey())).toHaveLength(8);
  });

  it("is a digest, not the key", () => {
    const key = generateChannelKey();
    const id = channelKeyId(key);
    expect(Array.from(key.slice(0, 8))).not.toEqual(id);
  });
});

describe("reading a channel", () => {
  function channel(key: Uint8Array, entries: { author: string; sequence: number }[]): WireTradeChannel {
    return {
      settlement_id: "settle-1",
      grants: [],
      entries: entries.map(({ author, sequence }) => ({
        settlement_id: "settle-1",
        author,
        sequence,
        kind: "Message" as const,
        payload: sealEntry(
          key,
          { settlementId: "settle-1", author, sequence, kind: "Message" },
          bytes(`entry ${sequence}`),
        ),
        posted_at: 1_000 + sequence,
      })),
    };
  }

  it("opens what the held key covers", () => {
    const key = generateChannelKey();
    const read = readEntries(channel(key, [{ author: AUTHOR, sequence: 0 }]), [key]);
    expect(read[0]!.sealed).toBe(false);
    expect(read[0]!.text).toBe("entry 0");
  });

  it("reports an entry it cannot open as sealed, never as empty", () => {
    // The whole point. A screen that could not tell these apart would tell a
    // buyer their merchant sent no payment details when the merchant sent
    // them and this client cannot read them.
    const key = generateChannelKey();
    const read = readEntries(channel(key, [{ author: AUTHOR, sequence: 0 }]), []);
    expect(read[0]!.sealed).toBe(true);
    expect(read[0]!.text).toBeNull();
  });

  it("orders by claimed time, then author and sequence", () => {
    const key = generateChannelKey();
    const read = readEntries(
      channel(key, [
        { author: AUTHOR, sequence: 2 },
        { author: AUTHOR, sequence: 0 },
        { author: OTHER, sequence: 1 },
      ]),
      [key],
    );
    expect(read.map((entry) => entry.sequence)).toEqual([0, 1, 2]);
  });

  it("counts an author's next slot from what the node holds", () => {
    const key = generateChannelKey();
    const held = channel(key, [
      { author: AUTHOR, sequence: 0 },
      { author: AUTHOR, sequence: 1 },
      { author: OTHER, sequence: 0 },
    ]);
    // Each side gets its own contiguous run, so one party's entries never
    // move the other party's counter.
    expect(nextSequence(held, AUTHOR)).toBe(2);
    expect(nextSequence(held, OTHER)).toBe(1);
    expect(nextSequence(held, "12D3KooWnobody")).toBe(0);
  });
});

describe("payment details", () => {
  it("round trip field by field", () => {
    const payload = {
      method: "builtin:mpesa-kenya",
      methodName: "M-Pesa Kenya (Safaricom)",
      fields: [{ label: "Phone number", value: "+254700000000" }],
      reference: "ref-9",
    };
    expect(decodePaymentDetails(encodePaymentDetails(payload))).toEqual(payload);
  });

  it("answer null for anything that is not this shape", () => {
    // A plain chat message must render as a message, not as an empty set of
    // instructions with a copy button beside nothing.
    expect(decodePaymentDetails("hello")).toBeNull();
    expect(decodePaymentDetails(JSON.stringify({ method: "builtin:pix" }))).toBeNull();
  });

  it("keeps the rail as a catalogue id rather than a display name", () => {
    const decoded = decodePaymentDetails(
      encodePaymentDetails({ method: "builtin:pix", fields: [] }),
    );
    expect(decoded!.method).toBe("builtin:pix");
  });
});

describe("the author in a binding is the peer id's bytes", () => {
  it("changes the transcript when the peer id changes by one byte", () => {
    // Guards the one detail that is invisible from inside a single
    // implementation: the Rust side binds `PeerId::as_bytes`, so a transcript
    // built from the base58 spelling is self-consistent and opens nothing
    // anybody else wrote.
    const key = generateChannelKey();
    const raw = bs58.decode(AUTHOR);
    const nudged = Uint8Array.from(raw);
    nudged[nudged.length - 1] ^= 0x01;
    const sealed = sealEntry(key, binding({ author: AUTHOR }), bytes("details"));
    expect(() =>
      openEntry(key, binding({ author: bs58.encode(nudged) }), sealed),
    ).toThrow();
  });
});
