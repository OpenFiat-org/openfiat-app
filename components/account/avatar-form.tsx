"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("account");
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
      .catch(() => !cancelled && setError(t("nodeUnreachable")))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [wallet, t]);

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
      setError(t("imageTooBig", { kb: Math.round(file.size / 1024), max: Math.round(MAX_AVATAR_BYTES / 1024) }));
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
      setError(t("signerUnavailable"));
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
      setDone(t("avPublished"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("publishAvatarError"));
    } finally {
      setBusy(false);
    }
  }

  if (!wallet) {
    return (
      <Panel title={t("avTitle")}>
        <p className="px-4 py-10 text-center text-sm text-gray-500">
          {t("avConnect")}
        </p>
      </Panel>
    );
  }

  return (
    <Panel title={t("avTitle")}>
      <div className="space-y-4 px-4 py-4">
        <p className="text-sm text-gray-400">
          {t("avIntro")}
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
                alt={previewUrl ? t("imgAltSelected") : t("imgAltCurrent")}
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
              <WalletAvatar seed={wallet.address} label={t("avatarLabel")} size={80} />
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
              {t("avFileHelp", { kb: Math.round(MAX_AVATAR_BYTES / 1024) })}
            </p>
            {!current && !previewUrl && !loading && (
              <p className="mt-1.5 text-[11px] text-gray-600">
                {t("avPlaceholderNote")}
              </p>
            )}
          </div>
        </div>

        <p className="rounded-md border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs text-amber-200/90">
          {t("avPublicWarning")}
        </p>

        {current && (
          <p className="text-xs text-gray-500">
            {t("avSetOn", { date: new Date(current.createdAt).toLocaleDateString() })}
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
          {busy ? t("avUploading") : current ? t("publishNewAvatar") : t("publishAvatar")}
        </button>

        <p className="text-[11px] text-gray-600">
          {t("avFooter")}
        </p>
      </div>
    </Panel>
  );
}
