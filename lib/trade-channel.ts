import bs58 from "bs58";
import { chacha20poly1305 } from "@noble/ciphers/chacha.js";
import { sha256 } from "@noble/hashes/sha2.js";
import {
  openWithEncryptionKey,
  sealToEncryptionKey,
  type EncryptionKeypair,
} from "@openfiat/sdk";

import { sendSignedEvent, signPayload } from "@/lib/arbitration";
import { nodeUrl } from "@/lib/node-endpoint";
import type { TradeIdentity } from "@/lib/trade-flow";
import type { SolanaProvider } from "@/lib/wallet-connection";
import { signedRead, type GatedSurface } from "@/lib/wallet-proof";

/**
 * The confidential trade channel (openfiat-core's `openfiat-tradechannel`),
 * client side.
 *
 * All of the encryption is here. A node holds no channel key and has no code
 * path that could use one: it stores which settlement an entry belongs to,
 * who wrote it, in what order, at what claimed time, whether it is payment
 * details or chat, and how many bytes it padded to — and not one word of the
 * content.
 *
 * # The shape, and why it is hybrid rather than a plain sealed box
 *
 * A sealed box addresses a recipient you can name when you encrypt. An
 * arbitrator cannot be named: they are drawn when a dispute opens, after
 * every message has already been written and gossiped. So one 32-byte content
 * key covers the whole trade, every entry is encrypted under it with
 * ChaCha20-Poly1305, and the key itself travels as one small sealed `KeyGrant`
 * per reader. Widening the audience is one grant rather than a re-encryption
 * of the history — and, the actual point, an arbitrator opens the *original*
 * ciphertexts rather than a party's retelling of them.
 *
 * # Who a grant is addressed to
 *
 * Not the recipient's wallet key. Opening a box sealed to an Ed25519 key
 * needs that key's secret scalar, and a Solana wallet exposes `signMessage`
 * and `signTransaction` and no key material at all — by design, and rightly.
 * For as long as grants were sealed that way, a grant addressed to this
 * wallet was bytes this browser could never open, and two people with
 * ordinary wallets could not exchange payment details. This module said so
 * honestly at the top of the file, which did not make it work.
 *
 * A grant is now sealed to the X25519 **encryption key** the recipient
 * published as an identity claim — see `lib/channel-identity.ts` for where
 * that key comes from, what it costs, and why its determinism is checked
 * rather than assumed. Two consequences shape everything below:
 *
 * - The counterparty must have enrolled before anyone can seal to them.
 *   {@link grantChannelKey} takes a published key, never a wallet key, and
 *   there is deliberately no fallback: falling back to the wallet key is
 *   precisely how a channel ends up sealed to somebody who cannot open it,
 *   and it would be invisible to the granter, whose own copy reads fine.
 * - The channel key no longer has to survive in browser storage.
 *   {@link recoverChannelKey} opens the grants addressed to this wallet, so
 *   a new device — or the same one after a refresh — reads the whole
 *   channel. The self-grant that was previously sent and unusable is what
 *   makes that work, which is what it was always for.
 *
 * {@link readEntries} still reports each entry as opened or as
 * sealed-and-unreadable, and never renders an unreadable one as empty:
 * those are opposite answers, and an interface that confused them would
 * tell a buyer their merchant sent no payment details when the merchant
 * sent them and this client could not read them.
 */

/** `openfiat_tradechannel::key::KEY_ID_DOMAIN`. */
const KEY_ID_DOMAIN = new TextEncoder().encode("openfiat/tradechannel/keyid/v1");
/** `openfiat_tradechannel::key::BINDING_DOMAIN`. */
const BINDING_DOMAIN = new TextEncoder().encode("openfiat/tradechannel/binding/v1");

/**
 * `PADDING_BLOCK`. Plaintexts are padded up to a multiple of this before
 * encryption, so a "yes", a six-digit reference and a phone number all land
 * in the same bucket on every node's disk. It does not hide that an entry
 * exists, or when — nothing can, in a replicated log — only how long it was.
 */
export const PADDING_BLOCK = 256;

/** `MAX_ENTRY_PLAINTEXT`. Anything approaching this is a file, and files
 *  belong behind a CID rather than inline in an event stored forever. */
