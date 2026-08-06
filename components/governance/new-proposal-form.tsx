"use client";

import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { PROPOSAL_CATEGORIES, type ProposalCategory } from "@/lib/live-proposals";
import { createProposal, explainGovernanceRefusal } from "@/lib/proposal-flow";
import { tradeIdentity } from "@/lib/trade-flow";
import {
  WALLET_CHANGED_EVENT,
  currentSigner,
  readWalletConnection,
  type WalletConnection,
} from "@/lib/wallet-connection";

/**
 * An id a human can read and a URL can carry, from a title.
 *
 * The id is not cosmetic: it is the key the whole network stores the
 * proposal under, it is first come first served across every node, and it
 * is what `sha256` is taken of to join this record to an on-chain one — a
 * digest fixed at creation and never amendable. So it is derived from the
 * title, shown, and editable, rather than being a UUID nobody can say out
 * loud or a hidden value the author cannot check.
 *
 * Bounded, lowercased and stripped to an ASCII slug so that the same title
 * produces the same id in every locale — a Unicode id would join to a
 * different digest depending on normalisation.
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\da-z]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/**
 * Creating an off-chain proposal — the half of governance that carries the
 * text.
 *
 * # What this does and does not create
 *
 * It creates the network's record: signed by the author, gossiped to every
 * node, opened straight into voting for the protocol's default period.
 *
 * It does **not** create the on-chain `Proposal`, and does not pretend to.
 * That takes a stake deposit in OPEN paid to the governance program's
 * deposit vault, and it is a separate transaction the author sends
 * themselves. If they have already sent it they name its id here, which
 * puts their half of the join key inside the signature; the other half is
 * the program's `link_offchain_proposal`, and until both exist the two
 * records are not joined and no node will adopt the chain's answer for
 * this proposal. The proposal page says exactly which of those states it
 * is in.
 */
export function NewProposalForm() {
  const t = useTranslations("governance");
  const R = useTranslations("refusals");
  const router = useRouter();
  const [wallet, setWallet] = useState<WalletConnection | null>(null);
  const [title, setTitle] = useState("");
  const [id, setId] = useState("");
  const [idEdited, setIdEdited] = useState(false);
  const [summary, setSummary] = useState("");
  const [category, setCategory] = useState<ProposalCategory>("Protocol");
  const [onchainId, setOnchainId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setWallet(readWalletConnection());
    update();
    window.addEventListener(WALLET_CHANGED_EVENT, update);
    return () => window.removeEventListener(WALLET_CHANGED_EVENT, update);
  }, []);

  const effectiveId = idEdited ? id : slugify(title);
  const claimed = onchainId.trim();
  const claimedValid = claimed === "" || /^\d{1,20}$/.test(claimed);
  const ready =
    title.trim() !== "" && summary.trim() !== "" && effectiveId !== "" && claimedValid;

  async function submit() {
    const signer = currentSigner(wallet);
    if (!wallet || !signer) {
      setError(t("connectSignerError"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await createProposal(tradeIdentity(signer, wallet.address), {
        id: effectiveId,
        title: title.trim(),
        summary: summary.trim(),
        category,
        // `null`, never absent: `Option<u64>` renders as an explicit null
        // and the key is inside the bytes the node verifies against.
        onchainProposalId: claimed === "" ? null : Number(claimed),
      });
      router.push(`/governance/proposal/${encodeURIComponent(created)}`);
    } catch (err) {
      setError(explainGovernanceRefusal(R, err));
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-5">
      {!wallet && (
        <p className="rounded-md border border-amber-400/30 bg-amber-400/[0.04] px-4 py-3 text-xs leading-relaxed text-amber-200">
          {t("connectToFile")}
        </p>
      )}

      <Field label={t("fieldTitle")} htmlFor="proposal-title">
        <input
          id="proposal-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t("titlePlaceholder")}
          className="w-full rounded-md border border-white/10 bg-[#0a0e14]/70 px-3 py-2 text-sm text-white outline-none focus:border-brand/50"
        />
      </Field>

      <Field
        label={t("fieldId")}
        htmlFor="proposal-id"
        hint={t("idHint")}
      >
        <input
          id="proposal-id"
          value={effectiveId}
          onChange={(event) => {
            setIdEdited(true);
            setId(event.target.value);
          }}
          className="w-full rounded-md border border-white/10 bg-[#0a0e14]/70 px-3 py-2 font-mono text-sm text-white outline-none focus:border-brand/50"
        />
      </Field>

      <Field
        label={t("fieldSummary")}
        htmlFor="proposal-summary"
        hint={t("summaryHint")}
      >
        <textarea
          id="proposal-summary"
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          rows={6}
          className="w-full rounded-md border border-white/10 bg-[#0a0e14]/70 px-3 py-2 text-sm text-white outline-none focus:border-brand/50"
        />
      </Field>

      <Field
        label={t("fieldCategory")}
        htmlFor="proposal-category"
        hint={t("categoryHint")}
      >
        <select
          id="proposal-category"
          value={category}
          onChange={(event) => setCategory(event.target.value as ProposalCategory)}
          className="w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm text-white outline-none focus:border-brand/50 [&>option]:bg-[#10151d]"
        >
          {PROPOSAL_CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {t(`category.${value}`)}
            </option>
          ))}
        </select>
      </Field>

      <Field label={t("fieldOnchainId")} htmlFor="proposal-onchain-id">
        <input
          id="proposal-onchain-id"
          value={onchainId}
          onChange={(event) => setOnchainId(event.target.value)}
          inputMode="numeric"
          placeholder={t("onchainPlaceholder")}
          className="w-full rounded-md border border-white/10 bg-[#0a0e14]/70 px-3 py-2 font-mono text-sm text-white outline-none focus:border-brand/50"
        />
        <p className="mt-1 text-xs leading-relaxed text-gray-500">
          {t.rich("onchainNote", { code: (c) => <code>{c}</code> })}
        </p>
        {!claimedValid && (
          <p className="mt-1 text-xs text-amber-300">
            {t("onchainInvalid")}
          </p>
        )}
      </Field>

      {error && <p className="text-xs leading-relaxed text-red-300">{error}</p>}

      <button
        type="button"
        onClick={() => void submit()}
        disabled={!ready || busy || !wallet}
        className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-brand/40"
      >
        {busy ? t("signing") : t("signFile")}
      </button>

      <p className="text-xs leading-relaxed text-gray-500">
        {t("formFooter")}
      </p>
    </div>
  );
}

/**
 * One labelled control.
 *
 * The hint sits *outside* the `<label>` deliberately. Wrapping it would
 * fold three sentences of guidance into the field's accessible name, so a
 * screen reader would announce the whole paragraph every time focus landed
 * there — and it is the reason a `htmlFor`/`id` pair is used rather than
 * the wrapping-label shorthand used elsewhere in this app.
 */
function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-xs text-gray-500">
        {label}
      </label>
      <div className="mt-1">{children}</div>
      {hint && <p className="mt-1 text-xs leading-relaxed text-gray-500">{hint}</p>}
    </div>
  );
}
