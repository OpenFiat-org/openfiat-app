"use client";

import bs58 from "bs58";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CopyButton } from "@/components/copy-button";
import { PeerIdentity } from "@/components/peer-identity";
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
 * # What this panel can and cannot do, said once and not softened
 *
 * The channel is hybrid: one 32-byte content key per trade, and one small
 * sealed `KeyGrant` per reader. Sealing is a public-key operation, so this
 * app can address a grant to the counterparty perfectly well. **Opening one
 * needs the recipient's Ed25519 secret**, and a Solana wallet exposes
 * `signMessage` and `signTransaction` and no key material at all.
 *
 * So a browser reads a channel only under a key it generated itself and still
 * holds in this tab. A grant somebody addressed to this wallet is bytes this
 * browser cannot open, and the entries under it render as sealed — never as
 * empty, because "the merchant wrote nothing" and "the merchant wrote
 * something this client cannot read" are opposite answers and the second one
 * is the one that gets somebody's money sent to nowhere.
 *
 * That is a real, load-bearing gap and it is stated on screen rather than
 * worked around. Closing it needs a wallet that will perform X25519 with its
 * key, or a protocol identity this client holds the secret to; neither is
 * this repository's to add.
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

  const read = useCallback(async () => {
    const provider = currentSigner(wallet);
    if (!wallet || !provider) {
      setStatus("Connect a wallet — a channel answers only to the settlement's own parties.");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      setChannel(await fetchMyTradeChannel(nodeUrl(), settlement.id, wallet.address, provider));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [wallet, settlement.id]);

  /**
   * Start the channel: one key, granted to the counterparty and to yourself.
   *
   * The self-grant is not redundant in the protocol — it is how a client
   * recovers the key from the network on another device. It cannot serve that
   * purpose here, for the reason at the top of this file, and it is still
   * sent: the record of who was let in is public and checkable, and a channel
   * whose author never granted themselves would read as one they cannot open
   * either.
   */
  const start = useCallback(async () => {
    const provider = currentSigner(wallet);
    if (!wallet || !provider) return;
    setBusy(true);
    setStatus(null);
    try {
      const who = tradeIdentity(provider, wallet.address);
      const fresh = generateChannelKey();
      await grantChannelKey(who, settlement.id, {
        peerId: counterparty.peerId,
        publicKey: bs58.decode(counterparty.publicKey),
      }, fresh);
      await grantChannelKey(who, settlement.id, {
        peerId: who.peerId,
        publicKey: who.publicKey,
      }, fresh);
      rememberChannelKey(settlement.id, fresh);
      setKey(fresh);
      setStatus(
        "Channel key generated and granted to both parties. It is held in this tab only — closing it loses the ability to read this channel, and there is no recovery.",
      );
      await read();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [wallet, settlement.id, counterparty, read]);

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

          {!key && channel.grants.length === 0 && (
            <button
              type="button"
              onClick={() => void start()}
              disabled={busy}
              className="mt-3 w-full rounded-md bg-brand py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
            >
              Start the channel
            </button>
          )}

          {!key && channel.grants.length > 0 && (
            <p className="mt-3 border-l-2 border-amber-400/60 bg-amber-400/5 px-3 py-2 text-xs leading-relaxed text-amber-200">
              A channel key was granted to this wallet, and this browser cannot open it. A grant is
              sealed to your Ed25519 identity key, and opening one needs that key&apos;s secret —
              which a Solana wallet does not expose to a web page, by design. The entries below
              exist and are not empty; they are unreadable here.
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