export const MAX_ENTRY_PLAINTEXT = 4096;

/** What an entry is. Bound into the payload's associated data, so the label
 *  cannot be changed after the fact without the ciphertext failing to open. */
export type EntryKind = "PaymentDetails" | "Message";

/** `openfiat_crypto::SealedBox`, as `serde` renders it: byte arrays, not hex. */
export interface WireSealedBox {
  ephemeral_public: number[];
  nonce: number[];
  ciphertext: number[];
}

/** `openfiat_tradechannel::key::ChannelCiphertext`. */
export interface WireCiphertext {
  /** Eight bytes of SHA-256 over the key — public, and how a client tells
   *  which grant opens which payload without trial decryption. */
  key_id: number[];
  nonce: number[];
  ciphertext: number[];
}

/** `openfiat_tradechannel::record::KeyGrant`, as the node answers it. */
export interface WireKeyGrant {
  settlement_id: string;
  granter: string;
  recipient: string;
  /** Derived by the node from the settlement and the dispute record — never
   *  claimed by the granter, who could otherwise grant `Party` to anyone. */
  role: "Party" | "Arbitrator";
  key_id: number[];
  sealed_key: WireSealedBox;
  granted_at: number;
}

/** `openfiat_tradechannel::record::ChannelEntry`. */
export interface WireChannelEntry {
  settlement_id: string;
  author: string;
  sequence: number;
  kind: EntryKind;
  payload: WireCiphertext;
  posted_at: number;
}

/** `openfiat_tradechannel::record::TradeChannel`. */
export interface WireTradeChannel {
  settlement_id: string;
  grants: WireKeyGrant[];
  entries: WireChannelEntry[];
}

/** One trade's content-encryption key: 32 bytes, generated here, never
 *  derived from anything a node knows. */
export type ChannelKey = Uint8Array;

export function generateChannelKey(): ChannelKey {
  return crypto.getRandomValues(new Uint8Array(32));
}

/** The key's public label — `sha256(domain || key)[..8]`. */
export function channelKeyId(key: ChannelKey): number[] {
  const transcript = new Uint8Array(KEY_ID_DOMAIN.length + key.length);
  transcript.set(KEY_ID_DOMAIN, 0);
  transcript.set(key, KEY_ID_DOMAIN.length);
  return Array.from(sha256(transcript).slice(0, 8));
}

/** What a payload is cryptographically nailed to: the four public fields the
 *  one key no longer distinguishes. */
export interface EntryBinding {
  settlementId: string;
  /** The author's PeerId, base58 — decoded to its raw bytes for the transcript. */
  author: string;
  sequence: number;
  kind: EntryKind;
}

/**
 * The associated-data transcript, length-prefixed field by field so no two
 * distinct bindings can concatenate to the same bytes.
 *
 * `author` goes in as the PeerId's **raw bytes**, which is what
 * `PeerId::as_bytes` hands the Rust side. Putting the base58 spelling in
 * instead produces a transcript that is self-consistent, verifies against
 * itself in a unit test, and fails to open against every other client.
 */
function bindingTranscript(binding: EntryBinding): Uint8Array {
  const encoder = new TextEncoder();
  const sequence = new Uint8Array(8);
  new DataView(sequence.buffer).setBigUint64(0, BigInt(binding.sequence), false);

  const fields: Uint8Array[] = [
    BINDING_DOMAIN,
    encoder.encode(binding.settlementId),
    bs58.decode(binding.author),
    sequence,
    encoder.encode(binding.kind),
  ];
  const total = fields.reduce((sum, field) => sum + 4 + field.length, 0);
  const transcript = new Uint8Array(total);
  const view = new DataView(transcript.buffer);
  let offset = 0;
  for (const field of fields) {
    view.setUint32(offset, field.length, true);
    offset += 4;
    transcript.set(field, offset);
    offset += field.length;
  }
  return transcript;
}

/** `u32` little-endian length, the plaintext, then zeros to the next block.
 *  The length prefix is inside the ciphertext, so an observer sees only the
 *  padded size. */
