"use client";

import { useCallback, useEffect, useState } from "react";
import bs58 from "bs58";

import {
  MAX_CAPTION,
  fetchAttachments,
  publishAttachment,
  type Attachment,
} from "@/lib/attachments";
import { ACCEPTED_MEDIA_TYPES, MAX_UPLOAD_BYTES } from "@/lib/ipfs/gateway";
import {
  WALLET_CHANGED_EVENT,
  currentSigner,
  readWalletConnection,
  type WalletConnection,
} from "@/lib/wallet-connection";

/**
 * Evidence on one trade: receipts, screenshots, statements.
 *
 * # Everyone can read what is attached here
 *
 * The warning above the file picker is not boilerplate. Content on IPFS
 * is addressed by a hash that travels in public protocol records, and any
 * gateway serves it to anyone holding that hash, with no account and no
 * permission — checked against an unrelated public gateway, not assumed.
 *
 * It is also the right property. A dispute is decided by arbitrators
 * drawn by sortition, whose identities are unknown when a file is chosen,
 * so evidence only the uploader could decrypt would decide nothing. What
 * must not go here is a payment detail — that has its own sealed
 * exchange between the two counterparties.
 *
 * # Why this only appears once a settlement exists
 *
 * An attachment names a settlement, because that is the record an
 * arbitrator reads and the record that says who the two parties are.
 * Before one exists there is nothing to attach to, so the panel says that
 * rather than offering a picker whose upload would have nowhere to go.
 */
export function TradeAttachments({ settlementId }: { settlementId: string | null }) {
  const [wallet, setWallet] = useState<WalletConnection | null>(null);
  const [items, setItems] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const read = () => setWallet(readWalletConnection());
    read();
    window.addEventListener(WALLET_CHANGED_EVENT, read);
    return () => window.removeEventListener(WALLET_CHANGED_EVENT, read);
  }, []);

  const refresh = useCallback(async () => {
    if (!settlementId) return;
    setLoading(true);
    try {
      setItems(await fetchAttachments(settlementId));
    } catch {
      setError("Could not read attachments from your access node.");
    } finally {
      setLoading(false);
    }
  }, [settlementId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function submit() {
    if (!wallet || !file || !settlementId) return;
    setError(null);
    const provider = currentSigner(wallet);
    if (!provider) {
      setError("Reconnect your wallet — the signing provider is not available.");
      return;
    }
    setBusy(true);
    try {
      const publicKey = bs58.decode(wallet.address);
      await publishAttachment(provider, publicKey, settlementId, file, caption);
      setFile(null);
      setCaption("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish the attachment.");
    } finally {
      setBusy(false);
    }
  }

  if (!settlementId) {
    return (
      <p className="text-sm text-gray-500">
        Files can be attached once the trade has a settlement. An attachment names the settlement it
        belongs to — that is the record an arbitrator reads.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {loading && items.length === 0 ? (
        <p className="text-sm text-gray-500">Reading attachments…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-500">Nothing attached to this trade yet.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-md border border-white/10 bg-white/[0.02] p-3">
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="block">
                {/* A plain <img> below, not next/image: next/image routes
                    the fetch through this app's own server so it can
                    resize and re-encode, which would mean our origin
                    fetching and re-serving whatever a counterparty's
                    record points at. For untrusted content the browser
                    should fetch from the gateway with no involvement from
                    us. */}
                {item.isImage ? (
                  <img
                    src={item.url}
                    alt={item.caption || "Attached evidence"}
                    className="h-32 w-full rounded object-cover"
                  />
                ) : (
                  <div className="flex h-32 w-full items-center justify-center rounded bg-white/5 text-xs text-gray-400">
                    PDF — open in a new tab
                  </div>
                )}
              </a>
              {/* Rendered as text: a caption is a counterparty-supplied
                  string and must never become markup. */}
              <p className="mt-2 truncate text-xs text-gray-300">{item.caption || "No caption"}</p>
              <p className="mt-0.5 text-[11px] text-gray-600">
                {new Date(item.createdAt).toLocaleString()} · {Math.round(item.sizeBytes / 1024)} KB
              </p>
            </li>
          ))}
        </ul>
      )}

      {wallet ? (
        <div className="space-y-3 border-t border-white/10 pt-4">
          <p className="rounded-md border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs text-amber-200/90">
            Anything you attach is public and permanent. It is stored on IPFS, and any gateway will
            serve it to anyone holding the reference — which travels in records every node keeps.
            Never attach payment details or identity documents here.
          </p>

          <input
            type="file"
            accept={ACCEPTED_MEDIA_TYPES.join(",")}
            disabled={busy}
            onChange={(e) => {
              setError(null);
              setFile(e.target.files?.[0] ?? null);
            }}
            className="block w-full text-sm text-gray-400 file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-sm file:text-gray-200 hover:file:bg-white/15"
          />

          <input
            value={caption}
            maxLength={MAX_CAPTION}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="What is this? e.g. bank transfer receipt"
            disabled={busy}
            className="w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm text-white outline-none placeholder:text-gray-600 focus:border-brand/50"
          />

          {error && <p className="text-sm text-amber-400">{error}</p>}

          <button
            type="button"
            onClick={() => void submit()}
            disabled={!file || busy}
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Uploading and signing…" : "Attach file"}
          </button>

          <p className="text-[11px] text-gray-600">
            PNG, JPEG, WebP or PDF, up to {Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB. Your
            wallet signs the record; only you and your counterparty can add to this trade, and an
            attachment cannot be removed once published.
          </p>
        </div>
      ) : (
        <p className="border-t border-white/10 pt-4 text-sm text-gray-500">
          Connect your wallet to attach a file. Only the buyer and the seller of a trade can add to
          it, which is checked against the settlement rather than taken on trust.
        </p>
      )}
    </div>
  );
}
