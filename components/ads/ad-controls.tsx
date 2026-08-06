"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { MethodPicker } from "@/components/ads/method-picker";
import { tradingSymbol } from "@/lib/asset-display";
import { formatNumber } from "@/lib/format";
import type { LiveAd } from "@/lib/live-advertisements";
import {
  explainRefusal,
  setAdvertisementStatus,
  updateAdvertisementTerms,
  type AdvertisementStatus,
  type MerchantIdentity,
} from "@/lib/merchant-ads";

/**
 * The controls that make the merchant console a console.
 *
 * It listed advertisements and could change none of them. The status cell
 * admitted as much — "read-only … pausing an advertisement for real is a
 * signed event, which the node's RPC surface does not yet expose". It does
 * now, so these do the thing the old control's tooltip said it was
 * simulating.
 *
 * Each action costs one wallet signature and nothing else: there is no
 * session, no server-side merchant account, and no state here that
 * outlives the node's answer.
 */

/** What a merchant may move an advertisement to, from where it is now. */
function transitionsFrom(status: LiveAd["status"]): AdvertisementStatus[] {
  switch (status) {
    case "Active":
      // No "Disabled" offered. §18 uses it for *automatic* takedowns —
      // liquidity exhausted, permissions lost — and a merchant choosing it
      // by hand would be filing their own deliberate pause under the
      // status that means something went wrong.
      return ["Vacation", "Deleted"];
    case "Vacation":
    case "Disabled":
      return ["Active", "Deleted"];
    case "Deleted":
      // §21 is permanent. The node refuses anything else, and offering a
      // control that always fails is worse than offering none.
      return [];
  }
}

