/** Numbered step rows — flat, divider-separated, site idiom. */
export function StepList({ steps }: { steps: Array<[string, string]> }) {
  return (
    <ol className="divide-y divide-white/5 border-y border-white/5">
      {steps.map(([title, desc], i) => (
        <li key={title} className="flex items-start gap-4 py-4">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-brand/40 text-sm font-semibold text-brand-hover">
            {i + 1}
          </span>
          <div>
            <p className="text-sm font-medium text-white">{title}</p>
            <p className="mt-0.5 text-sm text-gray-400">{desc}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
