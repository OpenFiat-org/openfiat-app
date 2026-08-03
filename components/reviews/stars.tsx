/**
 * A 1-5 rating, drawn.
 *
 * Always five glyphs, filled and unfilled, so the scale is visible rather
 * than inferred from a count — three stars beside nothing reads as "three
 * out of three" at a glance. The accessible label spells it out, because
 * the glyphs carry the whole meaning and a screen reader would otherwise
 * announce a row of black stars.
 */
export function Stars({ stars }: { stars: number }) {
  return (
    <span className="text-sm text-amber-300" aria-label={`${stars} of 5 stars`}>
      {"★".repeat(stars)}
      <span className="text-gray-700">{"★".repeat(Math.max(0, 5 - stars))}</span>
    </span>
  );
}
