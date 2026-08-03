"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { CopyButton } from "@/components/copy-button";
import { PeerIdentity } from "@/components/peer-identity";
import {
  channelIdentity,
  counterpartyEncryptionKey,
  enrol,
  type EnrolmentState,
} from "@/lib/channel-identity";
import { formatDateMs } from "@/lib/format";
import { nodeUrl } from "@/lib/node-endpoint";
import {
  accountsFor,
  isComplete,
  readAccounts,
  type SavedPaymentAccount,
} from "@/lib/payment-accounts";
import type { Settlement } from "@/lib/live-settlements";
import {
  decodePaymentDetails,
  encodePaymentDetails,
  fetchMyTradeChannel,
  generateChannelKey,
  grantChannelKey,
  nextSequence,
  postChannelEntry,
  readEntries,
  recallChannelKey,
  recoverChannelKey,
  rememberChannelKey,
  type ChannelKey,
  type ReadEntry,
  type WireTradeChannel,
} from "@/lib/trade-channel";
import { tradeIdentity } from "@/lib/trade-flow";
import { currentSigner, type WalletConnection } from "@/lib/wallet-connection";

/**
 * The confidential trade channel, for the two people in a trade.
 *
 * Payment details and chat are the same shape — a payload attached to one
 * settlement, encrypted client-side under a per-trade key — so they are one
 * record type with a `kind`, and one panel.
 *
 * # The one step this panel asks for that nothing else does
 *
 * The channel is hybrid: one 32-byte content key per trade, and one small
 * sealed `KeyGrant` per reader. A grant is sealed to the recipient's
 * published **encryption key** — not their wallet key, which a browser
 * wallet will never surrender the secret to — so both parties must have
 * published one before either can be reached. That is `lib/channel-identity`
 * and it costs two wallet signatures, once, ever.
 *
 * So this panel has three states that were previously one, and it must keep
 * them apart on screen because they call for three different actions:
 *
 * - **You have not published a key.** Nobody can seal anything to you.
 *   One button fixes it.
 * - **They have not published a key.** You cannot start the channel, and
 *   nothing you do will change that — they have to open this trade once.
 *   Saying "something went wrong" here would send a merchant hunting for a
 *   fault on their own side.
 * - **Both published.** Everything works, including on a device that has
 *   never seen this trade: the grant on the network opens under the key the
 *   wallet re-derives.
 *
 * An entry this client cannot open still renders as *sealed*, never as
 * empty. "The merchant wrote nothing" and "the merchant wrote something
 * this client cannot read" are opposite answers, and the second one is the
 * one that gets somebody's money sent to nowhere.
 */
