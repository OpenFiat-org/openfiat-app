import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/node-endpoint", () => ({ nodeUrl: () => "https://node.example" }));

const { meanStars, toLiveReviews } = await import("@/lib/live-reviews");

/**
 * Reviews replaced the most dangerous fixture in this app: eight paragraphs
 * of invented testimony attributed to strangers, on the page a reader opens
 * to decide whether to send money to one. Prose is the one thing on a
 * merchant profile that cannot be checked against anything else.
 *
 * These tests are about the mapping and about what the shape refuses to
 * carry. The redaction itself is the node's — `PublicReview` names no author
 * and no settlement, and truncates the timestamp to the day — and the point
 * here is that nothing on this side puts any of it back.
 */
const REVIEW = {
  about: "12D3KooWHSjonqZMAHmZKzSYgTsPdJ1UrxCYcKTBy4BfbUhU3Qmj",
  rating: "Four" as const,
  comment: "Released quickly once the reference matched.",
  created_on: 1_785_500_000_000,
};

describe("toLiveReviews", () => {
  it("turns the wire's rating word into a star count", () => {
    const [one] = toLiveReviews([{ ...REVIEW, rating: "One" }]);
    const [five] = toLiveReviews([{ ...REVIEW, rating: "Five" }]);
    expect(one!.stars).toBe(1);
    expect(five!.stars).toBe(5);
  });

  it("drops a rating off the protocol's scale rather than coercing one", () => {
    // `Rating::from_stars` is the only constructor and refuses anything
    // outside 1-5, so a sixth word means this app and that node disagree
    // about the type. Picking a number for it would put an invented score
    // under somebody's name — which is the exact failure this module exists
    // to end.
    const rows = toLiveReviews([
      { ...REVIEW, rating: "Six" as unknown as typeof REVIEW.rating },
      REVIEW,
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.stars).toBe(4);
  });

  it("carries no author and no settlement, because the node publishes neither", () => {
    // Both parties may review the same trade, so an author or a settlement id
    // would pair two rows and rebuild the counterparty graph the protocol
    // withholds. A field here would be this app inventing one.
    const [row] = toLiveReviews([REVIEW]);
    expect(Object.keys(row!).sort()).toEqual(["about", "comment", "createdOn", "stars"]);
  });

  it("keeps an empty comment as a rating with no words", () => {
    // A star with no prose is a real review, and dropping it would understate
    // how many people rated a merchant.
    const rows = toLiveReviews([{ ...REVIEW, comment: "" }]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.comment).toBe("");
  });
});

describe("meanStars", () => {
  it("is null when nobody has reviewed, rather than zero", () => {
    // Zero out of five is a damning claim. "Nobody has said anything" is the
    // truth, and the two must not render alike.
    expect(meanStars([])).toBeNull();
  });

  it("averages the ratings present", () => {
    const rows = toLiveReviews([
      { ...REVIEW, rating: "Five" },
      { ...REVIEW, rating: "Three" },
    ]);
    expect(meanStars(rows)).toBe(4);
  });
});
