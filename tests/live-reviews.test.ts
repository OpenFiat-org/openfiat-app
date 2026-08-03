import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/node-endpoint", () => ({ nodeUrl: () => "https://node.example" }));

const { meanStars, myReviewOf, toLiveReviews, toMyReviews } = await import("@/lib/live-reviews");

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
  rating: 4,
  comment: "Released quickly once the reference matched.",
  created_on: 1_785_500_000_000,
};

describe("toLiveReviews", () => {
  /**
   * The regression this file exists to pin. `rating` was typed as one of
   * five English words — the Rust enum's variant names — and the wire
   * carries the integer, because `Rating` has a hand-written
   * `serialize_u8` and `openfiat-reviews` pins it with a test of its own.
   * Every real row therefore failed the lookup and was dropped as
   * off-scale, so every merchant profile reported "no reviews of this
   * wallet on this node" however many there were, and nothing threw.
   */
  it("reads the rating as the integer the node actually sends", () => {
    const [one] = toLiveReviews([{ ...REVIEW, rating: 1 }]);
    const [five] = toLiveReviews([{ ...REVIEW, rating: 5 }]);
    expect(one!.stars).toBe(1);
    expect(five!.stars).toBe(5);
  });

  it("drops a rating off the protocol's scale rather than coercing one", () => {
    // `Rating::from_stars` is the only constructor and refuses anything
    // outside 1-5, so a 6 means this app and that node disagree about the
    // type. Picking a number for it would put an invented score under
    // somebody's name — the exact failure this module exists to end.
    const rows = toLiveReviews([
      { ...REVIEW, rating: 6 },
      { ...REVIEW, rating: 0 },
      { ...REVIEW, rating: 4.5 },
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
      { ...REVIEW, rating: 5 },
      { ...REVIEW, rating: 3 },
    ]);
    expect(meanStars(rows)).toBe(4);
  });
});

const BUYER = "12D3KooWCLYiKugKhpEhTBxUQgK7MngjdNz7kwXi3PfRuTK4GdDV";
const SELLER = "12D3KooWPQBF5odpFxVoDqWHpuAmKqD6cANzd6kTsqt4rBJTNrPU";

const MINE = {
  id: `s-1:${BUYER}`,
  settlement: "s-1",
  author: BUYER,
  about: SELLER,
  rating: 5,
  comment: "Fast.",
  created_at: 1_785_794_599_939,
};

describe("toMyReviews", () => {
  it("keeps the author, the settlement and the moment the public feed drops", () => {
    // The whole reason this second read exists: a party is entitled to the
    // record they were present for, and it is the only place the settlement
    // id appears at all.
    const [row] = toMyReviews([MINE]);
    expect(row!.author).toBe(BUYER);
    expect(row!.settlement).toBe("s-1");
    expect(row!.createdAt).toBe(MINE.created_at);
  });

  it("applies the same scale check as the public read", () => {
    expect(toMyReviews([{ ...MINE, rating: 9 }])).toEqual([]);
  });
});

describe("myReviewOf", () => {
  it("matches on the author as well as the trade", () => {
    // Both parties may review the same trade, so matching the settlement
    // alone would show one party the other's review as their own — and then
    // offer to "replace" it.
    const rows = toMyReviews([MINE, { ...MINE, id: `s-1:${SELLER}`, author: SELLER, about: BUYER }]);
    expect(myReviewOf(rows, "s-1", BUYER)!.author).toBe(BUYER);
    expect(myReviewOf(rows, "s-1", SELLER)!.author).toBe(SELLER);
  });

  it("is null before the gated read has been taken, rather than 'not reviewed'", () => {
    // `null` here is "we have not asked", and the form must not read it as
    // "you have not reviewed this" — that would offer a second review of a
    // trade already reviewed.
    expect(myReviewOf(null, "s-1", BUYER)).toBeNull();
    expect(myReviewOf(toMyReviews([MINE]), "s-1", null)).toBeNull();
  });
});
