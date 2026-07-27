import type { ReactNode } from "react";

/**
 * Exchange-style flat table: no containing box — minimal uppercase header on a
 * hairline, rows separated by `divide-y` dividers with a subtle hover tint.
 * Numeric cells use <Td right num> for right-aligned tabular figures.
 */
export function DataTable({
  head,
  children,
  minWidth = 720,
}: {
  head: ReactNode;
  children: ReactNode;
  minWidth?: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" style={{ minWidth }}>
        <thead className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-gray-500">
          {head}
        </thead>
        <tbody className="divide-y divide-white/5">{children}</tbody>
      </table>
    </div>
  );
}

export function Th({
  children,
  right,
  className = "",
}: {
  children?: ReactNode;
  right?: boolean;
  className?: string;
}) {
  return (
    <th className={`px-4 py-3 font-medium ${right ? "text-right" : ""} ${className}`}>
      {children}
    </th>
  );
}

export function Tr({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <tr className={`hover:bg-white/[0.03] ${className}`}>{children}</tr>;
}

export function Td({
  children,
  right,
  num,
  py = "py-4",
  className = "",
}: {
  children?: ReactNode;
  right?: boolean;
  num?: boolean;
  /** Vertical padding utility — override for airier rows (e.g. "py-6"). */
  py?: string;
  className?: string;
}) {
  return (
    <td
      className={`px-4 ${py} ${right ? "text-right" : ""} ${
        num ? "whitespace-nowrap font-mono tabular-nums" : ""
      } ${className}`}
    >
      {children}
    </td>
  );
}
