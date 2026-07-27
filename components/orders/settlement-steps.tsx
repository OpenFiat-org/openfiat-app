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

interface StageMeta {
  /** Who the stage is waiting on. */
  actor: Actor;
  /** What happens, from the perspective of the side being described. */
  buyer: string;
  seller: string;
}

const STAGE: Record<string, StageMeta> = {
  "Escrow Locked": {
    actor: "protocol",
    buyer: "The Solana program locked the crypto. It cannot move until this trade resolves.",
    seller: "Your crypto is locked in the Solana program, so the buyer can see it is really there.",
  },
  "Awaiting Payment": {
    actor: "you",
    buyer: "Send the fiat using the details below, then mark it paid and attach your receipt.",
    seller: "The buyer sends the fiat. Nothing for you to do until they mark it paid.",
  },
  "Payment Submitted": {
    actor: "counterparty",
    buyer: "You have declared payment. The merchant now checks their own account.",
    seller: "The buyer says they have paid. Check your own account — a screenshot is not a payment.",
  },
  "Merchant Reviewing": {
    actor: "counterparty",
    buyer: "The merchant is verifying the money arrived. If they do not respond, you can open a dispute.",
    seller: "Confirm the money arrived, or reject if it did not.",
  },
  Approved: {
    actor: "protocol",
    buyer: "Receipt confirmed. Release is next and happens automatically.",
    seller: "You confirmed receipt. The program takes it from here.",
  },
  "Escrow Released": {
    actor: "protocol",
    buyer: "The program sent the crypto to your wallet.",
    seller: "The program sent the crypto to the buyer.",
  },
  Completed: {
    actor: "protocol",
    buyer: "Done. Both reputations have been updated.",
    seller: "Done. Both reputations have been updated.",
  },
};

/** Whose turn it is, in words rather than a colour. */
function actorLabel(actor: Actor, counterpartyName: string, buy: boolean): string {
  if (actor === "protocol") return "Automatic";
  if (actor === "you") return buy ? "Your turn" : `Waiting on ${counterpartyName}`;
  return buy ? `Waiting on ${counterpartyName}` : "Your turn";
}

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
  const stepIndex = SETTLEMENT_STEPS.indexOf(status);
  const complete = status === "Completed";

  return (
    <ol className="mt-5 divide-y divide-white/5 border-t border-white/5">
      {SETTLEMENT_STEPS.map((step, i) => {
        const done = complete || i < stepIndex;
        const current = !complete && !terminal && i === stepIndex;
        const meta = STAGE[step];
        const body = buy ? meta.buyer : meta.seller;

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
                  {step}
                </span>
                {current && (
                  <span className="rounded-full border border-brand/40 px-1.5 text-[10px] uppercase tracking-wide text-brand-hover">
                    {actorLabel(meta.actor, counterpartyName, buy)}
                  </span>
                )}
                {!current && !done && (
                  <span className="text-[11px] text-gray-600">
                    {actorLabel(meta.actor, counterpartyName, buy)}
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
