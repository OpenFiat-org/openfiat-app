import type { ReactNode } from "react";

/**
 * The single containing panel allowed per page section: a hairline-bordered
 * region with an optional header strip. Rows inside use `divide-y divide-white/5`.
 */
export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-md border border-white/10 ${className}`}>
      {title !== undefined && (
        <header className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">{title}</h2>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
