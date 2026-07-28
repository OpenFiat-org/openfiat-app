import { RESERVATION_STEPS } from "@/lib/types";

/**
 * The reservation phase, compressed to one line above the settlement
 * stepper (OFS-2200 §18). Always fully complete by the time a trade room
 * exists — see the constant's own comment for why it's still drawn.
 *
 * Deliberately not a second vertical stepper: it would visually compete
 * with the settlement stepper below it for a phase that has, by
 * construction, nothing left to explain — every step here already happened.
 */
export function ReservationSteps() {
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 border-t border-white/5 px-1 py-3 text-xs text-gray-500">
      <span className="mr-1 shrink-0 text-[11px] font-medium uppercase tracking-wide text-gray-600">
        Reservation
      </span>
      {RESERVATION_STEPS.map((step, i) => (
        <span key={step} className="flex items-center gap-1.5">
          {i > 0 && <span aria-hidden className="text-gray-700">→</span>}
          <span className="inline-flex items-center gap-1 text-emerald-300/90">
            <span aria-hidden>✓</span>
            {step}
          </span>
        </span>
      ))}
      <span aria-hidden className="ml-1 text-gray-700">→</span>
      <span className="text-gray-500">Settlement begins below</span>
    </div>
  );
}
