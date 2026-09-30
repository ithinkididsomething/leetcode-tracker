export type Difficulty = "EASY" | "MEDIUM" | "HARD";

export type SolvedRow = {
  solvedAt: Date;
  difficulty: string;
  topics: string;
};

export type DayBucket = {
  key: string;
  label: string;
  date: Date;
  count: number;
};

/** Local-timezone YYYY-MM-DD. Avoids toISOString(), which shifts to UTC. */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Monday-based start of week, matching how LeetCode numbers contest weeks. */
export function startOfWeek(d: Date): Date {
  const day = startOfDay(d);
  const shift = (day.getDay() + 6) % 7;
  day.setDate(day.getDate() - shift);
  return day;
}

/**
 * Works out which manually entered solves a fresh sync makes redundant.
 *
 * A manual row stands in for a solve LeetCode has now reported for real. It is
 * only redundant when both refer to the same problem on the same local day: a
 * genuine re-solve on a different day is a separate solve and must survive.
 *
 * Pure, so it lives here rather than in sync.ts, which cannot be imported from
 * a test because of its server-only dependency.
 */
export function supersededManualIds(
  manual: { id: string; titleSlug: string; solvedAt: Date }[],
  fresh: { titleSlug: string; at: Date }[],
): string[] {
  const realDays = new Map<string, Set<string>>();
  for (const s of fresh) {
    const days = realDays.get(s.titleSlug) ?? new Set<string>();
    days.add(dayKey(s.at));
    realDays.set(s.titleSlug, days);
  }
  return manual
    .filter((m) => realDays.get(m.titleSlug)?.has(dayKey(m.solvedAt)))
    .map((m) => m.id);
}

export function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

function countByDay(rows: SolvedRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows) {
    const key = dayKey(r.solvedAt);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

/** One bucket per day across the 7 days of the week containing `ref`. */
export function weeklyBuckets(rows: SolvedRow[], ref = new Date()): DayBucket[] {
  const start = startOfWeek(ref);
  const byDay = countByDay(rows);
  const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    const key = dayKey(date);
    return { key, label: names[i], date, count: byDay.get(key) ?? 0 };
  });
}

export function weekTotal(buckets: DayBucket[]): number {
  return buckets.reduce((sum, b) => sum + b.count, 0);
}

export type StreakResult = {
  current: number;
  longest: number;
  activeToday: boolean;
};

/**
 * Consecutive active days ending today.
 *
 * Today not being active yet does not break the streak: we allow the run to
 * start at yesterday, so someone who has not opened LeetCode yet today still
 * sees their streak intact until they actually go a full day without solving.
 */
export function computeStreak(
  rows: SolvedRow[],
  ref = new Date(),
): StreakResult {
  const active = countByDay(rows);
  if (active.size === 0) return { current: 0, longest: 0, activeToday: false };

  const today = startOfDay(ref);
  const activeToday = active.has(dayKey(today)) ?? false;

  let current = 0;
  let cursor = activeToday ? today : addDays(today, -1);
  while (active.has(dayKey(cursor))) {
    current += 1;
    cursor = addDays(cursor, -1);
  }

  const sorted = [...active.keys()].sort();
  let longest = 0;
  let run = 0;
  let prev: Date | null = null;

  for (const key of sorted) {
    const [y, m, d] = key.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    if (prev && dayKey(addDays(prev, 1)) === key) {
      run += 1;
    } else {
      run = 1;
    }
    longest = Math.max(longest, run);
    prev = date;
  }

  return { current, longest, activeToday };
}

export type DifficultySlice = {
  difficulty: Difficulty;
  label: string;
  count: number;
  pct: number;
};

const DIFFICULTY_ORDER: { value: Difficulty; label: string }[] = [
  { value: "EASY", label: "Easy" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HARD", label: "Hard" },
];

export function difficultyBreakdown(rows: SolvedRow[]): DifficultySlice[] {
  const counts: Record<Difficulty, number> = { EASY: 0, MEDIUM: 0, HARD: 0 };
  let total = 0;

  for (const r of rows) {
    const key = r.difficulty?.toUpperCase() as Difficulty;
    if (key in counts) {
      counts[key] += 1;
      total += 1;
    }
  }

  return DIFFICULTY_ORDER.map(({ value, label }) => ({
    difficulty: value,
    label,
    count: counts[value],
    pct: total === 0 ? 0 : Math.round((counts[value] / total) * 100),
  }));
}

export type TopicCount = { topic: string; count: number };

/**
 * Topic tallies over the same rows. Each solved problem contributes to every
 * one of its topic tags, so these counts intentionally sum to more than the
 * number of problems.
 */
export function topicBreakdown(rows: SolvedRow[], limit = 10): TopicCount[] {
  const counts = new Map<string, number>();

  for (const r of rows) {
    let topics: string[] = [];
    try {
      const parsed: unknown = JSON.parse(r.topics || "[]");
      if (Array.isArray(parsed)) topics = parsed.filter((t) => typeof t === "string");
    } catch {
      topics = [];
    }
    for (const t of topics) counts.set(t, (counts.get(t) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic))
    .slice(0, limit);
}

export type Heatmap = {
  weeks: { key: string; days: { key: string; count: number }[] }[];
  max: number;
};

/** GitHub-style calendar grid: columns are weeks, rows are Mon..Sun. */
export function buildHeatmap(
  rows: SolvedRow[],
  weeks = 26,
  ref = new Date(),
): Heatmap {
  const byDay = countByDay(rows);
  const thisWeek = startOfWeek(ref);
  const firstWeek = addDays(thisWeek, -(weeks - 1) * 7);

  let max = 0;
  const grid = Array.from({ length: weeks }, (_, w) => {
    const weekStart = addDays(firstWeek, w * 7);
    const days = Array.from({ length: 7 }, (_, d) => {
      const date = addDays(weekStart, d);
      const key = dayKey(date);
      const count = byDay.get(key) ?? 0;
      if (date > startOfDay(ref)) return { key, count: 0 };
      if (count > max) max = count;
      return { key, count };
    });
    return { key: dayKey(weekStart), days };
  });

  return { weeks: grid, max };
}
