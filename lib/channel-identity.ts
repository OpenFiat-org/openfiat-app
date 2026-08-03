import {
  DERIVATION_MESSAGE,
  derivationMessageBytes,
  deriveEncryptionKeypair,
  encodeEncryptionPublicKey,
  parseEncryptionPublicKey,
  type EncryptionKeypair,
} from "@openfiat/sdk";

import { sendSignedEvent, signPayload } from "@/lib/arbitration";
import { currentClaims, fetchIdentityClaims } from "@/lib/live-identity";
import { nodeUrl } from "@/lib/node-endpoint";
import { peerIdForAddress } from "@/lib/peer-id";
import { WALLET_CHANGED_EVENT, type SolanaProvider } from "@/lib/wallet-connection";

/**
 * The key this wallet can actually be sealed to.
 *
 * # What was broken
 *
 * A trade channel's content key travels as one `KeyGrant` per reader: an
 * `openfiat_crypto::SealedBox`, addressed to a key. Until now that key was
 * the recipient's Ed25519 wallet key, and opening such a box needs the
 * recipient's secret scalar. A Solana wallet exposes `signMessage` and
 * `signTransaction` and no key material at all — by design, and rightly.
 *
 * So a grant addressed to a real user was bytes that user could never
 * open. Two people with ordinary wallets could not exchange payment
 * details. `lib/trade-channel.ts` said so at the top of the file and the
 * screen said so honestly to the person waiting for a bank account number,
 * which did not make the feature work.
 *
 * # What is here instead
 *
 * A wallet derives a **separate X25519 keypair** from its own signature
 * over `DERIVATION_MESSAGE`, one fixed domain-separated string, and
 * publishes the public half as an OFS-5000 `EncryptionKey` identity claim.
 * Grants are sealed to that. The secret never leaves this module and is
 * never written anywhere — re-deriving it costs one wallet signature, on
 * any device, forever.
 *
 * # The determinism this rests on, and why it is checked rather than assumed
 *
 * The whole design turns on the same wallet producing the same signature
 * for the same bytes. Ed25519 is deterministic by construction: RFC 8032
 * §5.1.6 derives the per-signature nonce by hashing the private prefix
 * together with the message, using no randomness at all. That is the
 * standard every Solana signer implements, and it is why re-derivation
 * works on a device that has never seen this browser profile.
 *
 * It is still not assumed here, for a reason worth stating: a wallet that
 * randomised its signatures anyway — or one that wraps the bytes in an
 * envelope before signing rather than signing them raw, which changes the
 * signature without being wrong — would derive a different key every time,
 * and the user would lose access to their own channels *silently*. So:
 *
 * 1. **At enrolment**, {@link enrol} signs the message twice and compares.
 *    Two prompts, once per wallet, ever. A wallet that fails this is
 *    refused with an explanation rather than enrolled into a key nobody
 *    can predict.
 * 2. **Afterwards**, {@link channelIdentity} compares the derived public
 *    key against the claim the network holds. A mismatch is reported as a
 *    mismatch — never as "no key", and never silently repaired — because
 *    the two have different causes and different consequences: a wallet
 *    that has changed its signing behaviour, or a second wallet
 *    application over the same seed, means every existing channel is now
 *    unreadable and the user needs to know that rather than discover it.
 *
 * # What this costs
 *
 * **The derivation signature is the private key.** Any site that persuades
 * this wallet to sign `DERIVATION_MESSAGE` can derive the secret and read
 * every trade channel this wallet is party to — past and future, because a
 * trade channel deliberately has no forward secrecy (an arbitrator nobody
 * can name yet must be able to read the history later). It cannot move
 * funds: the message authorises no transfer and is not a valid transaction.
 * The defence is that the wallet renders the text verbatim and the text
 * says exactly this, which is weaker than "unphishable" and is not
 * presented as more.
 *
 * **Losing the wallet loses the channels.** The key is a function of the
 * wallet's secret and nothing else. It survives a lost laptop and does not
 * survive a lost seed phrase, and there is no recovery path.
 */

/** Re-exported so callers can show the person what they are about to sign. */
export { DERIVATION_MESSAGE };

