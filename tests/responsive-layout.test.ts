import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Two ways this app has already made itself unusable on a phone, guarded
 * mechanically rather than by asking people to remember.
 *
 * # Why source checks and not rendered ones
 *
 * `tests/e2e/mobile.spec.ts` measures the real thing at real device
 * viewports, and it is the test that proves the layout works. It is also
 * slow, needs a built app and a browser, and does not run on every commit.
 * These two are the cheap floor underneath it: they catch the specific
 * edits that would take the treatment away, in the second it takes to run
 * the unit suite, and they name the file and line that did it.
 *
 * The same shape as `tests/no-hardcoded-reference.test.ts`, which has caught
 * real regressions in this repo for exactly this reason.
 */

const ROOTS = ["app", "components"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx$/.test(name) ? [path] : [];
  });
}

/** Comments stripped, so a paragraph explaining a past mistake is not evidence of one. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const FILES = ROOTS.flatMap(sourceFiles);

describe("the data table stays usable on a phone", () => {
  const source = readFileSync("components/data-table.tsx", "utf8");

  /*
   * The state this file was in: one `overflow-x-auto` and a `minWidth`
   * defaulting to 720. On a 375px screen that is a third of a row at a
   * time, with the balance and the actions off the right-hand edge, inside
   * a page that scrolls vertically — so the swipe that would reveal them is
   * the one that scrolls past the table.
   */
  it("stacks rows into cards under a breakpoint instead of scrolling sideways", () => {
    // `display: block` down the tree is what turns a table into cards.
    expect(source, "the <table> must stop being a table below the breakpoint").toMatch(
      /max-lg:block/,
    );
    expect(source, "the header must be hidden where rows are stacked").toMatch(/max-lg:hidden/);
    expect(source, "rows must stack").toMatch(/max-lg:block[^"]*/);
    // And the cells become label/value lines rather than columns.
    expect(source).toMatch(/max-lg:flex/);
  });

  /*
   * `minWidth` is the reason the old layout could not reflow. Applied
   * unconditionally — as an inline `style={{ minWidth }}` was — it forces
   * the table wider than the phone at every width, and no amount of
   * `display: block` below it can help.
   */
  it("does not force a minimum width at the stacked size", () => {
    expect(code(source), "minWidth may not be an unconditional inline style").not.toMatch(
      /style=\{\{\s*minWidth\s*[},]/,
    );
    // It applies from `lg` up, where the table really is a table.
    expect(source).toMatch(/lg:\[min-width:var\(/);
  });

  /*
   * A stacked cell with no column name is a number with no meaning. The
   * labels have to come from the header — one statement of it — because a
   * second copy hand-written at each call site is a copy that goes stale
   * the first time somebody inserts a column.
   */
  it("labels stacked cells from the header rather than from each call site", () => {
    const stripped = code(source);
    expect(stripped, "the header's cells must be read into context").toContain("ColumnLabels");
    expect(stripped).toContain("headerLabels(head)");
    // And a row whose cells do not line up with the header gets no labels
    // at all — a value under the wrong heading is worse than under none.
    expect(stripped).toMatch(/Children\.count\(children\) === labels\.length/);
  });
});

describe("no grid is fixed at more than one column", () => {
  /**
   * Exempt, and only this. `NavMenu`'s panel lives inside
   * `<nav className="hidden … lg:flex">` in `components/top-nav.tsx`, so it
   * is never rendered below `lg` at all — below that the same destinations
   * are in `MobileNav`'s sheet, which is a list. A responsive prefix there
   * would be a variant that can never apply.
   *
   * Keyed by file *and* by the class text, so the exemption cannot quietly
   * cover a second grid added to the same file later.
   */
  const DESKTOP_ONLY = [
    { file: join("components", "top-nav.tsx"), grid: 'sections.length > 1 ? "grid-cols-2" : ""' },
  ];

  /** `grid-cols-2` … `grid-cols-12`, and any arbitrary `grid-cols-[…]`. */
  const FIXED_COLUMNS = /(?<![:-])grid-cols-(?:[2-9]|1[0-2]|\[[^\]]+\])/g;

  /** A responsive prefix on the same class list, at any breakpoint. */
  const HAS_RESPONSIVE = /\b(?:sm|md|lg|xl|2xl|max-sm|max-md|max-lg|min-\[)[^\s"'`]*grid-cols-/;

  /*
   * A multi-column grid with no breakpoint is two form fields at 150px
   * apiece on a phone, or two option cards whose explanatory text wraps to
   * four lines. The ad wizard shipped three of these and the ad-terms
   * dialog one — every one of them on a screen a merchant has to read
   * carefully before signing something.
   */
  it("declares a single-column fallback for every multi-column grid", () => {
    const offences: string[] = [];

    for (const file of FILES) {
      const source = code(readFileSync(file, "utf8"));
      for (const line of source.split("\n")) {
        if (!FIXED_COLUMNS.test(line)) continue;
        FIXED_COLUMNS.lastIndex = 0;
        if (HAS_RESPONSIVE.test(line)) continue;
        if (DESKTOP_ONLY.some((e) => file.endsWith(e.file) && line.includes(e.grid))) continue;
        offences.push(`${file}: ${line.trim()}`);
      }
    }

    expect(offences, "give these a grid-cols-1 base and a breakpoint prefix").toEqual([]);
  });

  /*
   * The guard above only sees a class list on one line. This one catches
   * the other way a table gets a fixed width: an inline `minWidth` on
   * something that is not `DataTable`, which is how the original problem
   * was written.
   */
  it("keeps table widths inside the one primitive that knows about them", () => {
    const offences = FILES.filter((file) => !file.endsWith(join("components", "data-table.tsx")))
      .filter((file) => /style=\{\{\s*minWidth/.test(code(readFileSync(file, "utf8"))));

    expect(offences, "pass minWidth to <DataTable>, which applies it from lg up").toEqual([]);
  });
});
