import { useTranslations } from "next-intl";
import { SETTLEMENT_STEPS, type SettlementStatus } from "@/lib/types";

/**
 * The settlement lifecycle, spelled out.
 *
 * It was seven numbered circles with only the current one labelled, which meant
 * a reader could see they were at step 2 of 7 and had no way to learn what 3
 * through 7 were, what had just happened, or who was holding things up. Numbers
 * without names are a progress bar pretending to be an explanation.
 *
 * So: every stage is named, always, and each says who acts on it. "Waiting" is
 * the state people are actually anxious about, and the useful information at
 * that moment is which side is being waited on — the protocol, you, or the
 * person you are trading with.
 *
 * Vertical rather than horizontal, because seven labels do not fit across a
 * column without truncating to the point of uselessness, and because it matches
 * the dispute timeline for a reader who has seen both.
 */

type Actor = "you" | "counterparty" | "protocol";

/** Who each stage is waiting on. The prose lives in the `settlementSteps`
 *  message namespace, keyed by the space-stripped stage name. */
const STAGE_ACTOR: Record<string, Actor> = {
  "Escrow Locked": "protocol",
  "Awaiting Payment": "you",
  "Payment Submitted": "counterparty",
  "Merchant Reviewing": "counterparty",
  Approved: "protocol",
  "Escrow Released": "protocol",
  Completed: "protocol",
};

/** The space-stripped stage name, used as a message key: "Escrow Locked" → "EscrowLocked". */
const slug = (s: string) => s.replace(/ /g, "");

export function SettlementSteps({
  status,
  counterpartyName,
  buy,
  terminal,
}: {
  status: SettlementStatus;
  counterpartyName: string;
  /** True when the current user is the buyer. */
  buy: boolean;
  /** Rejected, Cancelled or Disputed — the happy path stopped. */
  terminal: boolean;
}) {
  const t = useTranslations("settlementSteps");
  const L = useTranslations("lifecycle");
  const stepIndex = SETTLEMENT_STEPS.indexOf(status);
  const complete = status === "Completed";

  /** Whose turn it is, in words rather than a colour. */
  const actorLabel = (actor: Actor): string => {
    if (actor === "protocol") return t("automatic");
    const waiting = t("waitingOn", { name: counterpartyName });
    if (actor === "you") return buy ? t("yourTurn") : waiting;
    return buy ? waiting : t("yourTurn");
  };

  return (
    <ol className="mt-5 divide-y divide-white/5 border-t border-white/5">
      {SETTLEMENT_STEPS.map((step, i) => {
        const done = complete || i < stepIndex;
        const current = !complete && !terminal && i === stepIndex;
        const actor = STAGE_ACTOR[step];
        const body = t(`${slug(step)}.${buy ? "buyer" : "seller"}`);

        return (
          <li
            key={step}
            className={`flex gap-3 px-1 py-3 ${current ? "bg-brand/[0.04]" : ""}`}
          >
            <span
              aria-hidden
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold ${
                done
                  ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-300"
                  : current
                    ? "border-brand bg-brand/20 text-brand-hover"
                    : "border-white/15 text-gray-600"
              }`}
            >
              {done ? "✓" : i + 1}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2.5">
                <span
                  className={`text-sm ${
                    current ? "font-semibold text-white" : done ? "text-gray-300" : "text-gray-600"
                  }`}
                >
                  {L(slug(step))}
                </span>
                {current && (
                  <span className="rounded-full border border-brand/40 px-1.5 text-[10px] uppercase tracking-wide text-brand-hover">
                    {actorLabel(actor)}
                  </span>
                )}
                {!current && !done && (
                  <span className="text-[11px] text-gray-600">
                    {actorLabel(actor)}
                  </span>
                )}
              </div>
              {/* Upcoming stages keep their explanation. Not knowing what comes
                  next is the thing that makes a stalled trade feel unsafe. */}
              <p
                className={`mt-0.5 text-xs leading-relaxed ${
                  current ? "text-gray-300" : "text-gray-500"
                }`}
              >
                {body}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