function pad(plaintext: Uint8Array): Uint8Array {
  const padded = Math.ceil((4 + plaintext.length) / PADDING_BLOCK) * PADDING_BLOCK;
  const buffer = new Uint8Array(padded);
  new DataView(buffer.buffer).setUint32(0, plaintext.length, true);
  buffer.set(plaintext, 4);
  return buffer;
}

function unpad(padded: Uint8Array): Uint8Array {
  if (padded.length < 4) throw new Error("payload did not open");
  const declared = new DataView(padded.buffer, padded.byteOffset, padded.byteLength).getUint32(
    0,
    true,
  );
  if (4 + declared > padded.length) throw new Error("payload did not open");
  return padded.slice(4, 4 + declared);
}

/** Encrypt `plaintext` for one specific slot in one specific channel. */
export function sealEntry(
  key: ChannelKey,
  binding: EntryBinding,
  plaintext: Uint8Array,
): WireCiphertext {
  if (plaintext.length > MAX_ENTRY_PLAINTEXT) {
    throw new Error(
      `This entry is ${plaintext.length} bytes; the protocol accepts ${MAX_ENTRY_PLAINTEXT}.`,
    );
  }
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = chacha20poly1305(key, nonce, bindingTranscript(binding)).encrypt(
    pad(plaintext),
  );
  return {
    key_id: channelKeyId(key),
    nonce: Array.from(nonce),
    ciphertext: Array.from(ciphertext),
  };
}

/**
 * Decrypt a payload written for this exact slot.
 *
 * Throws — never partial or unauthenticated output — for a wrong key, a
 * tampered ciphertext, or a payload lifted from a different settlement,
 * author, sequence or kind. That last one is the binding doing its job:
 * without it a party could re-post their counterparty's ciphertext under
 * their own name and their own valid signature, turning "the seller sent me
 * this account number" into something the buyer appears to have said.
 */
export function openEntry(
  key: ChannelKey,
  binding: EntryBinding,
  payload: WireCiphertext,
): Uint8Array {
  const padded = chacha20poly1305(
    key,
    Uint8Array.from(payload.nonce),
    bindingTranscript(binding),
  ).decrypt(Uint8Array.from(payload.ciphertext));
  return unpad(padded);
}

/**
 * Where a channel key lives between page loads.
 *
 * `sessionStorage` rather than `localStorage`: a channel key opens a trade's
 * payment details and its whole conversation, and leaving one in a shared
 * machine's persistent storage after the tab closes is the disclosure the
 * protocol exists to prevent, one layer out.
 *
 * This is now a cache rather than the only copy. Losing it costs a wallet
 * prompt, not the channel: {@link recoverChannelKey} opens the grant the
 * network holds. It is kept because the alternative is a signature prompt
 * on every navigation for a key the tab already had.
 */
const keyStorageKey = (settlementId: string) => `openfiat:channel-key:${settlementId}`;

export function rememberChannelKey(settlementId: string, key: ChannelKey): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(keyStorageKey(settlementId), bs58.encode(key));
}

export function recallChannelKey(settlementId: string): ChannelKey | null {
  if (typeof sessionStorage === "undefined") return null;
  const stored = sessionStorage.getItem(keyStorageKey(settlementId));
  if (!stored) return null;
  try {
    const key = bs58.decode(stored);
    return key.length === 32 ? key : null;
  } catch {
    return null;
  }
}

/**
 * `openfiat_tradechannel::events::TradeChannelKeyGrant` — settlement_id,
 * granter, recipient, key_id, sealed_key, timestamp.
 *
 * `role` is deliberately absent from the event: the node derives it from the
 * settlement and the dispute record, both of which it can check for itself.
 *
 * `recipient.encryptionKey` is the X25519 key that peer published as an
 * `EncryptionKey` identity claim — the only key they can prove they hold
 * the secret to, and therefore the only one worth sealing to. It must have
 * been read from that claim; there is no fallback to their wallet key, and
 * adding one would silently reintroduce the unopenable grant this replaced.
 *
 * `recipient.peerId` still comes from the settlement, because that is what
 * the node checks: it verifies the recipient is a party or a joined
 * arbitrator and refuses anyone else with `RECIPIENT_NOT_PERMITTED`. The two
 * halves come from different records on purpose — the settlement says who
 * may read, the claim says how to reach them.
 */
