"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DayBucket, DifficultySlice } from "@/lib/stats";

const DIFFICULTY_COLOR: Record<string, string> = {
  EASY: "#22c55e",
  MEDIUM: "#f59e0b",
  HARD: "#ef4444",
};

function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Resolves "today" only after mount.
 *
 * Reading the clock during render makes the server's HTML depend on when it
 * happened to render, so a request served at 23:59:59 and hydrated a second
 * later produces two different values and React reports a hydration mismatch.
 * Starting as null and filling it in afterwards keeps the first client render
 * identical to the server's, and still updates if the tab is left open past
 * midnight.
 */
function useTodayKey(): string | null {
  const [key, setKey] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setKey(localDayKey(new Date()));
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, []);

  return key;
}

export function WeeklyChart({ buckets }: { buckets: DayBucket[] }) {
  const todayKey = useTodayKey();

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={buckets} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} width={40} />
          <Tooltip
            cursor={{ fill: "#f3f4f6" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const b = payload[0].payload as DayBucket;
              return (
                <div className="rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-xs shadow-lg">
                  <p className="font-medium">
                    {b.label} {b.date.toLocaleDateString()}
                  </p>
                  <p className="text-ink-600">
                    {b.count} {b.count === 1 ? "problem" : "problems"}
                  </p>
                </div>
              );
            }}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={44}>
            {buckets.map((b) => (
              <Cell
                key={b.key}
                fill={b.key === todayKey ? "#2563eb" : "#93c5fd"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DifficultyChart({ slices }: { slices: DifficultySlice[] }) {
  const withData = slices.filter((s) => s.count > 0);

  if (withData.length === 0) {
    return <p className="py-10 text-center text-sm text-ink-600">No problems yet.</p>;
  }

  return (
    <div>
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={withData}
              dataKey="count"
              nameKey="label"
              innerRadius={44}
              outerRadius={68}
              paddingAngle={2}
            >
              {withData.map((s) => (
                <Cell key={s.difficulty} fill={DIFFICULTY_COLOR[s.difficulty]} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0];
                return (
                  <div className="rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-xs shadow-lg">
                    <p className="font-medium">{p.name}</p>
                    <p className="text-ink-600">
                      {p.value} problems ({p.payload.pct}%)
                    </p>
                  </div>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 space-y-1.5">
        {slices.map((s) => (
          <li key={s.difficulty} className="flex items-center gap-2 text-sm">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-black/10"
              style={{ backgroundColor: DIFFICULTY_COLOR[s.difficulty] }}
            />
            <span className="text-ink-600">{s.label}</span>
            <span className="ml-auto font-medium tabular-nums">{s.count}</span>
            <span className="w-9 text-right text-xs text-ink-500 tabular-nums">
              {s.pct}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
