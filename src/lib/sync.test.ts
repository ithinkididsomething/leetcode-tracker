import { describe, expect, it } from "vitest";
import { supersededManualIds } from "@/lib/stats";

/**
 * A manual row is only redundant when a real submission exists for the same
 * problem on the same local calendar day. Anything else is a distinct solve and
 * must survive, or a genuine re-solve would silently vanish from the history.
 */
const d = (y: number, m: number, day: number, h = 12) => new Date(y, m - 1, day, h);

describe("supersededManualIds", () => {
  it("drops a manual row when the real solve lands on the same day", () => {
    const manual = [{ id: "manual:1", titleSlug: "two-sum", solvedAt: d(2026, 9, 30) }];
    const fresh = [{ titleSlug: "two-sum", at: d(2026, 9, 30, 21) }];
    expect(supersededManualIds(manual, fresh)).toEqual(["manual:1"]);
  });

  it("keeps a manual row when the real solve is on a different day", () => {
    const manual = [{ id: "manual:1", titleSlug: "two-sum", solvedAt: d(2026, 9, 30) }];
    const fresh = [{ titleSlug: "two-sum", at: d(2026, 9, 29, 23) }];
    expect(supersededManualIds(manual, fresh)).toEqual([]);
  });

  it("keeps a genuine re-solve that the admin logged on another day", () => {
    const manual = [
      { id: "manual:1", titleSlug: "lru-cache", solvedAt: d(2026, 9, 28) },
      { id: "manual:2", titleSlug: "lru-cache", solvedAt: d(2026, 9, 30) },
    ];
    // Only the 30th is confirmed by LeetCode; the 28th stands on its own.
    const fresh = [{ titleSlug: "lru-cache", at: d(2026, 9, 30, 8) }];
    expect(supersededManualIds(manual, fresh)).toEqual(["manual:2"]);
  });

  it("ignores manual rows for problems LeetCode did not mention", () => {
    const manual = [{ id: "manual:1", titleSlug: "median-of-two-sorted", solvedAt: d(2026, 9, 30) }];
    const fresh = [{ titleSlug: "two-sum", at: d(2026, 9, 30) }];
    expect(supersededManualIds(manual, fresh)).toEqual([]);
  });

  it("handles one real submission confirming several manual rows on that day", () => {
    const manual = [
      { id: "manual:1", titleSlug: "two-sum", solvedAt: d(2026, 9, 30, 1) },
      { id: "manual:2", titleSlug: "two-sum", solvedAt: d(2026, 9, 30, 22) },
      { id: "manual:3", titleSlug: "two-sum", solvedAt: d(2026, 9, 20) },
    ];
    const fresh = [{ titleSlug: "two-sum", at: d(2026, 9, 30, 14) }];
    expect(supersededManualIds(manual, fresh)).toEqual(["manual:1", "manual:2"]);
  });

  it("matches on local day, not UTC day, across a late-evening boundary", () => {
    // 23:30 local on the 30th must not be treated as the 31st, which is what a
    // toISOString() comparison would do east of UTC.
    const manual = [{ id: "manual:1", titleSlug: "valid-parentheses", solvedAt: d(2026, 9, 30, 23) }];
    const fresh = [{ titleSlug: "valid-parentheses", at: d(2026, 9, 30, 23) }];
    expect(supersededManualIds(manual, fresh)).toEqual(["manual:1"]);
  });

  it("returns nothing when there is nothing to reconcile", () => {
    expect(supersededManualIds([], [{ titleSlug: "two-sum", at: d(2026, 9, 30) }])).toEqual([]);
    expect(supersededManualIds([{ id: "manual:1", titleSlug: "x", solvedAt: d(2026, 9, 30) }], [])).toEqual([]);
  });
});