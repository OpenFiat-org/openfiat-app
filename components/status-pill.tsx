/** Small colored status badge used across trades, disputes, ads, nodes, proposals. */

function toneFor(status: string): string {
  switch (status) {
    case "Completed":
    case "Approved":
    case "Verified":
    case "Online":
    case "Executed":
    case "Escrow Released":
    case "Live":
    case "Done":
      return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
    case "Escrow Locked":
    case "Passed":
    case "Investigation":
      return "border-brand/40 bg-brand/10 text-brand-hover";
    case "Awaiting Payment":
    case "Payment Submitted":
    case "Merchant Reviewing":
    case "Pending":
    case "Active":
    case "Evidence Submitted":
    case "Decision":
    case "Busy":
    case "Syncing":
    case "Degraded":
      return "border-amber-400/30 bg-amber-400/10 text-amber-300";
    case "Disputed":
    case "Rejected":
    case "Offline":
      return "border-red-400/30 bg-red-400/10 text-red-300";
    case "Cancelled":
    case "Expired":
    case "Paused":
    case "Closed":
    case "Vacation":
    case "Away":
    case "Not started":
      return "border-white/15 bg-white/5 text-gray-400";
    default:
      return "border-white/15 bg-white/5 text-gray-300";
  }
}

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${toneFor(status)}`}
    >
      {status}
    </span>
  );
}
