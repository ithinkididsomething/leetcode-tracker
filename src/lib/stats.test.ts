import { describe, expect, it } from "vitest";
import {
  addDays,
  buildHeatmap,
  computeStreak,
  dayKey,
  difficultyBreakdown,
  startOfWeek,
  topicBreakdown,
  weekTotal,
  weeklyBuckets,
  type SolvedRow,
} from "@/lib/stats";

const REF = new Date(2026, 8, 29); // Tue 29 Sep 2026, local time

function row(dayOffset: number, difficulty = "EASY", topics: string[] = []): SolvedRow {
  return {
    solvedAt: addDays(REF, dayOffset),
    difficulty,
    topics: JSON.stringify(topics),
  };
}

describe("dayKey", () => {
  it("uses local calendar date, not UTC", () => {
    // 23:30 local on 29 Sep must not roll forward to 30 Sep.
    const late = new Date(2026, 8, 29, 23, 30);
    expect(dayKey(late)).toBe("2026-09-29");
    const early = new Date(2026, 8, 30, 0, 30);
    expect(dayKey(early)).toBe("2026-09-30");
  });
});

describe("startOfWeek", () => {
  it("starts weeks on Monday", () => {
    expect(dayKey(startOfWeek(REF))).toBe("2026-09-28"); // Mon
    expect(dayKey(startOfWeek(new Date(2026, 8, 27)))).toBe("2026-09-21"); // Sun -> prior Mon
  });
});

describe("weeklyBuckets", () => {
  it("always returns 7 days starting Monday", () => {
    const b = weeklyBuckets([], REF);
    expect(b).toHaveLength(7);
    expect(b[0].label).toBe("Mon");
    expect(b[6].label).toBe("Sun");
    expect(dayKey(b[0].date)).toBe("2026-09-28");
  });

  it("buckets rows into the right day and totals them", () => {
    // REF is Tue 29 Sep, so row(-1) is Mon 28 and row(0) is Tue 29.
    const b = weeklyBuckets([row(-1), row(-1), row(0)], REF);
    expect(weekTotal(b)).toBe(3);
    expect(b[0].count).toBe(2); // Mon
    expect(b[1].count).toBe(1); // Tue
    expect(b[2].count).toBe(0); // Wed
  });

  it("excludes rows outside the week", () => {
    const b = weeklyBuckets([row(-30), row(0)], REF);
    expect(weekTotal(b)).toBe(1);
  });
});

describe("computeStreak", () => {
  it("is zero with no data", () => {
    expect(computeStreak([], REF)).toEqual({
      current: 0,
      longest: 0,
      activeToday: false,
    });
  });

  it("counts consecutive days ending today", () => {
    const r = computeStreak([row(0), row(-1), row(-2)], REF);
    expect(r.current).toBe(3);
    expect(r.activeToday).toBe(true);
  });

  it("keeps the streak alive when today is not yet active", () => {
    const r = computeStreak([row(-1), row(-2)], REF);
    expect(r.current).toBe(2);
    expect(r.activeToday).toBe(false);
  });

  it("breaks after a full inactive day", () => {
    const r = computeStreak([row(-2), row(-3)], REF);
    expect(r.current).toBe(0);
  });

  it("finds the longest run anywhere in history", () => {
    // A 3-day run last month plus a 2-day run ending today.
    const r = computeStreak([row(-30), row(-29), row(-28), row(-1), row(0)], REF);
    expect(r.current).toBe(2);
    expect(r.longest).toBe(3);
  });

  it("does not count two solves on one day as a two-day streak", () => {
    const r = computeStreak([row(0), row(0), row(0)], REF);
    expect(r.current).toBe(1);
    expect(r.longest).toBe(1);
  });

  it("spans a month boundary correctly", () => {
    const end = new Date(2026, 2, 2); // Mon 2 Mar 2026
    const r = computeStreak(
      [
        { solvedAt: new Date(2026, 1, 27), difficulty: "EASY", topics: "[]" }, // Fri 27 Feb
        { solvedAt: new Date(2026, 1, 28), difficulty: "EASY", topics: "[]" }, // Sat 28 Feb
        { solvedAt: new Date(2026, 2, 1), difficulty: "EASY", topics: "[]" }, // Sun 1 Mar
        { solvedAt: end, difficulty: "EASY", topics: "[]" },
      ],
      end,
    );
    expect(r.current).toBe(4);
  });
});

describe("difficultyBreakdown", () => {
  it("splits by difficulty with percentages", () => {
    const out = difficultyBreakdown([
      row(0, "EASY"),
      row(-1, "EASY"),
      row(-2, "MEDIUM"),
      row(-3, "HARD"),
    ]);
    expect(out.map((d) => d.difficulty)).toEqual(["EASY", "MEDIUM", "HARD"]);
    expect(out.map((d) => d.count)).toEqual([2, 1, 1]);
    expect(out.map((d) => d.pct)).toEqual([50, 25, 25]);
  });

  it("ignores unknown difficulty values", () => {
    const out = difficultyBreakdown([row(0, "SUPER_EASY")]);
    expect(out.reduce((s, d) => s + d.count, 0)).toBe(0);
    expect(out[0].pct).toBe(0);
  });

  it("avoids divide-by-zero on empty input", () => {
    expect(difficultyBreakdown([]).every((d) => d.pct === 0)).toBe(true);
  });
});

describe("topicBreakdown", () => {
  it("ranks topics and caps the result", () => {
    const out = topicBreakdown(
      [
        row(0, "EASY", ["Array", "Hash Table"]),
        row(-1, "MEDIUM", ["Array", "Dynamic Programming"]),
        row(-2, "HARD", ["Array"]),
      ],
      2,
    );
    expect(out).toEqual([
      { topic: "Array", count: 3 },
      { topic: "Dynamic Programming", count: 1 },
    ]);
  });

  it("survives malformed topic JSON", () => {
    const out = topicBreakdown([
      { solvedAt: REF, difficulty: "EASY", topics: "not json" },
    ]);
    expect(out).toEqual([]);
  });
});

describe("buildHeatmap", () => {
  it("builds the requested number of week columns", () => {
    const h = buildHeatmap([], 26, REF);
    expect(h.weeks).toHaveLength(26);
    expect(h.weeks.every((w) => w.days.length === 7)).toBe(true);
  });

  it("reports the max daily count for scaling", () => {
    const h = buildHeatmap([row(0), row(0), row(0), row(-3), row(-3)], 26, REF);
    expect(h.max).toBe(3);
  });

  it("blanks out future days", () => {
    const h = buildHeatmap([], 26, REF);
    const lastWeek = h.weeks[h.weeks.length - 1];
    const saturday = lastWeek.days[5];
    expect(saturday.count).toBe(0);
    expect(new Date(saturday.key).getTime()).toBeGreaterThan(REF.getTime());
  });
});