export async function grantChannelKey(
  who: TradeIdentity,
  settlementId: string,
  recipient: { peerId: string; encryptionKey: Uint8Array },
  key: ChannelKey,
): Promise<void> {
  const grant = {
    settlement_id: settlementId,
    granter: who.peerId,
    recipient: recipient.peerId,
    key_id: channelKeyId(key),
    sealed_key: sealToEncryptionKey(recipient.encryptionKey, key),
    timestamp: Date.now(),
  };
  const signature = await signPayload(who.provider, grant);
  await sendSignedEvent(nodeUrl(), "sendTradeChannelKeyGrant", { grant, signature });
}

/**
 * The channel key this wallet holds a grant for, or `null` if none of the
 * grants on the channel are addressed to it or open under its key.
 *
 * This is the function whose absence made the whole feature unusable. Every
 * grant addressed to this peer is tried, newest first, because both parties
 * may legitimately grant the same reader and one of them sealing the wrong
 * bytes must not lock that reader out of a channel the other opened for
 * them.
 *
 * A grant that opens to something other than 32 bytes is skipped rather
 * than returned: the granter controls what goes inside a sealed box, and a
 * node cannot check it — that is what makes a sealed box useful. `key_id`
 * is checked against what actually opened for the same reason, so a
 * granter who sealed a *different* valid key cannot make this client
 * silently fail to decrypt every entry.
 */
export function recoverChannelKey(
  channel: WireTradeChannel,
  myPeerId: string,
  keypair: EncryptionKeypair,
): ChannelKey | null {
  const mine = channel.grants
    .filter((grant) => grant.recipient === myPeerId)
    .sort((a, b) => b.granted_at - a.granted_at);
  for (const grant of mine) {
    let opened: Uint8Array;
    try {
      opened = openWithEncryptionKey(keypair, grant.sealed_key);
    } catch {
      // Addressed to this peer but sealed to a different encryption key —
      // an older one this wallet has rotated away from, most likely. Not an
      // error; the next grant may well open.
      continue;
    }
    if (opened.length !== 32) continue;
    if (channelKeyId(opened).join(",") !== grant.key_id.join(",")) continue;
    return opened;
  }
  return null;
}

/**
 * `openfiat_tradechannel::events::TradeChannelEntryPost` — settlement_id,
 * author, sequence, kind, payload, timestamp.
 *
 * `sequence` is the author's own counter from zero, and only the author's
 * signature is accepted at the author's own numbers, so neither party can
 * squat the other's slots. A *different* entry at a number already taken is
 * refused as `SEQUENCE_REUSED`; a byte-identical repost is a no-op, because
 * gossip delivers the same event more than once as a matter of course.
 */
export async function postChannelEntry(
  who: TradeIdentity,
  settlementId: string,
  key: ChannelKey,
  kind: EntryKind,
  sequence: number,
  plaintext: string,
): Promise<void> {
  const payload = sealEntry(
    key,
    { settlementId, author: who.peerId, sequence, kind },
    new TextEncoder().encode(plaintext),
  );
  const post = {
    settlement_id: settlementId,
    author: who.peerId,
    sequence,
    kind,
    payload,
    timestamp: Date.now(),
  };
  const signature = await signPayload(who.provider, post);
  await sendSignedEvent(nodeUrl(), "sendTradeChannelEntry", { post, signature });
}

/** The next sequence number `author` should write at, from what the node holds. */
export function nextSequence(channel: WireTradeChannel, author: string): number {
  return channel.entries
    .filter((entry) => entry.author === author)
    .reduce((next, entry) => Math.max(next, entry.sequence + 1), 0);
}

/**
 * One entry as this client can actually present it.
 *
 * `text` is `null` when the entry could not be opened, and `sealed` says so
 * explicitly rather than leaving a caller to infer it from an empty string. A
 * screen that could not tell them apart would render a merchant's real,
 * unreadable payment details as no payment details at all.
 */
export interface ReadEntry {
  author: string;
  sequence: number;
  kind: EntryKind;
  postedAt: number;
  text: string | null;
  sealed: boolean;
}

