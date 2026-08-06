"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import bs58 from "bs58";
import type { PaymentMethodCategory } from "@openfiat/sdk";

import {
  MAX_METHOD_NAME_CHARS,
  defineMerchantMethod,
  explainDefineRefusal,
  groupedMethods,
  methodLabel,
  nameProblem,
  searchGrouped,
  type GroupedMethod,
} from "@/lib/payment-catalog";
import { useCountryPaymentMethods } from "@/components/use-country-methods";
import { MAX_PAYMENT_METHODS } from "@/lib/ad-draft";
import { nodeUrl } from "@/lib/node-endpoint";
import { peerIdForPublicKey } from "@/lib/arbitration";
import {
  WALLET_CHANGED_EVENT,
  currentSigner,
  readWalletConnection,
  type SolanaProvider,
} from "@/lib/wallet-connection";

/**
 * The four categories, in order. Their labels and hints are user copy,
 * resolved from the `ads` catalogue by value — the category is what a
 * payment-account form derives its fields from (`lib/payment-accounts.ts`),
 * so choosing the wrong one asks the merchant for the wrong details.
 */
const CATEGORIES: PaymentMethodCategory[] = ["MobileMoney", "BankTransfer", "Fintech", "Cash"];

/**
 * Payment-method picker: the node's per-country catalogue, type-ahead over
 * names and aliases, a cap of five, and a way to publish a rail the node has
 * never heard of.
 *
 * # It selects ids and shows names
 *
 * `selected` is a list of catalogue ids — `builtin:pix` — because that is
 * what `AdvertisementCreate.payment_methods` carries. A build that sent
 * display names could not publish at all: the node answers
 * `UNSUPPORTED_PAYMENT_METHOD` for `"PIX"` and accepts `"builtin:pix"`. See
 * `lib/payment-catalog.ts`, which records how that was established.
 *
 * # The suggestions are local knowledge, and come from the node
 *
 * This used to search a flat list in the order `getReferenceData` happened
 * to return it, so a merchant in Nairobi scrolled past Alipay and Zelle to
 * reach M-Pesa. `getPaymentMethods` takes a country and answers with the
 * rails that country actually uses first — PIX and Mercado Pago for Brazil,
 * UPI and IMPS for India, GoPay and DANA for Indonesia. That ordering is the
 * node's local knowledge, not a heuristic invented here.
 *
 * # "Add your own rail" is back, with the id format it needed
 *
 * There was such a control, and it was removed after `custom:whatever` came
 * back refused. Removing it was right — it guaranteed a failure two screens
 * later — but the diagnosis was one namespace too broad. The node takes
 * `builtin:<slug>` and `<peer id>:<digest>`; `custom:` is neither. The
 * second namespace is reached by *publishing a signed definition*, which is
 * what the form below does, and the id it returns is one an advertisement
 * accepts.
 *
 * Three things about that are stated in the UI rather than left to be
 * discovered:
 *
 * - **it is published, not saved here.** The predecessor of this control
 *   wrote to `localStorage` under a footnote claiming it had been "shared in
 *   the registry"; the counterparty on another node saw an advertisement
 *   naming something nothing could resolve.
 * - **only you can select it.** A definition is globally readable and
 *   merchant-scoped, so nobody else can put it on their ad, and everyone can
 *   resolve it when they read yours.
 * - **there is no edit and no delete.** The id is a digest of the
 *   definition, so a corrected name is a *different* rail and the ads that
 *   chose the old one still point at the old one. An edit button here would
 *   fork it silently, which is why there is none.
 *
 * # A node that cannot be reached says so
 *
 * There is deliberately no built-in list to fall back on. An empty dropdown
 * would tell a merchant the network supports no payment methods, which is a
 * claim about the network made out of a failed request.
 */
