/** Slim inline metrics strip — label-over-value pairs with vertical dividers, no boxes. */
export function MetricStrip({
  items,
}: {
  items: Array<{ label: string; value: string; sub?: string }>;
}) {
  return (
    <div className="flex flex-wrap items-stretch gap-y-4">
      {items.map((m, i) => (
        <div key={m.label} className={`pr-8 ${i > 0 ? "border-l border-white/10 pl-8" : ""}`}>
          <p className="text-xs text-gray-500">{m.label}</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-white">{m.value}</p>
          {m.sub && <p className="text-[11px] text-gray-600">{m.sub}</p>}
        </div>
      ))}
    </div>
  );
}