/** What a wallet's enrolment looks like from the outside. */
export type EnrolmentState =
  /** Derived here, published on the network, and the two agree. */
  | { status: "ready"; keypair: EncryptionKeypair; publicKey: string }
  /** Derived here; nothing published. Nobody can seal to this wallet yet. */
  | { status: "not-published"; keypair: EncryptionKeypair; publicKey: string }
  /**
   * Derived here, but the network holds a *different* key for this wallet.
   *
   * Never repaired automatically. Publishing a new claim is the right move
   * and it costs the user every channel sealed under the old key, so it is
   * their decision to make with that fact in front of them.
   */
  | {
      status: "mismatch";
      keypair: EncryptionKeypair;
      publicKey: string;
      published: string;
      publishedClaimId: string;
    };

export class ChannelIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChannelIdentityError";
  }
}

/**
 * Derived keys for this tab, by wallet address.
 *
 * Memory, not `sessionStorage` and certainly not `localStorage`. This
 * secret opens every trade conversation the wallet is in, and re-deriving
 * it costs one signature — so persisting it would trade a prompt for a key
 * that survives the tab, sits in a store any script on the origin can read,
 * and outlives the reason it was derived. The cost is one wallet prompt per
 * page load, which is the same order as the signature every gated read
 * already needs.
 */
const derived = new Map<string, EncryptionKeypair>();

/** Forget this tab's derived keys — on disconnect, or when switching wallet. */
export function forgetChannelIdentity(address?: string): void {
  if (address === undefined) derived.clear();
  else derived.delete(address);
}

/*
 * Dropped the moment the connected wallet changes, including a disconnect.
 *
 * The cache is keyed by address, so a second wallet could never read the
 * first one's key by accident — that is not what this is for. It is for the
 * person who disconnects: leaving a key that opens every one of their trade
 * conversations sitting in a tab they believe they have signed out of is the
 * disclosure this module exists to prevent, one layer out.
 *
 * Registered here rather than in a component because the cache lives here.
 * A component that had to remember to clear it is a component that will
 * forget, and the next one added will not know it had to.
 */
if (typeof window !== "undefined") {
  window.addEventListener(WALLET_CHANGED_EVENT, () => forgetChannelIdentity());
}

async function signDerivationMessage(
  provider: SolanaProvider,
): Promise<Uint8Array> {
  if (!provider.signMessage) {
    throw new ChannelIdentityError(
      "This wallet cannot sign messages, which is how your encryption key is derived. Trade messages and payment details need it.",
    );
  }
  const { signature } = await provider.signMessage(derivationMessageBytes());
  if (signature.length !== 64) {
    throw new ChannelIdentityError(
      `This wallet returned a ${signature.length}-byte signature where the protocol expects 64. Its encryption key cannot be derived.`,
    );
  }
  return signature;
}

/**
 * This wallet's encryption keypair, deriving it if this tab does not
 * already hold it. One wallet prompt when it is not cached.
 */
export async function encryptionKeypair(
  provider: SolanaProvider,
  address: string,
): Promise<EncryptionKeypair> {
  const cached = derived.get(address);
  if (cached) return cached;
  const keypair = deriveEncryptionKeypair(await signDerivationMessage(provider));
  derived.set(address, keypair);
  return keypair;
}

/** An `EncryptionKey` claim currently in force for `wallet`, or null. */
async function publishedKey(
  wallet: string,
): Promise<{ value: string; claimId: string } | null> {
  const claims = currentClaims(await fetchIdentityClaims(wallet)).filter(
    (claim) => !claim.custom && claim.type === "EncryptionKey",
  );
  // Newest wins if a wallet somehow published two without superseding the
  // first, so that every client seals to the same one. `currentClaims`
  // already returns newest first.
  const claim = claims[0];
  return claim ? { value: claim.value, claimId: claim.claimId } : null;
}

/**
 * Where this wallet stands: derived, published, and whether they agree.
 *
 * Does not publish anything. A caller decides what to do about
 * `not-published` and `mismatch`, because both cost the user a wallet
 * prompt and one of them costs them their existing channels.
 */
