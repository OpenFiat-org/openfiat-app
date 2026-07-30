"use client";

import { useEffect, useState } from "react";
import bs58 from "bs58";

import { Panel } from "@/components/panel";
import {
  MAX_MERCHANT_NAME,
  fetchMerchantName,
  publishMerchantName,
  validateMerchantName,
  type MerchantNameClaim,
} from "@/lib/merchant-name";
import {
  currentSigner,
  readWalletConnection,
  WALLET_CHANGED_EVENT,
  type WalletConnection,
} from "@/lib/wallet-connection";

/**
 * Set or change the name other traders see.
 *
 * Deliberately not presented as a settings field that overwrites a value.
 * A name is an OFS-5000 identity claim signed by the wallet, and claims are
 * immutable — renaming publishes a replacement that names the old claim in
 * `supersedes`, and the old one stays in the record. The copy says that,
 * because a text input that looks like it edits a database row would
 * misrepresent what pressing the button does.
 */
export function MerchantNameForm() {
  const [wallet, setWallet] = useState<WalletConnection | null>(null);
  const [current, setCurrent] = useState<MerchantNameClaim | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    const read = () => setWallet(readWalletConnection());
    read();
    window.addEventListener(WALLET_CHANGED_EVENT, read);
    return () => window.removeEventListener(WALLET_CHANGED_EVENT, read);
  }, []);

  useEffect(() => {
    if (!wallet) {
      setCurrent(null);
      setName("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchMerchantName(wallet.address)
      .then((claim) => {
        if (cancelled) return;
        setCurrent(claim);
        setName(claim?.name ?? "");
      })
      .catch(() => !cancelled && setError("Could not reach your access node."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [wallet]);

  const validationError = name.trim().length > 0 ? validateMerchantName(name) : null;
  const unchanged = current !== null && current.name === name.trim();
  const canSubmit =
    !!wallet && name.trim().length > 0 && !validationError && !unchanged && !busy && !loading;

  async function submit() {
    if (!wallet) return;
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
      await publishMerchantName(provider, publicKey, name, current?.claimId ?? null);
      const refreshed = await fetchMerchantName(wallet.address);
      setCurrent(refreshed);
      setDone(current ? "Name changed." : "Name published.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish the claim.");
    } finally {
      setBusy(false);
    }
  }

  if (!wallet) {
    return (
      <Panel title="Merchant name">
        <p className="px-4 py-10 text-center text-sm text-gray-500">
          Connect a wallet. A merchant name is a claim signed by your key, not an account setting —
          there is nothing to set until a wallet is connected.
        </p>
      </Panel>
    );
  }

  return (
    <Panel title="Merchant name">
      <div className="space-y-4 px-4 py-4">
        <p className="text-sm text-gray-400">
          The name shown beside your advertisements. It is published as a signed identity claim
          (OFS-5000), so it belongs to your wallet and follows it to every OpenFiat application —
          not to this site.
        </p>

        <div>
          <label htmlFor="merchant-name" className="mb-1 block text-xs text-gray-500">
            {current ? "New name" : "Name"}
          </label>
          <input
            id="merchant-name"
            value={name}
            maxLength={MAX_MERCHANT_NAME + 20}
            onChange={(e) => setName(e.target.value)}
            placeholder={loading ? "Reading your current name…" : "e.g. Westlands OTC"}
            disabled={loading || busy}
            className="w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm text-white outline-none focus:border-brand/50"
          />
          <div className="mt-1.5 flex justify-between text-[11px]">
            <span className="text-amber-300">{validationError ?? ""}</span>
            <span className="tabular-nums text-gray-600">
              {name.trim().length}/{MAX_MERCHANT_NAME}
            </span>
          </div>
        </div>

        {current && (
          <p className="text-xs text-gray-500">
            Current name <span className="text-gray-300">{current.name}</span>, set{" "}
            {new Date(current.createdAt).toLocaleDateString()}. Publishing a new one does not erase
            it: claims are immutable, so the replacement records which claim it supersedes and the
            old name stays readable in your history. That is deliberate — a merchant cannot rename
            away from a bad record.
          </p>
        )}

        {error && <p className="text-sm text-amber-400">{error}</p>}
        {done && <p className="text-sm text-emerald-400">{done}</p>}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canSubmit}
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Waiting for signature…" : current ? "Publish new name" : "Publish name"}
        </button>

        <p className="text-[11px] text-gray-600">
          Your wallet signs the claim; nothing is sent on chain and no transaction fee is paid. The
          claim is not verified by anyone — a display name is self-asserted, and the protocol does no
          document or business checks at any level.
        </p>
      </div>
    </Panel>
  );
}
