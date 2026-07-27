/** Slim inline metrics strip — label-over-value pairs with vertical dividers, no boxes. */
export function MetricStrip({
  items,
}: {
  items: Array<{ label: string; value: string; sub?: string }>;
}) {
  return (
    /*
     * One row, scrolling if it has to. Wrapping stranded the last metric on a
     * line of its own, which read as a second unrelated group rather than the
     * tail of the same strip — and with eight figures that happened at any
     * ordinary desktop width.
     */
    <div className="scrollbar-dark flex items-stretch gap-y-4 overflow-x-auto pb-1">
      {items.map((m, i) => (
        <div
          key={m.label}
          className={`shrink-0 pr-6 ${i > 0 ? "border-l border-white/10 pl-6" : ""}`}
        >
          <p className="text-xs text-gray-500">{m.label}</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-white">{m.value}</p>
          {m.sub && <p className="text-[11px] text-gray-600">{m.sub}</p>}
        </div>
      ))}
    </div>
  );
}
