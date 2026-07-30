"use client";

import { useEffect, useRef, useState } from "react";
import bs58 from "bs58";

import { Panel } from "@/components/panel";
import { WalletAvatar } from "@/components/wallet-avatar";
import { fetchAvatar, publishAvatar, type AvatarClaim } from "@/lib/avatar";
import { ACCEPTED_IMAGE_TYPES, MAX_AVATAR_BYTES } from "@/lib/ipfs/gateway";
import {
  WALLET_CHANGED_EVENT,
  currentSigner,
  readWalletConnection,
  type WalletConnection,
} from "@/lib/wallet-connection";

/**
 * Publish a profile picture.
 *
 * Two things the copy has to get across before the file picker opens,
 * because both are irreversible once the button is pressed:
 *
 * 1. The image is public to anyone, forever, and not only to traders.
 *    A CID resolves through any gateway with no credential — measured,
 *    not assumed.
 * 2. Changing it does not erase the old one. Claims are immutable, so a
 *    new avatar records which claim it supersedes and the previous
 *    picture stays in the record.
 *
 * Saying that after the upload would be too late for either.
 */
export function AvatarForm() {
  const [wallet, setWallet] = useState<WalletConnection | null>(null);
  const [current, setCurrent] = useState<AvatarClaim | null>(null);
  const [chosen, setChosen] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const read = () => setWallet(readWalletConnection());
    read();
    window.addEventListener(WALLET_CHANGED_EVENT, read);
    return () => window.removeEventListener(WALLET_CHANGED_EVENT, read);
  }, []);

  useEffect(() => {
    if (!wallet) {
      setCurrent(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchAvatar(wallet.address)
      .then((claim) => !cancelled && setCurrent(claim))
      .catch(() => !cancelled && setError("Could not reach your access node."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [wallet]);

  // A blob URL holds the file in memory until it is revoked, and picking
  // several images in a row would otherwise leak one per choice.
  useEffect(() => {
    if (!chosen) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(chosen);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [chosen]);

  function choose(file: File | null) {
    setError(null);
    setDone(null);
    if (!file) {
      setChosen(null);
      return;
    }
    // Checked again on the server, which is what actually enforces it —
    // this is only so the user hears about a 5 MB photo immediately
    // rather than after uploading it.
    if (file.size > MAX_AVATAR_BYTES) {
      setChosen(null);
      setError(`That image is ${Math.round(file.size / 1024)} KB. Keep it under ${Math.round(MAX_AVATAR_BYTES / 1024)} KB.`);
      return;
    }
    setChosen(file);
  }

  async function submit() {
    if (!wallet || !chosen) return;
    setError(null);
    setDone(null);
    const provider = currentSigner(wallet);
    if (!provider) {
      setError("Reconnect your wallet — the signing provider is not available.");
      return;
    }
    setBusy(true);
    try {
      const publicKey = bs58.decode(wallet.address);
      await publishAvatar(provider, publicKey, chosen, current?.claimId ?? null);
      const refreshed = await fetchAvatar(wallet.address);
      setCurrent(refreshed);
      setChosen(null);
      if (inputRef.current) inputRef.current.value = "";
      setDone("Avatar published.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish the avatar.");
    } finally {
      setBusy(false);
    }
  }

  if (!wallet) {
    return (
      <Panel title="Avatar">
        <p className="px-4 py-10 text-center text-sm text-gray-500">
          Connect a wallet. An avatar is a claim signed by your key, so there is nothing to set until
          a wallet is connected.
        </p>
      </Panel>
    );
  }

  return (
    <Panel title="Avatar">
      <div className="space-y-4 px-4 py-4">
        <p className="text-sm text-gray-400">
          The picture shown beside your advertisements. It is stored on IPFS and published as a
          signed identity claim, so it belongs to your wallet and follows it to every OpenFiat
          application.
        </p>

        <div className="flex items-center gap-4">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full">
            {previewUrl || current ? (
              /* A plain <img>, not next/image: next/image would route the
                 fetch through this app's own server to resize it, making
                 our origin fetch and re-serve content a stranger chose.
                 The browser fetches it from the gateway directly. */
              <img
                src={previewUrl ?? current!.url}
                alt={previewUrl ? "The image you selected" : "Your current avatar"}
                className="h-full w-full rounded-full border border-white/10 object-cover"
              />
            ) : loading ? (
              <div className="flex h-full w-full items-center justify-center rounded-full border border-white/10 bg-white/5 text-xs text-gray-600">
                …
              </div>
            ) : (
              /* The robot the rest of the app already shows for this key, so
                 the "before" here is what a counterparty is actually seeing
                 rather than a grey circle unique to this form. */
              <WalletAvatar seed={wallet.address} label="your wallet" size={80} />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES.join(",")}
              disabled={busy}
              onChange={(e) => choose(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-gray-400 file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-sm file:text-gray-200 hover:file:bg-white/15"
            />
            <p className="mt-1.5 text-[11px] text-gray-600">
              PNG, JPEG or WebP, up to {Math.round(MAX_AVATAR_BYTES / 1024)} KB.
            </p>
            {!current && !previewUrl && !loading && (
              <p className="mt-1.5 text-[11px] text-gray-600">
                Until you publish one, your wallet shows the robot on the left. It is drawn from
                your key on each viewer&apos;s own device — nothing is uploaded and no request is
                made for it — and it is drawn as a placeholder rather than as a picture you chose.
              </p>
            )}
          </div>
        </div>

        <p className="rounded-md border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs text-amber-200/90">
          Anyone can view this image. Content on IPFS is addressed by a hash that travels in public
          protocol records, and any gateway will serve it to anyone who has that hash — no account
          and no permission. Do not upload anything you would not publish.
        </p>

        {current && (
          <p className="text-xs text-gray-500">
            Set {new Date(current.createdAt).toLocaleDateString()}. Publishing a new one does not
            erase it: claims are immutable, so the replacement records which claim it supersedes and
            the old picture stays readable in your history.
          </p>
        )}

        {error && <p className="text-sm text-amber-400">{error}</p>}
        {done && <p className="text-sm text-emerald-400">{done}</p>}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={!chosen || busy}
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Uploading and signing…" : current ? "Publish new avatar" : "Publish avatar"}
        </button>

        <p className="text-[11px] text-gray-600">
          The image is uploaded first, then read back from a gateway to confirm it is really there,
          and only then does your wallet sign the claim. Nothing goes on chain and no transaction fee
          is paid.
        </p>
      </div>
    </Panel>
  );
}
