/**
 * Strips the F-01 domain header off bytes a mock wallet's `signMessage`
 * received, for tests that want to assert on the payload underneath
 * without also asserting on the tag.
 *
 * Layout is `lib/domain.ts`'s `preimage`: `len(tag):u32be ‖ utf8(tag) ‖
 * body`. A test that cares which tag was used should read it directly —
 * see `tagOfSignedMessage` — rather than only checking the body parses,
 * which would pass for a message signed under the *wrong* tag too.
 */
export function tagOfSignedMessage(message: Uint8Array): string {
  const view = new DataView(message.buffer, message.byteOffset, message.byteLength);
  const tagLen = view.getUint32(0, false);
  return new TextDecoder().decode(message.slice(4, 4 + tagLen));
}

/** The JSON body after the header, decoded as a string (not yet parsed). */
export function bodyOfSignedMessage(message: Uint8Array): string {
  const view = new DataView(message.buffer, message.byteOffset, message.byteLength);
  const tagLen = view.getUint32(0, false);
  return new TextDecoder().decode(message.slice(4 + tagLen));
}

/** The JSON body after the header, parsed. */
export function payloadOfSignedMessage(message: Uint8Array): unknown {
  return JSON.parse(bodyOfSignedMessage(message));
}