/** Opens what it can of a channel under the keys this browser holds. */
export function readEntries(
  channel: WireTradeChannel,
  keys: ChannelKey[],
): ReadEntry[] {
  const byId = new Map(keys.map((key) => [channelKeyId(key).join(","), key]));
  return channel.entries
    .map((entry) => {
      const key = byId.get(entry.payload.key_id.join(","));
      let text: string | null = null;
      if (key) {
        try {
          text = new TextDecoder().decode(
            openEntry(
              key,
              {
                settlementId: entry.settlement_id,
                author: entry.author,
                sequence: entry.sequence,
                kind: entry.kind,
              },
              entry.payload,
            ),
          );
        } catch {
          // Authenticated decryption failing is not "empty" — leave it sealed.
          text = null;
        }
      }
      return {
        author: entry.author,
        sequence: entry.sequence,
        kind: entry.kind,
        postedAt: entry.posted_at,
        text,
        sealed: text === null,
      };
    })
    .sort((a, b) => a.postedAt - b.postedAt || a.sequence - b.sequence);
}

/**
 * What a `PaymentDetails` entry carries.
 *
 * No OFS defines this — the protocol says only that the entry is "the
 * instructions one party must follow to pay the other" and leaves the bytes
 * to clients. Field-by-field rather than one blob, for the reason
 * `lib/payment-accounts.ts` already gives: a blob forces the payer to select
 * text out of a paragraph and get it wrong, and an account number typed
 * wrongly is a payment to a stranger.
 */
export interface PaymentDetailsPayload {
  /** The rail's catalogue id — `builtin:mpesa-kenya`, never a display name. */
  method: string;
  /** The node's name for that id when it was written, for offline display. */
  methodName?: string;
  fields: { label: string; value: string }[];
  /** What the payer should put in the transfer's own reference field. */
  reference?: string;
  note?: string;
}

export function encodePaymentDetails(details: PaymentDetailsPayload): string {
  return JSON.stringify(details);
}

/** `null` when the text is not this shape, which a reader must show as
 *  unrecognised rather than as an empty set of instructions. */
export function decodePaymentDetails(text: string): PaymentDetailsPayload | null {
  try {
    const parsed = JSON.parse(text) as PaymentDetailsPayload;
    return typeof parsed?.method === "string" && Array.isArray(parsed.fields) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The copy for reading one's own channel.
 *
 * Its own domain separator, like every other gated read: a signature a wallet
 * made to list its settlements must not also open its conversations, even
 * though both draw their nonces from the same ledger on the node.
 *
 * Gating a read of ciphertext is not confidentiality and is not claimed to
 * be. What it protects is the metadata — which settlement, which author, when
 * — and that metadata is the trade graph.
 */
export const MY_TRADE_CHANNEL: GatedSurface = {
  challenge: "getWalletChallenge",
  domain: "openfiat-my-trade-channel",
  messages: {
    "not-your-wallet":
      "The node refused: this channel answers only to the settlement's two parties and to a peer somebody granted the key to.",
    "challenge-expired":
      "The challenge expired before it was signed — it is only valid for five minutes. Try again and approve the wallet prompt promptly.",
    "challenge-spent": "That challenge was already used. Each one is single-use; try again.",
    "wrong-key": "The signature did not verify against the connected wallet's key.",
    "wallet-cannot-sign":
      "This wallet does not support message signing, which is how you prove you are party to this trade.",
    unreachable: "Could not reach the selected node.",
  },
};

/**
 * One settlement's channel, as the node holds it: every grant and every
 * entry, all of the entries still encrypted.
 *
 * Not memoized through `cachedRead` like the other gated reads, because those
 * are keyed by wallet and node alone and this one also varies by settlement —
 * a shared cache would hand one trade's channel back for another's. It costs
 * a wallet prompt per read, so callers ask on demand rather than on mount.
 */
export async function fetchMyTradeChannel(
  endpoint: string,
  settlementId: string,
  address: string,
  signer: SolanaProvider,
): Promise<WireTradeChannel> {
  return signedRead<WireTradeChannel>(
    endpoint,
    "getMyTradeChannel",
    address,
    signer,
    MY_TRADE_CHANNEL,
    { id: settlementId },
  );
}
