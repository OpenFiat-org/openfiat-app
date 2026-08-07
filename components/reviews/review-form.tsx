"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { formatDateMs } from "@/lib/format";
import { MY_REVIEWS, myReviewOf, myReviews, type MyReview } from "@/lib/live-reviews";
import {
  MAX_COMMENT_CHARS,
  commentProblem,
  explainReviewRefusal,
  publishReview,
} from "@/lib/review-flow";
import { shortPeerId } from "@/lib/peer-id";
import { tradeIdentity } from "@/lib/trade-flow";
import { currentSigner, type WalletConnection } from "@/lib/wallet-connection";
import { useSignedRead } from "@/components/use-signed-read";
import { Stars } from "@/components/reviews/stars";

/**
 * Writing the one review a party is entitled to write, on a trade that
 * actually settled.
 *
 * # Why it needs a signed read before it can offer anything
 *
 * "Have I already reviewed this trade?" is answerable only by
 * `getMyReviews`. The public feed a merchant profile shows carries no
 * author and no settlement id — deliberately, because both parties may
 * review the same trade and either field would pair two rows back into the
 * counterparty edge the protocol withholds. So there is no way to match a
 * public row to one of your own trades, and a component that tried would
 * be inventing the match.
 *
 * Nothing is read on mount: the read costs a wallet signature, and a
 * prompt nobody asked for teaches people to approve prompts without
 * reading them. Until it is taken, this says what it does not know rather
 * than guessing.
 *
 * # It says, out loud, that this moves no score
 *
 * `openfiat-reputation` does not depend on `openfiat-reviews` and never
 * reads one. Presenting a review as though it nudged a counter would be
 * the one claim on this panel a reader cannot check for themselves.
 */
export function ReviewForm({
  settlementId,
  counterparty,
  myPeerId,
  wallet,
  settled,
  isParty,
}: {
  settlementId: string;
  /** The other party's PeerId, for "who this is about". */
  counterparty: string | null;
  myPeerId: string | null;
  wallet: WalletConnection | null;
  /**
   * Whether the trade got far enough to be reviewable — `Approved` or
   * `Completed`, matching `openfiat_reviews::is_settled`. Both, because a
   * gossip-only node may hold at `Approved` a trade an RPC-connected node
   * holds at `Completed`, and a rule that differed per node would not be
   * one.
   */
  settled: boolean;
  /**
   * Whether this wallet is one of the two people in the trade, or `null`
   * when that has not been established — the caller has to prove which
   * trades are its own before anyone can say.
   *
   * `null` is not "no". A form offered on a `null` is offered to somebody
   * who may well be entitled, and the node settles it; a form hidden on a
   * `null` would tell a party they cannot review their own trade because
   * they had not signed for an unrelated read.
   */
  isParty: boolean | null;
}) {
  const t = useTranslations("reviews");
  const R = useTranslations("refusals");
  const { status, data, error, read, forget } = useSignedRead<MyReview[]>(myReviews, MY_REVIEWS);
  const existing = myReviewOf(data, settlementId, myPeerId);

  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);

  // An existing review seeds the form, so "change it" starts from what was
  // actually published rather than from a blank five stars.
  useEffect(() => {
    if (existing) {
      setStars(existing.stars);
      setComment(existing.comment);
    }
  }, [existing]);

  if (!settled) {
    return (
      <p className="px-4 py-3 text-xs leading-relaxed text-gray-500">
        {t("notSettled")}
      </p>
    );
  }

  if (status === "no-wallet") {
    return (
      <p className="px-4 py-3 text-xs leading-relaxed text-gray-500">
        {t("connectPrompt")}
      </p>
    );
  }

  if (isParty === false) {
    return (
      <p className="px-4 py-3 text-xs leading-relaxed text-gray-500">
        {t("notParty")}
      </p>
    );
  }

  const problem = commentProblem(comment);

  async function submit() {
    const signer = currentSigner(wallet);
    if (!wallet || !signer) {
      setNote({ text: t("signerError"), bad: true });
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      await publishReview(tradeIdentity(signer, wallet.address), settlementId, stars, comment.trim());
      // Re-read rather than patching local state: the node decides which of
      // two competing records stands, and showing the one we sent would show
      // a review the network may not hold.
      forget();
      read();
      setEditing(false);
      setNote({ text: t("published"), bad: false });
    } catch (err) {
      setNote({
        text: explainReviewRefusal(R, err),
        bad: true,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 px-4 py-3">
      {status === "failed" && <p className="text-xs text-red-300">{error}</p>}

      {data === null ? (
        <>
          <p className="text-xs leading-relaxed text-gray-500">
            {t("checkPrompt")}
          </p>
          <button
            type="button"
            onClick={read}
            disabled={status === "loading"}
            className="rounded-md border border-white/15 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-white/5 disabled:opacity-50"
          >
            {status === "loading" ? t("waitingWallet") : t("checkMyReviews")}
          </button>
        </>
      ) : existing && !editing ? (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <Stars stars={existing.stars} />
            <span className="text-xs text-gray-600">{formatDateMs(existing.createdAt)}</span>
          </div>
          {existing.comment.trim().length > 0 && (
            <p className="text-sm leading-relaxed text-gray-300">{existing.comment}</p>
          )}
          <p className="text-xs leading-relaxed text-gray-600">
            {t("publishedAbout", { who: counterparty ? shortPeerId(counterparty) : t("theirCounterparty") })}
          </p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md border border-white/15 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-white/5"
          >
            {t("replaceIt")}
          </button>
        </>
      ) : (
        <>
          <fieldset>
            <legend className="text-xs text-gray-500">
              {t("howWasTrade", {
                suffix: counterparty ? t("withName", { name: shortPeerId(counterparty) }) : "",
              })}
            </legend>
            <div className="mt-1.5 flex gap-1">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStars(value)}
                  aria-pressed={stars === value}
                  aria-label={t("starsAria", { value })}
                  className={`px-1 text-xl leading-none ${
                    value <= stars ? "text-amber-300" : "text-gray-700"
                  } hover:text-amber-200`}
                >
                  ★
                </button>
              ))}
            </div>
          </fieldset>

          <label className="block">
            <span className="block text-xs text-gray-500">{t("inOwnWords")}</span>
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              rows={3}
              maxLength={MAX_COMMENT_CHARS * 2}
              className="mt-1 w-full rounded-md border border-white/10 bg-[#0a0e14]/70 px-3 py-2 text-sm text-white outline-none focus:border-brand/50"
            />
            <span className="mt-1 block text-xs leading-relaxed text-gray-500">
              {t("commentNote", { count: [...comment].length, max: MAX_COMMENT_CHARS })}
            </span>
          </label>

          {problem && <p className="text-xs text-amber-300">{t(`commentProblem.${problem.key}`, problem.values)}</p>}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy || problem !== null}
              className="rounded-md bg-brand px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-brand/40"
            >
              {busy ? t("signing") : existing ? t("replaceMyReview") : t("publishReview")}
            </button>
            {existing && (
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-md border border-white/15 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-white/5"
              >
                {t("cancel")}
              </button>
            )}
          </div>
        </>
      )}

      {note && (
        <p className={`text-xs leading-relaxed ${note.bad ? "text-red-300" : "text-emerald-300"}`}>
          {note.text}
        </p>
      )}

      <p className="border-t border-white/5 pt-3 text-xs leading-relaxed text-gray-600">
        {t("footerNote")}
      </p>
    </div>
  );
}