export function MethodPicker({
  selected,
  onChange,
  country,
  merchant = null,
  max = MAX_PAYMENT_METHODS,
}: {
  /** Catalogue ids, not display names. */
  selected: string[];
  onChange: (methodIds: string[]) => void;
  /** ISO country code whose rails to suggest first, or `null` for all of them. */
  country: string | null;
  /** The connected merchant's peer id, so the node can surface their own definitions. */
  merchant?: string | null;
  max?: number;
}) {
  const t = useTranslations("ads");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const state = useCountryPaymentMethods(country, merchant, reloadToken);

  const catalogue = useMemo(
    () => (state.status === "ready" ? groupedMethods(state.data) : []),
    [state],
  );
  const names = useMemo(
    () => new Map(catalogue.map((entry) => [entry.method.id, entry.method.name])),
    [catalogue],
  );

  // Close on outside pointer-down, and on Escape — the panel is absolutely
  // positioned and covers the wizard's Continue button while it is open.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  const full = selected.length >= max;

  const suggestions = useMemo(
    () =>
      searchGrouped(catalogue, query)
        .filter((entry) => !selected.includes(entry.method.id))
        .slice(0, 8),
    [catalogue, query, selected],
  );

  const add = useCallback(
    (id: string) => {
      if (selected.length >= max || selected.includes(id)) return;
      onChange([...selected, id]);
      setQuery("");
      // Closed on selection. Left open, the panel sits on top of whatever
      // follows it on the page — in the ad wizard, the Continue button — and
      // a merchant who has just chosen a rail cannot reach it.
      setOpen(false);
    },
    [max, onChange, selected],
  );

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Enter" || suggestions.length === 0) return;
    e.preventDefault();
    add(suggestions[0]!.method.id);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {selected.map((id) => (
          <span
            key={id}
            className="flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs text-gray-200"
            title={id}
          >
            {/* The node's name for the id, or the id itself while the
                catalogue is still loading. Unhelpful and true beats helpful
                and invented. */}
            {methodLabel(id, names)}
            {/* A rail nobody but this merchant defined, marked as such —
                the client contract's rule 3. Without it a merchant-defined
                name sits in the same row as a compiled-in one and reads as
                though the network vouches for it. */}
            {!id.startsWith("builtin:") && (
              <span className="text-[10px] uppercase tracking-wide text-brand/70">{t("mpYours")}</span>
            )}
            <button
              type="button"
              onClick={() => onChange(selected.filter((x) => x !== id))}
              aria-label={t("mpRemove", { name: methodLabel(id, names) })}
              className="text-gray-500 hover:text-white"
            >
              ✕
            </button>
          </span>
        ))}
        {selected.length === 0 && (
          <p className="text-xs text-gray-600">{t("mpNoneSelected")}</p>
        )}
        <span className="ml-auto text-[11px] tabular-nums text-gray-600">
          {t("mpCountOfMax", { count: selected.length, max })}
        </span>
      </div>

      <div className="relative mt-3" ref={rootRef}>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          disabled={full}
          aria-label={t("mpSearchAria")}
          placeholder={full ? t("mpFullPlaceholder") : t("mpSearchPlaceholder")}
          className="w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm text-white outline-none placeholder:text-gray-600 focus:border-brand/50 disabled:cursor-not-allowed disabled:opacity-50"
        />
        {open && !full && (
          <ul className="absolute z-30 mt-1 max-h-72 w-full divide-y divide-white/5 overflow-y-auto rounded-md border border-white/15 bg-[#10151d] shadow-xl">
            {state.status === "loading" && (
              <li className="px-3 py-2 text-sm text-gray-500">{t("mpAskingNode")}</li>
            )}
            {/* Named as a failure to reach the node, never as an absence of
                methods. The difference decides what a merchant does next. */}
            {state.status === "error" && (
              <li className="px-3 py-2 text-sm">
                <span className="text-amber-400">{t("mpLoadError")}</span>{" "}
                <button
                  type="button"
                  onClick={state.retry}
                  className="text-brand underline underline-offset-2 hover:text-white"
                >
                  {t("mpTryAgain")}
                </button>
                <span className="mt-1 block text-[11px] text-gray-600">
                  {t("mpLoadErrorSub")}
                </span>
              </li>
            )}
            {state.status === "ready" && suggestions.length === 0 && (
              <li className="px-3 py-2 text-sm text-gray-500">
                {query.trim() ? t("mpNoMatch", { query: query.trim() }) : t("mpNoMethods")}
              </li>
            )}
            {suggestions.map((entry, i) => {
              const previous = suggestions[i - 1];
              const heading = previous?.group !== entry.group ? t(`mpGroup.${entry.group}`) : null;
              return (
                <li key={entry.method.id}>
                  {heading && (
                    <p className="bg-white/[0.03] px-3 py-1 text-[10px] uppercase tracking-wide text-gray-500">
                      {heading}
                      {entry.group === "suggested" && country ? ` · ${country}` : ""}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => add(entry.method.id)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-white/[0.04]"
                  >
                    {entry.method.name}
                    <span className="ml-auto text-[10px] text-gray-600">
                      {t(`mpCategory.${entry.method.category}.label`)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <DefineYourOwnRail
        merchant={merchant}
        disabled={full}
        onDefined={(id) => {
          // Re-ask first, so the row the picker draws is the node's answer
          // and not this component's memory of what it just sent.
          setReloadToken((n) => n + 1);
          add(id);
        }}
      />
    </div>
  );
}

/**
 * Publish a rail this build has never heard of, and select it.
 *
 * Only offered to the wallet that owns the advertisement being written: a
 * definition is selectable by its author alone, so publishing one under a
 * different wallet than the ad's would produce a rail the ad cannot carry.
 * When the two do not match — no wallet connected, or a wallet without
 * message signing — this says which, rather than showing a button that
 * fails.
 */
function DefineYourOwnRail({
  merchant,
  disabled,
  onDefined,
}: {
  merchant: string | null;
  disabled: boolean;
  onDefined: (id: string) => void;
}) {
  const t = useTranslations("ads");
  const R = useTranslations("refusals");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<PaymentMethodCategory>("BankTransfer");
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signer, setSigner] = useState<{ provider: SolanaProvider; publicKey: Uint8Array } | null>(
    null,
  );

  useEffect(() => {
    const read = () => {
      const connection = readWalletConnection();
      const provider = currentSigner(connection);
      if (!connection || !provider?.signMessage) {
        setSigner(null);
        return;
      }
      try {
        setSigner({ provider, publicKey: bs58.decode(connection.address) });
      } catch {
        setSigner(null);
      }
    };
    read();
    window.addEventListener(WALLET_CHANGED_EVENT, read);
    return () => window.removeEventListener(WALLET_CHANGED_EVENT, read);
  }, []);

  // The connected wallet has to be the merchant this ad belongs to, or the
  // definition it signs is one the ad may not name.
  const mine = signer !== null && merchant !== null && peerIdForPublicKey(signer.publicKey) === merchant;
  const problem = name.trim().length > 0 ? nameProblem(name) : null;

  async function publish() {
    if (!signer || problem) return;
    setPublishing(true);
    setError(null);
    try {
      const id = await defineMerchantMethod(
        nodeUrl(),
        signer.provider,
        signer.publicKey,
        name,
        category,
      );
      setOpen(false);
      setName("");
      onDefined(id);
    } catch (e: unknown) {
      setError(explainDefineRefusal(R, e instanceof Error ? e.message : String(e)));
    } finally {
      setPublishing(false);
    }
  }

  if (!open) {
    return (
      <div className="mt-1.5">
        <p className="text-[11px] leading-relaxed text-gray-600">
          {t("mpDefineIntro")}{" "}
          {mine ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              disabled={disabled}
              className="text-brand underline underline-offset-2 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("mpDefineOwn")}
            </button>
          ) : (
            /* Named as a missing signer, not as a missing feature. A
               merchant told "not available" goes looking for a setting. */
            <span className="text-gray-500">
              {t("mpConnectToDefine")}
            </span>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-md border border-white/10 bg-white/[0.02] p-3">
      <p className="text-xs font-medium text-gray-200">{t("mpDefineTitle")}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
        {t("mpDefineNote")}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-gray-500" htmlFor="define-rail-name">
            {t("mpName")}
          </label>
          <input
            id="define-rail-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_METHOD_NAME_CHARS * 2}
            placeholder={t("mpNamePlaceholder")}
            className="w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm text-white outline-none placeholder:text-gray-600 focus:border-brand/50"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500" htmlFor="define-rail-category">
            {t("mpKind")}
          </label>
          <select
            id="define-rail-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as PaymentMethodCategory)}
            className="w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm text-white outline-none focus:border-brand/50 [&>option]:bg-[#10151d]"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`mpCategory.${c}.label`)}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-gray-600">
            {t("mpKindNote", { hint: t(`mpCategory.${category}.hint`) })}
          </p>
        </div>
      </div>

      {problem && <p className="mt-2 text-xs text-amber-300">{problem}</p>}
      {error && <p className="mt-2 text-xs text-amber-300">{error}</p>}

      {/* The one thing a merchant cannot find out by trying: there is no
          way back from this. Said before the button, not after. */}
      <p className="mt-3 text-[11px] leading-relaxed text-gray-600">
        {t.rich("mpImmutable", { em: (chunks) => <em>{chunks}</em> })}
      </p>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void publish()}
          disabled={publishing || name.trim().length === 0 || problem !== null}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {publishing ? t("mpWaitingWallet") : t("mpPublishSelect")}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="text-sm text-gray-500 hover:text-gray-300"
        >
          {t("mpCancel")}
        </button>
      </div>
    </div>
  );
}