export function AdStatusControl({
  ad,
  who,
  onDone,
}: {
  ad: LiveAd;
  who: MerchantIdentity | null;
  onDone: () => void;
}) {
  const t = useTranslations("ads");
  const R = useTranslations("refusals");
  const [pending, setPending] = useState<AdvertisementStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const options = transitionsFrom(ad.status);

  async function move(status: AdvertisementStatus) {
    if (!who) return;
    // Deletion is the one action with no way back — §21 keeps the record
    // and retires the id, so a mis-click cannot be undone by re-publishing
    // under the same one.
    if (status === "Deleted" && !confirm(t("confirmDelete", { id: ad.id }))) return;
    setPending(status);
    setError(null);
    try {
      await setAdvertisementStatus(who, ad.id, status);
      onDone();
    } catch (err) {
      setError(explainRefusal(R, err));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <span
        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
          ad.status === "Active"
            ? "bg-emerald-500/10 text-emerald-300"
            : ad.status === "Deleted"
              ? "bg-red-500/10 text-red-300/80"
              : "bg-gray-500/10 text-gray-400"
        }`}
      >
        {t(`status.${ad.status}`)}
      </span>
      {options.length > 0 && (
        <span className="flex gap-1.5">
          {options.map((status) => (
            <button
              key={status}
              type="button"
              disabled={!who || pending !== null}
              onClick={() => void move(status)}
              className={`rounded border px-2 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-40 ${
                status === "Deleted"
                  ? "border-red-500/30 text-red-300/80 hover:bg-red-500/10"
                  : "border-white/15 text-gray-300 hover:bg-white/5"
              }`}
            >
              {pending === status ? t("signing") : t(`action.${status}`)}
            </button>
          ))}
        </span>
      )}
      {error && <span className="max-w-[16rem] text-right text-[11px] text-red-300">{error}</span>}
    </div>
  );
}

/**
 * Trade limits and payment methods, changed in place.
 *
 * Whole values every time, because that is what the node stores — this is
 * not a patch, and leaving `payment_methods` out would clear them. The
 * form is therefore seeded from the advertisement as it stands, and a
 * merchant who changes one field re-publishes the other unchanged.
 *
 * The price is not here. It is a separate signed event because it changes
 * far more often, and putting the two on one form would mean every reprice
 * restated the limits — so a stale tab could roll them back.
 */
export function AdTermsDialog({
  ad,
  who,
  onClose,
  onSaved,
}: {
  ad: LiveAd;
  who: MerchantIdentity | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("ads");
  const R = useTranslations("refusals");
  const [min, setMin] = useState(String(ad.minTrade));
  const [max, setMax] = useState(String(ad.maxTrade));
  const [methods, setMethods] = useState<string[]>(ad.paymentMethods);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const minNum = Number(min);
  const maxNum = Number(max);
  // The node's own rule, checked here so the merchant is told before a
  // wallet prompt rather than after one: terms nobody can trade against
  // are refused, and a floor above a ceiling matches nothing.
  const problems = [
    ...(minNum > 0 ? [] : ["probMinZero"]),
    ...(maxNum >= minNum ? [] : ["probMaxMin"]),
    ...(methods.length > 0 ? [] : ["probMethods"]),
  ];

  async function save() {
    if (!who || problems.length > 0) return;
    setSaving(true);
    setError(null);
    try {
      await updateAdvertisementTerms(who, ad.id, {
        minTrade: minNum,
        maxTrade: maxNum,
        paymentMethods: methods,
        // The advertisement's own precision, never a fresh guess — see
        // `LiveAd.assetDecimals`.
        decimals: ad.assetDecimals,
      });
      onSaved();
    } catch (err) {
      setError(explainRefusal(R, err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={t("dialogAria")}
        className="w-full max-w-lg rounded-md border border-white/15 bg-[#10151d] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-white/10 px-5 py-4">
          <h2 className="text-base font-semibold text-white">{t("editTermsTitle")}</h2>
          <p className="mt-0.5 font-mono text-xs text-gray-500">{ad.id}</p>
        </div>

        <div className="space-y-5 px-5 py-5">
          {/* One column on a phone. Two number fields sharing 375px leave
              each about 150px wide, and a trade limit typed into a box
              narrower than the number it holds is a field you cannot check
              before signing. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[
              { label: t("minTrade"), value: min, set: setMin },
              { label: t("maxTrade"), value: max, set: setMax },
            ].map((field) => (
              <label key={field.label} className="block">
                <span className="text-xs font-medium text-gray-300">{field.label}</span>
                <input
                  inputMode="decimal"
                  value={field.value}
                  onChange={(e) => field.set(e.target.value)}
                  className="mt-1.5 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 font-mono text-sm text-white outline-none focus:border-brand"
                />
              </label>
            ))}
          </div>
          {/*
            * Named, not implied. These are denominated in the asset and not
            * in the fiat currency, and at a rate near 129 a limit of "50"
            * reads as plausible either way — nothing on screen catches the
            * wrong one. See `LiveAd.minTrade`.
            */}
          <p className="-mt-2 text-[11px] text-gray-500">
            {t("inAsset", {
              asset: tradingSymbol(ad.assetMint, ad.assetSymbol) ?? t("theAdvertisedToken"),
              fiat: ad.fiatCurrency,
              range: `${formatNumber(ad.minTrade)}–${formatNumber(ad.maxTrade)}`,
            })}
          </p>

          <div>
            <span className="text-xs font-medium text-gray-300">{t("paymentMethods")}</span>
            <div className="mt-1.5">
              {/* No country here: an advertisement carries a currency and
                  no country, and this dialog is editing one that already
                  exists. The merchant's own peer id is passed instead, so
                  the node puts the rails they already advertise at the top —
                  which is what somebody re-terming an ad is most likely to
                  reach for. */}
              <MethodPicker
                selected={methods}
                onChange={setMethods}
                country={null}
                merchant={ad.merchantPeerId}
              />
            </div>
          </div>

          {problems.length > 0 && (
            <ul className="space-y-1 text-xs text-amber-300">
              {problems.map((p) => (
                <li key={p}>{t(p)}</li>
              ))}
            </ul>
          )}
          {error && <p className="text-xs text-red-300">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-white/15 px-3 py-1.5 text-sm text-gray-300 hover:bg-white/5"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            disabled={!who || saving || problems.length > 0}
            onClick={() => void save()}
            className="rounded-md bg-brand px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-40"
          >
            {saving ? t("signing") : t("signPublish")}
          </button>
        </div>
      </div>
    </div>
  );
}
