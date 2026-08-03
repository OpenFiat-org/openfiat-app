"use client";

import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";

/**
 * Exchange-style flat table: no containing box — minimal uppercase header on a
 * hairline, rows separated by `divide-y` dividers with a subtle hover tint.
 * Numeric cells use <Td right num> for right-aligned tabular figures.
 *
 * # Below `lg` it is not a table at all
 *
 * The whole responsive story here used to be `overflow-x-auto`, which is not
 * a mobile treatment — it is a table that has been made to fit by moving the
 * problem sideways. On a 375px phone a `minWidth={960}` table shows about a
 * third of a row at a time, and the columns a reader most needs are the ones
 * furthest right: the balance, the price, the action. Every one of those
 * required a horizontal scroll inside a vertically scrolling page, on a
 * surface with no scrollbar to say the rest existed.
 *
 * So under `lg` each row becomes a card: `display: block` down the tree, the
 * header hidden, and every cell rendered as a label/value line. `lg` and not
 * `md` because the widest table here asks for 960px, and stacking has to stop
 * where the widest one stops needing to scroll — otherwise the sideways
 * scroll simply reappears between the two breakpoints, which is the bug with
 * a narrower window.
 *
 * # Where the labels come from, and why this file is a client component
 *
 * A stacked cell is meaningless without its column name, and asking every
 * call site to repeat it on each `<Td>` would put the header in two places —
 * so the first person to add a column would ship rows labelled with the one
 * before it. The header is therefore read once, here, and handed to the
 * cells through context. Context needs a client boundary, which costs one
 * small module on the single server-rendered page that uses this; every
 * other consumer is already a client component.
 *
 * Labels are dropped entirely for any row whose cell count does not match
 * the header's. A row with a `colSpan`, or one cell short, would otherwise
 * be labelled with the wrong column — and a value under somebody else's
 * heading is worse than a value under none.
 */

/** The header's cells, in order, for the stacked layout to label with. */
const ColumnLabels = createContext<readonly ReactNode[]>([]);

/** The `<Th>` contents of a `head` row, or `[]` if it is not shaped like one. */
function headerLabels(head: ReactNode): ReactNode[] {
  if (!isValidElement<{ children?: ReactNode }>(head)) return [];
  return Children.map(head.props.children, (cell) =>
    isValidElement<{ children?: ReactNode }>(cell) ? cell.props.children : null,
  ) ?? [];
}

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
    // Only scrolls where it can still be a table. Below `lg` nothing
    // overflows, so an `overflow-x-auto` there would be a scroll container
    // that never scrolls — and one more thing swallowing a swipe.
    <div className="lg:overflow-x-auto">
      <table
        className="w-full text-sm max-lg:block lg:[min-width:var(--dt-min-width)]"
        // A custom property rather than `min-width` directly: an inline
        // `min-width` applies at every width, and the stacked layout has to
        // be allowed to be as narrow as the phone it is on.
        style={{ "--dt-min-width": `${minWidth}px` } as CSSProperties}
      >
        <thead className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-gray-500 max-lg:hidden">
          {head}
        </thead>
        <tbody className="divide-y divide-white/5 max-lg:block max-lg:divide-y-0">
          <ColumnLabels.Provider value={headerLabels(head)}>{children}</ColumnLabels.Provider>
        </tbody>
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
  const labels = useContext(ColumnLabels);
  /*
   * `Children.count` counts a `{condition && <Td/>}` that rendered nothing,
   * so a row with a conditional cell still lines up against the header —
   * and a row that genuinely has a different number of cells falls back to
   * no labels rather than to shifted ones.
   */
  const aligned = Children.count(children) === labels.length;

  return (
    <tr
      className={`hover:bg-white/[0.03] max-lg:mb-3 max-lg:block max-lg:rounded-lg max-lg:border max-lg:border-white/10 ${className}`}
    >
      {aligned
        ? Children.map(children, (child, i) =>
            // Only our own cells. A raw `<td>` dropped into a row would
            // reject a `label` prop straight into the DOM.
            isValidElement(child) && child.type === Td
              ? cloneElement(child as ReactElement<{ label?: ReactNode }>, { label: labels[i] })
              : child,
          )
        : children}
    </tr>
  );
}

export function Td({
  children,
  right,
  num,
  py = "py-4",
  className = "",
  label,
}: {
  children?: ReactNode;
  right?: boolean;
  num?: boolean;
  /** Vertical padding utility — override for airier rows (e.g. "py-6"). */
  py?: string;
  className?: string;
  /**
   * The column this cell is under, supplied by `Tr` from the table header.
   * Never passed by hand: it exists so the header is stated once.
   */
  label?: ReactNode;
}) {
  return (
    <td
      className={`px-4 ${py} ${right ? "text-right" : ""} ${
        num ? "whitespace-nowrap font-mono tabular-nums" : ""
      } max-lg:flex max-lg:items-baseline max-lg:justify-between max-lg:gap-4 max-lg:px-3.5 max-lg:py-2.5 max-lg:whitespace-normal ${className}`}
    >
      {label !== undefined && label !== null && label !== "" && (
        <span className="shrink-0 text-[11px] font-medium uppercase tracking-wider text-gray-500 lg:hidden">
          {label}
        </span>
      )}
      {/*
        * `contents` above `lg`, so the wrapper disappears and every cell
        * renders exactly as it did before this change. Below it, the value
        * is a block that can wrap and stay right-aligned beside its label.
        */}
      <span className="contents max-lg:block max-lg:min-w-0 max-lg:text-right">{children}</span>
    </td>
  );
}