export async function channelIdentity(
  provider: SolanaProvider,
  address: string,
): Promise<EnrolmentState> {
  const keypair = await encryptionKeypair(provider, address);
  const publicKey = encodeEncryptionPublicKey(keypair.publicKey);
  const published = await publishedKey(address);
  if (!published) return { status: "not-published", keypair, publicKey };
  if (published.value === publicKey) return { status: "ready", keypair, publicKey };
  return {
    status: "mismatch",
    keypair,
    publicKey,
    published: published.value,
    publishedClaimId: published.claimId,
  };
}

/**
 * Publish this wallet's encryption key, after proving the wallet derives it
 * the same way twice.
 *
 * The second signature is the whole point and is not a formality. If a
 * wallet's `signMessage` were not deterministic, enrolling would publish a
 * key the wallet can never derive again — and the failure would surface
 * days later as unreadable payment details on a live trade, with no way to
 * tell it apart from a counterparty who sealed to the wrong person. Two
 * prompts, once per wallet, buys a loud failure now instead of a silent one
 * later.
 *
 * `supersedes` links the claim to the one it replaces so that every reader
 * agrees which key is current. Rotating limits what is exposed *next* and
 * undoes nothing: the old grants are already replicated to every node.
 */
export async function enrol(
  provider: SolanaProvider,
  address: string,
  supersedes: string | null = null,
): Promise<EncryptionKeypair> {
  const first = deriveEncryptionKeypair(await signDerivationMessage(provider));
  const second = deriveEncryptionKeypair(await signDerivationMessage(provider));
  if (encodeEncryptionPublicKey(first.publicKey) !== encodeEncryptionPublicKey(second.publicKey)) {
    throw new ChannelIdentityError(
      "This wallet produced two different signatures for the same message, so an encryption key derived from it could not be derived again. Trade messages need a wallet whose signatures are deterministic, which every standard Ed25519 signer is. Nothing has been published.",
    );
  }

  const peerId = peerIdForAddress(address);
  if (!peerId) {
    throw new ChannelIdentityError("That wallet address is not a 32-byte Ed25519 key.");
  }

  /*
   * `openfiat_identity::events::ClaimPublish` — id, wallet,
   * wallet_public_key, claim_type, value, verified, supersedes, expires_at,
   * timestamp, in that order.
   *
   * Key order is load-bearing and silent when wrong: the node re-serializes
   * this with `serde_json`, which emits struct declaration order, and
   * verifies the signature over its own rendering. A reordered key is a
   * valid signature over the wrong bytes and comes back as
   * INVALID_SIGNATURE with nothing on screen to distinguish it from a
   * wallet fault. `supersedes` and `expires_at` are `Option`s and must be
   * explicit `null`s rather than absent keys, for the same reason.
   *
   * The id is random rather than derived from the wallet: `apply_publish`
   * refuses a duplicate `ClaimId` across the whole network, so a
   * predictable id could be squatted by anyone willing to publish it first,
   * locking a wallet out of ever enrolling.
   */
  const publish = {
    id: `enc-${crypto.randomUUID()}`,
    wallet: peerId,
    wallet_public_key: address,
    claim_type: "EncryptionKey",
    value: encodeEncryptionPublicKey(first.publicKey),
    verified: false,
    supersedes,
    expires_at: null,
    timestamp: Date.now(),
  };
  const signature = await signPayload(provider, publish);
  await sendSignedEvent(nodeUrl(), "sendClaimPublish", { publish, signature });

  derived.set(address, first);
  return first;
}

/**
 * The key to seal a grant to for `wallet`, or `null` if they have published
 * none in force.
 *
 * `null` is a real answer and a caller must surface it rather than fall
 * back to the wallet's Ed25519 key. Falling back is exactly how a channel
 * ends up sealed to somebody who cannot open it, which is the failure this
 * module exists to end — and it would be invisible to the granter, whose
 * own copy reads perfectly.
 */
export async function counterpartyEncryptionKey(
  walletAddress: string,
): Promise<Uint8Array | null> {
  const published = await publishedKey(walletAddress);
  if (!published) return null;
  // Parsed rather than trusted: a node validates this at publication, but
  // this client must not depend on every node in the network having done
  // so. A small-order point would produce a grant that every node holding a
  // replica could open.
  return parseEncryptionPublicKey(published.value);
}

/** Whether `value` is a usable published key, for rendering a claim row. */
export function isUsableEncryptionKey(value: string): boolean {
  return parseEncryptionPublicKey(value) !== null;
}