export function TradeChannelPanel({
  settlement,
  adMethods,
  wallet,
  myPeerId,
}: {
  settlement: Settlement;
  /**
   * The rails the advertisement accepts, as catalogue ids.
   *
   * A seller nominates an account the buyer can actually pay into, so the
   * picker is filtered against the ad's own methods rather than showing every
   * account saved on this machine — nominating one the buyer cannot use
   * spends the payment window on a dead end.
   */
  adMethods: string[];
  wallet: WalletConnection | null;
  myPeerId: string | null;
}) {
  const [channel, setChannel] = useState<WireTradeChannel | null>(null);
  const [key, setKey] = useState<ChannelKey | null>(null);
  const [identity, setIdentity] = useState<EnrolmentState | null>(null);
  /** `undefined` until looked up; `null` means they have published none. */
  const [theirKey, setTheirKey] = useState<Uint8Array | null | undefined>(undefined);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [accounts, setAccounts] = useState<SavedPaymentAccount[]>([]);

  useEffect(() => {
    setKey(recallChannelKey(settlement.id));
    setAccounts(readAccounts().filter(isComplete));
  }, [settlement.id]);

  const iAmSeller = myPeerId !== null && settlement.seller === myPeerId;
  /*
   * Both halves come off the settlement, never from an advertisement or a
   * lookup: the node checks a grant's recipient against the settlement's own
   * parties, and sealing to a key from anywhere else produces a grant nobody
   * can open addressed to somebody the node will refuse.
   */
  const counterparty = useMemo(
    () =>
      iAmSeller
        ? { peerId: settlement.buyer, publicKey: settlement.buyer_public_key }
        : { peerId: settlement.seller, publicKey: settlement.seller_public_key },
    [iAmSeller, settlement],
  );

  /**
   * Read the channel, then open as much of it as this wallet is entitled to.
   *
   * Three round trips, in an order that matters. The channel first, because
   * the rest is pointless without it. Then this wallet's own encryption
   * key — one prompt, cached for the tab — which is what turns a grant on
   * the network into the channel key, on any device, with nothing carried
   * over from the session that started the trade. Then the counterparty's
   * published key, because whether they have one decides what this panel is
   * allowed to offer.
   */
  const read = useCallback(async () => {
    const provider = currentSigner(wallet);
    if (!wallet || !provider) {
      setStatus("Connect a wallet — a channel answers only to the settlement's own parties.");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const fetched = await fetchMyTradeChannel(
        nodeUrl(),
        settlement.id,
        wallet.address,
        provider,
      );
      setChannel(fetched);

      const me = await channelIdentity(provider, wallet.address);
      setIdentity(me);
      if (myPeerId) {
        // The grant on the network wins over whatever this tab had cached:
        // a counterparty may have started the channel since, and their key
        // is the one the entries are actually under.
        const recovered = recoverChannelKey(fetched, myPeerId, me.keypair);
        if (recovered) {
          rememberChannelKey(settlement.id, recovered);
          setKey(recovered);
        }
      }
      setTheirKey(await counterpartyEncryptionKey(counterparty.publicKey));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [wallet, settlement.id, myPeerId, counterparty.publicKey]);

  /** Publish this wallet's encryption key, so the other side can seal to it. */
  const publishKey = useCallback(async () => {
    const provider = currentSigner(wallet);
    if (!wallet || !provider) return;
    setBusy(true);
    setStatus(null);
    try {
      await enrol(
        provider,
        wallet.address,
        // A rotation supersedes the claim it replaces, so every reader agrees
        // which key is current. A first publication has nothing to replace.
        identity?.status === "mismatch" ? identity.publishedClaimId : null,
      );
      setStatus(
        "Your encryption key is published. Anyone you trade with can now seal payment details and messages to it, and you can open them on any device this wallet is on.",
      );
      await read();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [wallet, identity, read]);

  /**
   * Start the channel: one key, granted to the counterparty and to yourself.
   *
   * The self-grant is what lets this wallet read the channel on another
   * device, or in this one after the tab is closed — it is the only copy of
   * the key that is not local. It was always sent and could not previously
   * be used for that, which is what made losing the tab final.
   *
   * Both grants are sealed to *published* keys. The counterparty's is looked
   * up from their identity claim; sealing to their wallet key instead would
   * produce a grant they cannot open, and this side would never know.
   */
  const start = useCallback(async () => {
    const provider = currentSigner(wallet);
    if (!wallet || !provider || !theirKey || identity?.status !== "ready") return;
    setBusy(true);
    setStatus(null);
    try {
      const who = tradeIdentity(provider, wallet.address);
      const fresh = generateChannelKey();
      await grantChannelKey(
        who,
        settlement.id,
        { peerId: counterparty.peerId, encryptionKey: theirKey },
        fresh,
      );
      await grantChannelKey(
        who,
        settlement.id,
        { peerId: who.peerId, encryptionKey: identity.keypair.publicKey },
        fresh,
      );
      rememberChannelKey(settlement.id, fresh);
      setKey(fresh);
      setStatus("Channel key generated and granted to both parties.");
      await read();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [wallet, settlement.id, counterparty.peerId, theirKey, identity, read]);

  const post = useCallback(
    async (kind: "PaymentDetails" | "Message", plaintext: string) => {
      const provider = currentSigner(wallet);
      if (!wallet || !provider || !key || !channel) return;
      setBusy(true);
      setStatus(null);
      try {
        const who = tradeIdentity(provider, wallet.address);
        await postChannelEntry(
          who,
          settlement.id,
          key,
          kind,
          // From what the node holds, not from a local counter: only the
          // author's own numbers are accepted at their own slots, and a
          // second tab that had counted separately would collide with itself.
          nextSequence(channel, who.peerId),
          plaintext,
        );
        setDraft("");
        await read();
      } catch (err) {
        setStatus(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [wallet, key, channel, settlement.id, read],
  );

  const entries = useMemo(
    () => (channel ? readEntries(channel, key ? [key] : []) : []),
    [channel, key],
  );
  const usable = accountsFor(accounts, adMethods, false);

  return (
    <div className="px-4 py-4">
      <p className="text-xs leading-relaxed text-gray-500">
        Payment details and messages are encrypted in this browser and sealed to each reader. A
        node holds the fact that an entry exists, who wrote it and when — never its content.
      </p>

      {!channel && (
        <button
          type="button"
          onClick={() => void read()}
          disabled={busy}
          className="mt-3 w-full rounded-md border border-white/10 py-2 text-sm text-gray-200 hover:border-white/20 disabled:opacity-50"
        >
          {busy ? "Reading…" : "Read this trade's channel"}
        </button>
      )}

      {channel && (
        <>
          <dl className="mt-3 space-y-1 text-xs">
            <div className="flex justify-between gap-3 border-t border-white/5 pt-1.5">
              <dt className="text-gray-500">Readers</dt>
              <dd className="text-right text-gray-200">
                {channel.grants.length === 0
                  ? "Nobody yet"
                  : `${new Set(channel.grants.map((g) => g.recipient)).size} granted`}
              </dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-white/5 pt-1.5">
              <dt className="text-gray-500">Entries</dt>
              <dd className="text-right text-gray-200">{channel.entries.length}</dd>
            </div>
          </dl>

          {identity && identity.status !== "ready" && (
            <div
              data-testid="enrolment-needed"
              className="mt-3 border-l-2 border-amber-400/60 bg-amber-400/5 px-3 py-2 text-xs leading-relaxed text-amber-200"
            >
              {identity.status === "not-published" ? (
                <p>
                  You have not published an encryption key, so nobody can seal payment details or
                  messages to you yet. Publishing one asks your wallet to sign the same message
                  twice — the second signature is the check that your wallet signs deterministically,
                  without which a key derived today could not be derived again.
                </p>
              ) : (
                <p>
                  Your wallet now derives a different encryption key from the one published on the
                  network. Publishing the new one lets people reach you again and will not recover
                  anything sealed under the old key — those grants are already replicated and cannot
                  be re-addressed.
                </p>
              )}
              <button
                type="button"
                onClick={() => void publishKey()}
                disabled={busy}
                className="mt-2 w-full rounded-md border border-amber-400/40 py-2 text-xs font-semibold text-amber-100 hover:border-amber-300/60 disabled:opacity-50"
              >
                {identity.status === "not-published"
                  ? "Publish my encryption key"
                  : "Publish my new encryption key"}
              </button>
            </div>
          )}

          {theirKey === null && (
            <p
              data-testid="counterparty-not-enrolled"
              className="mt-3 border-l-2 border-amber-400/60 bg-amber-400/5 px-3 py-2 text-xs leading-relaxed text-amber-200"
            >
              The other party has not published an encryption key yet, so there is nothing to seal a
              channel to. They publish one the first time they open this trade. Nothing is wrong on
              your side and nothing here will change until they do.
            </p>
          )}

          {!key && channel.grants.length === 0 && (
            <button
              type="button"
              onClick={() => void start()}
              disabled={busy || !theirKey || identity?.status !== "ready"}
              className="mt-3 w-full rounded-md bg-brand py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
            >
              Start the channel
            </button>
          )}

          {!key && channel.grants.length > 0 && identity?.status === "ready" && (
            <p
              data-testid="grants-unreadable"
              className="mt-3 border-l-2 border-amber-400/60 bg-amber-400/5 px-3 py-2 text-xs leading-relaxed text-amber-200"
            >
              This channel has readers, and none of the grants on it are addressed to your current
              encryption key. The entries below exist and are not empty; they are unreadable here.
              That happens when the channel was started before you published this key.
            </p>
          )}

          <ul className="mt-4 space-y-3">
            {entries.map((entry) => (
              <ChannelEntryRow
                key={`${entry.author}:${entry.sequence}`}
                entry={entry}
                isMine={entry.author === myPeerId}
              />
            ))}
            {entries.length === 0 && (
              <li className="text-xs text-gray-500">
                Nothing has been written into this channel yet.
              </li>
            )}
          </ul>

          {key && (
            <div className="mt-4 space-y-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={2}
                placeholder="Message the other party"
                className="w-full rounded-md border border-white/10 bg-[#0a0e14]/70 px-3 py-2 text-sm text-white outline-none focus:border-brand/50"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void post("Message", draft)}
                  disabled={busy || draft.trim() === ""}
                  className="flex-1 rounded-md border border-white/10 py-2 text-xs text-gray-200 hover:border-white/20 disabled:opacity-40"
                >
                  Send message
                </button>
                {iAmSeller && usable.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      void post(
                        "PaymentDetails",
                        encodePaymentDetails({
                          method: usable[0]!.method,
                          methodName: usable[0]!.methodName,
                          fields: usable[0]!.fields.map((f) => ({
                            label: f.label,
                            value: f.value,
                          })),
                        }),
                      )
                    }
                    disabled={busy}
                    className="flex-1 rounded-md border border-white/10 py-2 text-xs text-gray-200 hover:border-white/20 disabled:opacity-40"
                  >
                    Send my payment details
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {status && <p className="mt-3 text-xs leading-relaxed text-amber-300">{status}</p>}
    </div>
  );
}

function ChannelEntryRow({ entry, isMine }: { entry: ReadEntry; isMine: boolean }) {
  const details = entry.text ? decodePaymentDetails(entry.text) : null;
  return (
    <li className="rounded-md border border-white/10 p-3">
      <div className="flex flex-wrap items-baseline gap-2 text-xs">
        <PeerIdentity peer={entry.author} isYou={isMine} />
        <span className="text-gray-500">{entry.kind === "PaymentDetails" ? "payment details" : "message"}</span>
        <span className="ml-auto text-gray-600">{formatDateMs(entry.postedAt)}</span>
      </div>
      {entry.sealed ? (
        <p className="mt-2 text-xs text-gray-500">
          Sealed. This browser holds no key that opens it — that is not the same as it being empty.
        </p>
      ) : details ? (
        <dl className="mt-2 space-y-1">
          {details.fields.map((field) => (
            <div key={field.label} className="flex items-center justify-between gap-2 text-xs">
              <dt className="text-gray-500">{field.label}</dt>
              <dd className="flex min-w-0 items-center gap-1.5 text-right text-gray-200">
                <span className="truncate font-mono">{field.value}</span>
                <CopyButton value={field.value} />
              </dd>
            </div>
          ))}
          {details.reference && (
            <div className="flex items-center justify-between gap-2 text-xs">
              <dt className="text-gray-500">Reference</dt>
              <dd className="font-mono text-gray-200">{details.reference}</dd>
            </div>
          )}
        </dl>
      ) : (
        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-200">{entry.text}</p>
      )}
    </li>
  );
}
